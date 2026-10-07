import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';

// The workspace is mounted by the album report, scoped to one album. The local rehearsal's album "alpha" must have a saved calculation for the panel to appear.
const galleryRoute = '/photography/analytics/albums/alpha';
const report = {
	scope: { kind: 'gallery', query: { start: '2026-09-01', end: '2026-09-07', measure: 'photo_opens', scope: 'all', albumKeys: [], compare: 'previous', traffic: 'conservative' } },
	generatedAt: '2026-09-08T12:00:00.000Z', cutoff: '2026-09-08T06:00:00.000Z', coverage: 'complete', owner: false, page: 0, pageCount: 1,
	suppressions: [{ rule: 'album_momentum', reason: 'Comparable history is still limited.' }], actions: [], briefs: [],
	findings: [{ id: 'finding-1', rule: 'album_momentum', target: { kind: 'album', albumKey: 'fall-classic' }, title: 'Album attention changed', explanation: 'The saved comparison changed.', action: 'Inspect the album before promoting it.', reportHref: '/photography/analytics/operator?scope=album', status: 'open', evidenceLinks: ['/photography/albums/fall-classic'], evidence: { windows: { current: { start: '2026-09-01', end: '2026-09-07' }, previous: { start: '2026-08-25', end: '2026-08-31' } }, cutoff: '2026-09-08T06:00:00.000Z', coverage: 'complete', previousCoverage: 'complete', units: 'eligible album opens', numerator: 8, denominator: 42, current: 42, previous: 31, strength: 'limited' } }]
};

const ownerPreferences = {
	retention: 'undecided',
	externalEnabled: false, destination: null, destinationVerified: false
};

test.afterEach(async ({ page }, info) => {
	if (info.status !== 'passed') return;
	const panel = page.locator('section.intelligence').first();
	if (!(await panel.count())) return;
	await panel.evaluate((element) => {
		const label = document.createElement('p');
		label.textContent = 'Synthetic local rehearsal — every number here is invented; do not quote it.';
		label.style.cssText = 'padding:12px;background:#fff5cf;color:#232323;font:14px sans-serif';
		element.prepend(label);
	});
	const folder = 'docs/implementation/analytics-intelligence-20260930/evidence';
	mkdirSync(folder, { recursive: true });
	await panel.screenshot({ path: `${folder}/state-${info.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 70)}.png` });
});

async function mockReport(page: Page, next = report) {
	await page.route('**/api/analytics/intelligence**', async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (url.pathname.endsWith('/preferences')) {
			return route.fulfill({ contentType: 'application/json', body: JSON.stringify(request.method() === 'POST' ? { saved: true } : ownerPreferences) });
		}
		if (url.pathname.endsWith('/actions')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ action: {} }) });
		if (new URL(request.url()).searchParams.has('requestId')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'complete', answer: null }) });
		return route.fulfill({ contentType: 'application/json', body: JSON.stringify(next) });
	});
}

async function addOwnerFixture(page: Page) {
	const cookiesPath = '.temp/analytics-parent-local-cookies.json';
	test.skip(!existsSync(cookiesPath), 'owner fixture is supplied by the local analytics rehearsal');
	const jar = JSON.parse(readFileSync(cookiesPath, 'utf8')) as Array<{ name: string; value: string }>;
	await page.context().addCookies(jar.map((cookie) => ({ ...cookie, domain: '127.0.0.1', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' as const })));
}

test('shows the target and complete stored evidence without flattening windows', async ({ page }) => {
	await mockReport(page);
	await page.goto(galleryRoute);
	await expect(page.getByRole('heading', { name: 'Worth your attention' })).toBeVisible();
	await expect(page.getByText('Album fall-classic')).toBeVisible();
	await page.getByText('Read exact evidence').click();
	await expect(page.getByText('Current: 2026-09-01 to 2026-09-07. Previous: 2026-08-25 to 2026-08-31')).toBeVisible();
	await expect(page.getByText('eligible album opens')).toBeVisible();
	// Scoped to the report panel: the page around it shows live gallery numbers, and a bare "42" can appear there too.
	const panel = page.locator('section.intelligence').first();
	await expect(panel.getByText('8', { exact: true })).toBeVisible();
	await expect(panel.getByText('42', { exact: true })).toHaveCount(2);
	await expect(page.getByText('Comparable history is still limited.')).toBeVisible();
});

test('keeps a pending poll pending and renders a completed result only from answer', async ({ page }) => {
	await addOwnerFixture(page);
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
	await expect.poll(() => polls, { timeout: 15000 }).toBeGreaterThan(1);
	await expect(page.getByText('The stored evidence supports the findings below.')).toBeVisible();
	await page.getByRole('combobox', { name: 'Measure', exact: true }).selectOption('downloads');
	await page.getByRole('button', { name: 'Apply', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Rerun for the current scope' })).toBeVisible();
});

test('reports a safe unavailable state when the intelligence response is invalid', async ({ page }) => {
	await page.route('**/api/analytics/intelligence**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ provider: 'private detail' }) }));
	await page.goto(galleryRoute);
	await expect(page.getByText('Intelligence is unavailable', { exact: true })).toBeVisible();
	await expect(page.getByText('Saved intelligence is unavailable right now. The rest of this report is still usable.')).toBeVisible();
});

test('keeps private controls out of the anonymous report', async ({ page }) => {
	await mockReport(page);
	await page.goto(galleryRoute);
	await expect(page.getByRole('heading', { name: 'Private records and launch recaps' })).toHaveCount(0);
	await expect(page.getByLabel('Ask about this report')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Public explanation' })).toBeVisible();
});

test('requires an explicit private-retention choice before a standalone change and sends its target and window', async ({ page }) => {
	await addOwnerFixture(page);
	let actionPayload: Record<string, unknown> | null = null;
	await page.route('**/api/analytics/intelligence**', async (route) => {
		const request = route.request(); const url = new URL(request.url());
		if (url.pathname.endsWith('/preferences')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(request.method() === 'POST' ? { saved: true } : ownerPreferences) });
		if (url.pathname.endsWith('/actions')) { actionPayload = request.postDataJSON() as Record<string, unknown>; return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ action: {} }) }); }
		return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...report, owner: true }) });
	});
	await page.goto(galleryRoute);
	await page.getByRole('button', { name: 'Record a change' }).click();
	await page.getByLabel('Target reference').fill('fall-classic');
	await page.getByLabel('Actual action time').fill('2026-09-08T12:00');
	await page.getByLabel('Change type').selectOption('promotion');
	await page.getByLabel('Declared primary outcome').selectOption('album_opens');
	await page.getByLabel('Observe for').selectOption('14');
	await page.getByLabel('What do you expect to change?').fill('A verified promotion should increase album opens.');
	await page.getByRole('button', { name: 'Record actual change' }).click();
	await expect(page.getByText('Choose private record retention in Reporting settings before saving a private action.')).toBeVisible();
	await page.getByText('Reporting settings', { exact: true }).click();
	await page.getByRole('radio', { name: '90 days', exact: true }).check();
	await page.getByRole('button', { name: 'Save private settings' }).click();
	await page.getByRole('button', { name: 'Record actual change' }).click();
	await expect.poll(() => actionPayload).not.toBeNull();
	expect(actionPayload).toMatchObject({ kind: 'record', publicTarget: { kind: 'album', albumKey: 'fall-classic' }, observationDays: 14, primaryMeasure: 'album_opens' });
});

test('renders stored private brief content and freezes an album question scope', async ({ page }) => {
	await addOwnerFixture(page);
	let questionScope: Record<string, unknown> | null = null;
	await page.route('**/api/analytics/intelligence**', async (route) => {
		const request = route.request(); const url = new URL(request.url());
		if (url.pathname.endsWith('/preferences')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...ownerPreferences, retention: '90_days' }) });
		if (request.method() === 'POST') { questionScope = (request.postDataJSON() as { scope: Record<string, unknown> }).scope; return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ scope: questionScope, question: 'How is this album doing compared with similar albums?', operation: 'album_comparison', status: 'complete', summary: 'Comparable evidence is limited.', findings: report.findings, evidenceLinks: [report.findings[0].reportHref], limitations: ['No matching peer cohort was stored.'], generatedAt: '2026-09-08T12:00:00.000Z' }) }); }
		return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...report, owner: true, briefs: [{ id: 'brief-1', kind: 'operational', periodKey: '2026-09-08', createdAt: '2026-09-08T12:00:00.000Z', title: 'Morning review', body: 'Inspect the album before choosing a promotion.', findings: report.findings }] }) });
	});
	await page.goto(galleryRoute);
	await expect(page.getByText('Morning review')).toBeVisible();
	await expect(page.getByText('Inspect the album before choosing a promotion.')).toBeVisible();
	await page.getByRole('button', { name: 'Compare this album' }).click();
	await expect.poll(() => questionScope).not.toBeNull();
	expect(questionScope).toMatchObject({ kind: 'gallery', query: { scope: 'album', albumKeys: ['alpha'] } });
});

test('keeps stored brief provenance private, compact, and paged', async ({ page }) => {
	await addOwnerFixture(page);
	const sourceWindows = [{
		scope: report.scope,
		cutoff: '2026-09-08T06:00:00.000Z',
		timezone: 'America/Chicago',
		current: { start: '2026-09-01', end: '2026-09-07' },
		previous: { start: '2026-08-25', end: '2026-08-31' }
	}];
	const pageOneBriefs = Array.from({ length: 4 }, (_, index) => ({
		id: `brief-${index + 1}`, kind: 'operational' as const, periodKey: `2026-09-0${index + 1}`, createdAt: '2026-09-08T12:00:00.000Z', title: `Morning review ${index + 1}`,
		sourceWindows, suppressions: [{ rule: 'album_momentum', reason: 'Comparable history is still limited.' }], late: index === 0
	}));
	let requestedBriefPage = '0';
	await page.route('**/api/analytics/intelligence**', async (route) => {
		const request = route.request(); const url = new URL(request.url());
		if (url.pathname.endsWith('/preferences')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...ownerPreferences, retention: '90_days' }) });
		requestedBriefPage = url.searchParams.get('briefsPage') ?? '0';
		const briefs = requestedBriefPage === '1'
			? [{ ...pageOneBriefs[0], id: 'brief-11', title: 'Morning review 11' }]
			: pageOneBriefs;
		return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...report, owner: true, briefs, briefsPage: Number(requestedBriefPage), briefsPageCount: 2 }) });
	});
	await page.goto(galleryRoute);
	await expect(page.getByText('Morning review 1')).toBeVisible();
	await expect(page.getByText('Morning review 4')).toHaveCount(0);
	await page.getByRole('button', { name: 'Show all on this brief page' }).click();
	await expect(page.getByText('Morning review 4')).toBeVisible();
	await page.getByText('Read stored brief evidence').first().click();
	await expect(page.locator('.brief-list article').first().getByText('2026-09-01 to 2026-09-07',{exact:true})).toBeVisible();
	await expect(page.locator('.brief-list article').first().getByText('America/Chicago',{exact:true})).toBeVisible();
	await expect(page.locator('.brief-list article').first().getByText('album_momentum: Comparable history is still limited.',{exact:true})).toBeVisible();
	await expect(page.locator('.brief-list article').first().getByText('Delivery timing: Late delivery was recorded.',{exact:true})).toBeVisible();
	await page.getByRole('button', { name: 'Next briefs' }).click();
	await expect.poll(() => requestedBriefPage).toBe('1');
	await expect(page.getByText('Morning review 11')).toBeVisible();
});


test('owner can ask a supported question when no recommendation exists', async ({ page }) => {
 await addOwnerFixture(page);
 let posted = false;
 await page.route('**/api/analytics/intelligence**', async route => {
  if(route.request().method()==='POST') {
   posted = true;
   return route.fulfill({contentType:'application/json',body:JSON.stringify({scope:report.scope,question:'What does this support?',operation:'explain_report',status:'unavailable',summary:'History is still incomplete.',findings:[],evidenceLinks:[],limitations:['No invented recommendation.'],generatedAt:report.generatedAt})});
  }
  return route.fulfill({contentType:'application/json',body:JSON.stringify({...report,owner:true,findings:[],coverage:'partial'})});
 });
 await page.goto(galleryRoute);
 await expect(page.getByText('No actionable findings for this scope')).toBeVisible();
 await page.getByRole('button',{name:'What does this support?',exact:true}).click();
 await expect(page.getByText('History is still incomplete.')).toBeVisible();
 expect(posted).toBe(true);
});
