import {expect, test} from '@playwright/test';
import {existsSync, readFileSync, mkdirSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';

// Synthetic local stack only. Questions use the real endpoint; no POST is mocked.
const endpoint = '/photography/api/analytics/intelligence';
const scope = {kind: 'gallery', query: {start: '2026-09-27', end: '2026-09-27', measure: 'photo_opens', scope: 'album', albumKeys: ['alpha'], compare: 'none', traffic: 'conservative'}};
const question = 'Is this zero activity, missing history, or unavailable evidence?';
const cookiePath = '.temp/analytics-parent-local-cookies.json';
const runtimePath = '.temp/analytics-local-rehearsal/runtime.json';

test('report questions preserve origin and owner gates', async ({request, baseURL}) => {
	const origin = new URL(baseURL!).origin;
	for (const text of [question, 'Why do Cloudflare and the site counts differ?', 'Did this album receive more attention at the same age after publication?', 'Does this download number mean requests or completed transfers?']) {
		const response = await request.post(endpoint, {headers: {origin}, data: {scope, question: text}});
		expect(response.status()).toBe(403);
	}
	const response = await request.post(endpoint, {headers: {origin: 'https://example.invalid'}, data: {scope, question}});
	expect(response.status()).toBe(403);
});

test('owner answers match the underlying gallery report and do not queue jobs', async ({request, baseURL}) => {
	test.skip(!existsSync(cookiePath) || !existsSync(runtimePath), 'requires the local synthetic owner');
	const runtime = JSON.parse(readFileSync(runtimePath, 'utf8'));
	expect(new URL(runtime.API_URL).hostname).toBe('127.0.0.1');
	const client = createClient(runtime.API_URL, runtime.SERVICE_ROLE_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
	const {data, error} = await client.rpc('analytics_read_scheduled_gallery_report', {p_start: scope.query.start, p_end: scope.query.end, p_measure: scope.query.measure, p_scope: 'album', p_album_keys: ['alpha'], p_traffic: 'conservative', p_compare: 'none', p_public_only: true, p_include_today: false, p_photo_page: 0, p_photo_page_size: 1, p_photo_rank: 'popular', p_export: false});
	expect(error).toBeNull();
	expect(data.coverage).toBe('complete');
	const jar = JSON.parse(readFileSync(cookiePath, 'utf8')) as Array<{name: string; value: string}>;
	const headers = {origin: new URL(baseURL!).origin, cookie: jar.map(c => `${c.name}=${c.value}`).join('; ')};
	const before = await client.from('analytics_intelligence_requests').select('id', {count: 'exact', head: true});
	const response = await request.post(endpoint, {headers, data: {scope, question}});
	expect(response.status()).toBe(200);
	expect(response.headers()['cache-control']).toBe('no-store');
	const answer = await response.json();
	expect(answer.status).toBe('complete');
	expect(answer.summary).toContain(`recorded ${data.total} photo opens`);
	expect(answer.requestId).toBeUndefined();
	for (const text of ['Did this album receive more attention at the same age after publication?', 'Does this download number mean requests or completed transfers?']) {
		const result = await request.post(endpoint, {headers, data: {scope, question: text}});
		expect(result.status()).toBe(200);
		expect((await result.json()).requestId).toBeUndefined();
	}
	const counts = await request.post(endpoint, {headers, data: {scope: {kind: 'sites', period: 7, section: 'all'}, question: 'Why do Cloudflare and the site counts differ?'}});
	expect(counts.status()).toBe(200);
	const countsAnswer = await counts.json();
	expect(countsAnswer.status).toBe('unavailable'); // The local fixture has no Cloudflare credential.
	expect(countsAnswer.summary).toContain('not compared');
	const after = await client.from('analytics_intelligence_requests').select('id', {count: 'exact', head: true});
	expect(before.error).toBeNull();
	expect(after.error).toBeNull();
	expect(after.count).toBe(before.count);
});

test('excluding an unlisted album never becomes a public-only false zero', async ({request, baseURL}) => {
	test.skip(!existsSync(cookiePath) || !existsSync(runtimePath), 'requires the local synthetic owner');
	const runtime = JSON.parse(readFileSync(runtimePath, 'utf8'));
	expect(new URL(runtime.API_URL).hostname).toBe('127.0.0.1');
	const client = createClient(runtime.API_URL, runtime.SERVICE_ROLE_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
	const privateScope = {...scope, query: {...scope.query, albumKeys: ['beta'], measure: 'album_opens'}};
	const args = {p_start: scope.query.start, p_end: scope.query.end, p_measure: 'album_opens', p_scope: 'album', p_album_keys: ['beta'], p_traffic: 'conservative', p_compare: 'none', p_include_today: false, p_photo_page: 0, p_photo_page_size: 1, p_photo_rank: 'popular', p_export: false};
	const publicReport = await client.rpc('analytics_read_scheduled_gallery_report', {...args, p_public_only: true});
	const ownerReport = await client.rpc('analytics_read_scheduled_gallery_report', {...args, p_public_only: false});
	expect(publicReport.error).toBeNull();
	expect(ownerReport.error).toBeNull();
	expect(publicReport.data.total).toBe(0);
	expect(ownerReport.data.coverage).toBe('complete');
	expect(ownerReport.data.total).toBeGreaterThan(0);
	const jar = JSON.parse(readFileSync(cookiePath, 'utf8')) as Array<{name: string; value: string}>;
	const response = await request.post(endpoint, {headers: {origin: new URL(baseURL!).origin, cookie: jar.map(c => `${c.name}=${c.value}`).join('; ')}, data: {scope: privateScope, question}});
	expect(response.status()).toBe(200);
	const answer = await response.json();
	expect(answer.status).toBe('unavailable');
	expect(answer.summary).toContain('unlisted');
	expect(answer.summary).not.toContain('recorded 0');
	expect(answer.evidenceLinks).toContain('/analytics/albums/beta');
	const anonymous = await request.post(endpoint, {headers: {origin: new URL(baseURL!).origin}, data: {scope: privateScope, question}});
	expect(anonymous.status()).toBe(403);
});

for (const width of [1280, 390]) test(`real answer and source links render at ${width}px`, async ({page}) => {
	test.skip(!existsSync(cookiePath), 'requires the local synthetic owner');
	await page.setViewportSize({width, height: 900});
	const jar = JSON.parse(readFileSync(cookiePath, 'utf8')) as Array<{name: string; value: string}>;
	await page.context().addCookies(jar.map(c => ({...c, domain: '127.0.0.1', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' as const})));
	// The fixture has no saved findings. Expose the existing panel, and supply only
	// its GET snapshot; every question still goes through the authenticated server.
	await page.route(/\/analytics\/albums\/alpha(\?|$)/, async route => {
		if (route.request().resourceType() !== 'document') return route.continue();
		const response = await route.fetch();
		return route.fulfill({response, body: (await response.text()).replace(/intelligence:"(none|record)"/, 'intelligence:"report"')});
	});
	await page.route('**/api/analytics/intelligence**', async route => {
		if (route.request().method() !== 'GET' || new URL(route.request().url()).pathname !== endpoint) return route.continue();
		const requestedScope = JSON.parse(new URL(route.request().url()).searchParams.get('scope')!);
		return route.fulfill({json: {scope: requestedScope, generatedAt: new Date().toISOString(), cutoff: null, coverage: 'complete', findings: [], suppressions: [], actions: [], briefs: [], page: 0, pageCount: 1, owner: true}});
	});
	await page.goto('/photography/analytics/albums/alpha');
	await page.getByLabel('Ask about this report').fill('Does this download number mean requests or completed transfers?');
	await page.getByRole('button', {name: 'Ask owner question'}).click();
	await expect(page.locator('.answer')).toContainText('requests, not completed transfers');
	await expect(page.locator('.answer').getByRole('link', {name: 'Open data notes'})).toHaveAttribute('href', /\/analytics\/data/);
	await page.getByLabel('Ask about this report').fill(question);
	await page.getByRole('button', {name: 'Ask owner question'}).click();
	await expect(page.locator('.answer')).toContainText('photo opens');
	await expect(page.locator('.answer').getByRole('link', {name: 'Open source report'})).toHaveAttribute('href', /albums=alpha/);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
	const panel = page.locator('.answer');
	await panel.evaluate(element => {const label = document.createElement('p'); label.textContent = 'Synthetic local report — every number here is invented; do not quote it.'; element.prepend(label);});
	mkdirSync('.temp/question-review', {recursive: true});
	await page.locator('.answer').screenshot({path: `.temp/question-review/answer-${width}.png`});
	await page.screenshot({path: `.temp/question-review/screen-${width}.png`});
});
