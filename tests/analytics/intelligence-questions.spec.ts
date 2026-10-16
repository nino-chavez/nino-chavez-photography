import {expect, test, type Page, type Locator} from '@playwright/test';
import {existsSync, readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';

// Synthetic local stack only. Questions use the real endpoint; no POST is mocked.
const endpoint = '/photography/api/analytics/intelligence';
const scope = {kind: 'gallery', query: {start: '2026-09-27', end: '2026-09-27', measure: 'photo_opens', scope: 'album', albumKeys: ['alpha'], compare: 'none', traffic: 'conservative'}};
const question = 'Is this zero activity, missing history, or unavailable evidence?';
const cookiePath = '.temp/analytics-parent-local-cookies.json';
const runtimePath = '.temp/analytics-local-rehearsal/runtime.json';

test.beforeAll(async () => {
	if (!existsSync(runtimePath)) return;
	const runtime = JSON.parse(readFileSync(runtimePath, 'utf8'));
	expect(new URL(runtime.API_URL).hostname).toBe('127.0.0.1');
	let jar: Array<{name: string; value: string}> = [];
	const client = createServerClient(runtime.API_URL, runtime.ANON_KEY, {cookies: {getAll: () => jar, setAll: cookies => { jar = cookies; }}});
	const {error} = await client.auth.signInWithPassword({email: 'analytics-operator@example.test', password: 'synthetic-only-password'});
	expect(error).toBeNull();
	writeFileSync(cookiePath, JSON.stringify(jar), {mode: 0o600});
});

test('report questions preserve origin and owner gates', async ({request, baseURL}) => {
	const origin = new URL(baseURL!).origin;
	for (const text of [question, 'Why do Cloudflare and the site counts differ?', 'Did this album receive more attention at the same age after publication?', 'Does this download number mean requests or completed transfers?', 'What changed this week?', 'How much revenue did this album earn?']) {
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
	for (const [question, status] of [['What changed this week?', 'clarification'], ['How much revenue did this album earn?', 'unsupported']]) {
		const response = await request.post(endpoint, {headers, data: {scope, question}});
		expect(response.status()).toBe(200);
		expect(response.headers()['cache-control']).toBe('no-store');
		const answer = await response.json();
		expect(answer.status).toBe(status);
		expect(answer.requestId).toBeUndefined();
		expect(answer.suggestions.length).toBeGreaterThan(0);
	}
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

async function signIn(page: Page) {
	test.skip(!existsSync(cookiePath), 'requires the local synthetic owner');
	const jar = JSON.parse(readFileSync(cookiePath, 'utf8')) as Array<{name: string; value: string}>;
	await page.context().addCookies(jar.map(c => ({...c, domain: '127.0.0.1', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' as const})));
}

async function activate(control: Locator, width: number) {
	if (width === 390) await control.tap();
	else await control.click();
}

async function askFromPage(page: Page, control: Locator, width: number) {
	const response = page.waitForResponse(r => new URL(r.url()).pathname === endpoint && r.request().method() === 'POST');
	await activate(control, width);
	const result = await response;
	expect(result.status()).toBe(200);
	const answer = await result.json();
	expect(answer.requestId).toBeUndefined();
	await expect(page.locator('.answer')).toContainText(answer.summary);
	return answer;
}

async function captureEntry(page: Page, name: string) {
	mkdirSync('.temp/question-review', {recursive: true});
	const link = page.getByRole('link', {name: 'Ask about this report', exact: true});
	await link.scrollIntoViewIfNeeded();
	await link.evaluate(element => {
		const label = document.createElement('p');
		label.id = 'synthetic-review-label';
		label.textContent = 'Synthetic local report — every number here is invented; do not quote it.';
		element.parentElement!.prepend(label);
	});
	await page.screenshot({path: `.temp/question-review/${name}-entry.png`});
	await page.locator('#synthetic-review-label').evaluate(element => element.remove());
}

async function capture(page: Page, name: string) {
	mkdirSync('.temp/question-review', {recursive: true});
	const panel = page.locator('.inspector');
	await panel.evaluate(element => {
		const label = document.createElement('p');
		label.id = 'synthetic-question-label';
		label.textContent = 'Synthetic local report — every number here is invented; do not quote it.';
		element.prepend(label);
	});
	await panel.screenshot({path: `.temp/question-review/${name}-panel.png`});
	await panel.scrollIntoViewIfNeeded();
	await page.screenshot({path: `.temp/question-review/${name}-screen.png`});
	await page.locator('#synthetic-question-label').evaluate(element => element.remove());
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

for (const width of [1280, 390]) test.describe(`report questions at ${width}px`, () => {
	test.use({viewport: {width, height: 900}, isMobile: width === 390, hasTouch: width === 390});

	test('typed questions clarify meaning and recover from unsupported requests', async ({page}) => {
		await signIn(page);
		await page.goto('/photography/analytics/albums/alpha');
		const input = page.getByRole('textbox', {name: 'Ask about this report', exact: true});
		const submit = page.getByRole('button', {name: 'Ask owner question', exact: true});
		await input.fill('What changed this week?');
		const clarify = await askFromPage(page, submit, width);
		expect(clarify.status).toBe('clarification');
		await expect(page.locator('.answer')).toContainText('selected dates');
		await expect(page.getByRole('group', {name: 'Choose what you mean'}).getByRole('button')).toHaveCount(2);
		await capture(page, `clarification-album-${width}`);
		const chosen = await askFromPage(page, page.getByRole('button', {name: 'Explain findings for the selected dates', exact: true}), width);
		expect(chosen.operation).toBe('explain_report');
		expect(chosen.status).toBe('unavailable'); // The real local scope has no saved calculation.
		await expect(page.locator('.answer')).toContainText('reads the report directly');
		expect(chosen.scope).toEqual(clarify.scope);
		await input.fill('How much revenue did this album earn?');
		const unsupported = await askFromPage(page, submit, width);
		expect(unsupported.status).toBe('unsupported');
		await expect(page.locator('.answer')).toContainText('not supported by this report');
		await expect(page.getByText('The assistant could not complete that request.', {exact: false})).toHaveCount(0);
		await capture(page, `unsupported-album-${width}`);
		const recovered = await askFromPage(page, page.getByRole('button', {name: 'Compare the album’s first week', exact: true}), width);
		expect(recovered.operation).toBe('album_age');
		expect(recovered.scope).toEqual(unsupported.scope);
		await input.fill('How did this album do in its first week?');
		const typed = await askFromPage(page, submit, width);
		expect(typed.operation).toBe('album_age');
		expect(typed.summary).toBe(recovered.summary);
		expect(typed.evidenceLinks).toEqual(recovered.evidenceLinks);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
	});

	test('site clarification choices wait for a rerun after filters change', async ({page}) => {
		await signIn(page);
		await page.goto('/photography/analytics/sites');
		const input = page.getByRole('textbox', {name: 'Ask about this report', exact: true});
		const submit = page.getByRole('button', {name: 'Ask owner question', exact: true});
		await input.fill('Why don’t these counts match?');
		const clarification = await askFromPage(page, submit, width);
		expect(clarification.status).toBe('clarification');
		await capture(page, `clarification-sites-${width}`);
		await activate(page.getByRole('navigation', {name: 'Period', exact: true}).getByRole('link', {name: '30 days', exact: true}), width);
		const choice = page.getByRole('button', {name: 'Explain the two site counters', exact: true});
		await expect(choice).toBeDisabled();
		await expect(page.locator('.answer')).toContainText('Rerun your question before choosing an option');
		await askFromPage(page, page.getByRole('button', {name: 'Rerun for the current scope'}), width);
		const counts = await askFromPage(page, choice, width);
		expect(counts.operation).toBe('site_counts');
		expect(counts.scope).toEqual({kind: 'sites', period: 30, section: 'all'});
		await input.fill('How did the site do in its first week?');
		const firstWeek = await askFromPage(page, submit, width);
		expect(firstWeek.status).toBe('unsupported');
		expect(firstWeek.scope).toEqual(counts.scope);
		await expect(page.getByRole('button', {name: 'Explain the two site counters', exact: true})).toBeVisible();
		await expect(page.locator('.answer')).not.toContainText('Open one album');
		await activate(page.getByRole('navigation', {name: 'Section', exact: true}).getByRole('link', {name: 'Writing', exact: true}), width);
		await input.fill('Predict next month’s revenue');
		const unsupported = await askFromPage(page, submit, width);
		expect(unsupported.status).toBe('unsupported');
		await expect(page.getByRole('group', {name: 'Supported questions'}).getByRole('button')).toHaveCount(1);
		await capture(page, `unsupported-sites-${width}`);
		const coverage = await askFromPage(page, page.getByRole('button', {name: 'Check for missing report data', exact: true}), width);
		expect(coverage.operation).toBe('report_coverage');
		expect(coverage.scope).toEqual({kind: 'sites', period: 30, section: 'writing'});
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
	});

	test('album shortcuts work without saved findings and link to actual reports', async ({page}) => {
		page.on('pageerror', error => console.error('Browser error:', error.message));
		await signIn(page);
		// No page, saved findings, or question response is replaced.
		await page.goto('/photography/analytics/albums/alpha');
		await captureEntry(page, `album-${width}`);
		await activate(page.getByRole('link', {name: 'Ask about this report', exact: true}), width);
		await expect(page.locator(':target').getByRole('heading').first()).toHaveText('Ask about this report');
		await expect(page.getByRole('heading', {name: 'Worth your attention'})).toHaveCount(0);
		const downloads = await askFromPage(page, page.getByRole('button', {name: 'What counts as a download?', exact: true}), width);
		expect(downloads.operation).toBe('download_meaning');
		expect(downloads.summary).toContain('requests, not completed transfers');
		await activate(page.locator('.answer').getByRole('link', {name: 'Open data notes'}), width);
		await expect(page).toHaveURL(/\/analytics\/data$/);
		await expect(page.getByRole('main')).toContainText(/not completed transfers/);
		await page.goBack();
		await expect(page).toHaveURL(/\/analytics\/albums\/alpha(?:#gallery-report-questions)?$/);
		await expect(page.getByRole('button', {name: 'Compare its first week', exact: true})).toBeVisible();

		const age = await askFromPage(page, page.getByRole('button', {name: 'Compare its first week', exact: true}), width);
		expect(age.operation).toBe('album_age');
		expect(age.question).toContain('first 7 days');
		expect(age.scope.query.albumKeys).toEqual(['alpha']);
		expect(['complete', 'unavailable']).toContain(age.status);
		expect(age.evidenceLinks).toContain('/analytics/albums/alpha');

		const coverage = await askFromPage(page, page.getByRole('button', {name: 'Is this zero or missing data?', exact: true}), width);
		expect(coverage.operation).toBe('report_coverage');
		const runtime = JSON.parse(readFileSync(runtimePath, 'utf8'));
		const client = createClient(runtime.API_URL, runtime.SERVICE_ROLE_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
		const q = coverage.scope.query;
		const {data, error} = await client.rpc('analytics_read_scheduled_gallery_report', {p_start: q.start, p_end: q.end, p_measure: q.measure, p_scope: q.scope, p_album_keys: q.albumKeys, p_traffic: q.traffic, p_compare: q.compare, p_public_only: true, p_include_today: false, p_photo_page: 0, p_photo_page_size: 1, p_photo_rank: 'popular', p_export: false});
		expect(error).toBeNull();
		expect(data.coverage).toBe('complete');
		expect(coverage.summary).toContain(`recorded ${data.total} photo opens`);
		await capture(page, `album-${width}`);
		await activate(page.locator('.answer').getByRole('link', {name: 'Open source report'}), width);
		await expect(page).toHaveURL(/\/analytics\/photos\?/);
		const linked = new URL(page.url());
		expect(linked.searchParams.get('albums')).toBe('alpha');
		expect(linked.searchParams.get('start')).toBe(q.start);
		expect(linked.searchParams.get('end')).toBe(q.end);
		await expect(page.getByRole('main')).toContainText('Photo opens');
	});

	test('site shortcuts retain the answered period until explicitly rerun', async ({page}) => {
		await signIn(page);
		await page.goto('/photography/analytics/sites');
		await captureEntry(page, `sites-${width}`);
		await activate(page.getByRole('link', {name: 'Ask about this report', exact: true}), width);
		await expect(page.locator(':target').getByRole('heading').first()).toHaveText('Ask about this report');
		await expect(page.getByRole('button', {name: 'What counts as a download?'})).toHaveCount(0);
		const counts = await askFromPage(page, page.getByRole('button', {name: 'Why don’t these counts match?', exact: true}), width);
		expect(counts.operation).toBe('site_counts');
		expect(counts.scope).toEqual({kind: 'sites', period: 7, section: 'all'});
		expect(counts.status).toBe('unavailable'); // Local stack has no Cloudflare credential.
		expect(counts.summary).toContain('not compared');
		await capture(page, `sites-${width}`);
		await activate(page.getByRole('navigation', {name: 'Period', exact: true}).getByRole('link', {name: '30 days', exact: true}), width);
		await expect(page.locator('.answer')).toContainText('Sites · 7 days · all');
		const rerun = await askFromPage(page, page.getByRole('button', {name: 'Rerun for the current scope'}), width);
		expect(rerun.scope.period).toBe(30);
		await expect(page.locator('.previous-answer')).toContainText('7 days');
		await activate(page.getByRole('navigation', {name: 'Section', exact: true}).getByRole('link', {name: 'Writing', exact: true}), width);
		await expect(page.getByRole('button', {name: 'Why don’t these counts match?', exact: true})).toHaveCount(0);
		await expect(page.getByRole('link', {name: 'open All sections', exact: true})).toHaveAttribute('href', /sites\?period=30$/);
		const coverage = await askFromPage(page, page.getByRole('button', {name: 'Is this zero or missing data?', exact: true}), width);
		expect(coverage.operation).toBe('report_coverage');
		expect(coverage.scope).toEqual({kind: 'sites', period: 30, section: 'writing'});
		await page.getByRole('textbox', {name: 'Ask about this report', exact: true}).fill('Why do Cloudflare and the site counts differ?');
		const typed = await askFromPage(page, page.getByRole('button', {name: 'Ask owner question'}), width);
		expect(typed.status).toBe('unavailable');
		await expect(page.locator('.answer')).toContainText('All sections');
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
	});
});

test('anonymous readers do not receive owner questions without findings', async ({page}) => {
	for (const path of ['/photography/analytics/albums/alpha', '/photography/analytics/sites']) {
		await page.goto(path);
		await expect(page.getByRole('textbox', {name: 'Ask about this report', exact: true})).toHaveCount(0);
		await expect(page.getByRole('button', {name: 'Is this zero or missing data?'})).toHaveCount(0);
	}
});
