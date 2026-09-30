import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

const galleryRoute = '/photography/analytics/operator?period=7';
const report = {
	scope: { kind: 'gallery', query: { start: '2026-09-01', end: '2026-09-07', measure: 'photo_opens', scope: 'all', albumKeys: [], compare: 'previous', traffic: 'conservative' } },
	generatedAt: '2026-09-08T12:00:00.000Z', cutoff: '2026-09-08T06:00:00.000Z', coverage: 'complete', owner: false, page: 0, pageCount: 1,
	suppressions: [{ rule: 'album_momentum', reason: 'Comparable history is still limited.' }], actions: [], briefs: [],
	findings: [{ id: 'finding-1', rule: 'album_momentum', target: { kind: 'album', albumKey: 'fall-classic' }, title: 'Album attention changed', explanation: 'The saved comparison changed.', action: 'Inspect the album before promoting it.', reportHref: '/photography/analytics/operator?scope=album', status: 'open', evidenceLinks: ['/photography/albums/fall-classic'], evidence: { windows: { current: { start: '2026-09-01', end: '2026-09-07' }, previous: { start: '2026-08-25', end: '2026-08-31' } }, cutoff: '2026-09-08T06:00:00.000Z', coverage: 'complete', previousCoverage: 'complete', units: 'eligible album opens', numerator: 8, denominator: 42, current: 42, previous: 31, strength: 'limited' } }]
};

async function mockReport(page: Page, next = report) {
	await page.route('**/api/analytics/intelligence**', async (route) => {
		const request = route.request();
		if (new URL(request.url()).searchParams.has('requestId')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'complete', answer: null }) });
		return route.fulfill({ contentType: 'application/json', body: JSON.stringify(next) });
	});
}

test('shows the target and complete stored evidence without flattening windows', async ({ page }) => {
	await mockReport(page);
	await page.goto(galleryRoute);
	await expect(page.getByRole('heading', { name: 'Worth your attention' })).toBeVisible();
	await expect(page.getByText('Album fall-classic')).toBeVisible();
	await page.getByText('Read exact evidence').click();
	await expect(page.getByText('Current: 2026-09-01 to 2026-09-07. Previous: 2026-08-25 to 2026-08-31')).toBeVisible();
	await expect(page.getByText('eligible album opens')).toBeVisible();
	await expect(page.getByText('8')).toBeVisible();
	await expect(page.getByText('42')).toBeVisible();
	await expect(page.getByText('Comparable history is still limited.')).toBeVisible();
});

test('keeps a pending poll pending and renders a completed result only from answer', async ({ page }) => {
	const cookiesPath = '.temp/analytics-parent-local-cookies.json';
	test.skip(!existsSync(cookiesPath), 'owner fixture is supplied by the local analytics rehearsal');
	const jar = JSON.parse(readFileSync(cookiesPath, 'utf8')) as Array<{ name: string; value: string }>;
	await page.context().addCookies(jar.map((cookie) => ({ ...cookie, domain: '127.0.0.1', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' as const })));
	let polls = 0;
	await page.route('**/api/analytics/intelligence**', async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (request.method() === 'POST') return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ scope: report.scope, question: 'Compare this album', operation: 'album_comparison', status: 'pending', summary: 'This calculation is pending against the fixed report scope.', findings: [], evidenceLinks: [], limitations: [], generatedAt: '2026-09-08T12:00:00.000Z', requestId: '11111111-1111-4111-8111-111111111111' }) });
		if (url.searchParams.has('requestId')) {
			polls += 1;
			return route.fulfill({ contentType: 'application/json', body: JSON.stringify(polls === 1 ? { status: 'pending', answer: null } : { status: 'complete', answer: { scope: report.scope, question: 'Compare this album', operation: 'album_comparison', status: 'complete', summary: 'The stored evidence supports the findings below.', findings: report.findings, evidenceLinks: ['/photography/analytics/operator?scope=album'], limitations: ['Comparable albums require known catalogue facts.'], generatedAt: '2026-09-08T12:01:00.000Z', requestId: '11111111-1111-4111-8111-111111111111' } }) });
		}
		return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...report, owner: true }) });
	});
	await page.goto(galleryRoute);
	await page.getByRole('button', { name: 'Compare this album' }).click();
	await expect(page.getByText('This calculation is still running against the captured report scope.')).toBeVisible();
	await expect.poll(() => polls).toBeGreaterThan(1);
	await expect(page.getByText('The stored evidence supports the findings below.')).toBeVisible();
	await page.getByRole('combobox', { name: 'Measure', exact: true }).selectOption('downloads');
	await page.getByRole('button', { name: 'Apply', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Rerun for the current scope' })).toBeVisible();
});

test('reports a safe unavailable state when the intelligence response is invalid', async ({ page }) => {
	await page.route('**/api/analytics/intelligence**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ provider: 'private detail' }) }));
	await page.goto(galleryRoute);
	await expect(page.getByText('Intelligence is unavailable')).toBeVisible();
	await expect(page.getByText('Saved intelligence is unavailable right now. The rest of this report is still usable.')).toBeVisible();
});

test('owner action form keeps unsupported standalone fields out of the request', async ({ page }) => {
	const cookiesPath = '.temp/analytics-parent-local-cookies.json';
	test.skip(!existsSync(cookiesPath), 'owner fixture is supplied by the local analytics rehearsal');
	const jar = JSON.parse(readFileSync(cookiesPath, 'utf8')) as Array<{ name: string; value: string }>;
	await page.context().addCookies(jar.map((cookie) => ({ ...cookie, domain: '127.0.0.1', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' as const })));
	await mockReport(page, { ...report, owner: true });
	await page.goto(galleryRoute);
	await page.getByRole('button', { name: 'I did this' }).click();
	await expect(page.getByText(/does not yet support a standalone action/i)).toBeVisible();
	await expect(page.getByLabel('Actual action time')).toHaveAttribute('required', '');
	await expect(page.getByLabel('What do you expect to change?')).toHaveAttribute('required', '');
	await expect(page.getByLabel('Declared primary measure')).toHaveAttribute('required', '');
});
