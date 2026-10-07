import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sentenceText } from './home';
import { loadHome } from './home.server';

type Json = Record<string, any>;

/** 11:00 Chicago on Oct 6, 2026. */
const AS_OF = new Date('2026-10-06T16:00:00Z');
const FRESH = '2026-10-06T15:45:00Z';

function launchPayload(over: Json = {}): Json {
	const dates = ['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'];
	const series = [90, 106, 40, 12, 9, 6, 3, 2, 1, 0].map((n, i) => ({ day: i, date: dates[i], photoOpens: n, downloads: 1, albumOpens: 1, coverage: 'complete' }));
	const age = (n: number) => ({ reached: true, complete: true, photoOpens: series.slice(0, n).reduce((a, d) => a + d.photoOpens, 0), downloads: n, albumOpens: n });
	const launch = (key: string, name: string) => ({
		albumKey: key, albumName: name, firstPublishedAt: '2026-09-27T01:10:52.556+00:00', basis: 'inferred', status: 'finished', elapsedDays: 10, series, currentDay: null,
		totals: { day3: age(3), day7: age(7) }, rank: { day3: { rank: 1, compared: 2, tied: false }, day7: { rank: 1, compared: 2, tied: false } }
	});
	return { asOf: AS_OF.toISOString(), today: '2026-10-06', lastCompleteDay: '2026-10-05', days: 14, traffic: 'conservative', launches: [launch('A', 'Alpha - 09-23-2026'), launch('B', 'Bravo'), launch('C', 'Charlie'), launch('D', 'Delta')], ...over };
}

function reportPayload(over: Json = {}): Json {
	const daily = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'].map((date) => ({ date, count: 5, observed: 5, coverage: 'complete' }));
	return {
		coverage: 'complete', previousCoverage: 'complete', total: 35, previousTotal: 70, observedTotal: 35, today: { date: '2026-10-06', count: 3, asOf: FRESH }, dataAsOf: FRESH, preservedSince: null,
		catalogueBasis: 'public_album_visibility', daily, albums: [], photos: [], photoPagination: { page: 0, pageSize: 0, total: 0, pageCount: 0, rank: 'popular' },
		albumOnlyActions: [], sources: { arrivals: [], openLocations: [], unknown: 0 }, traffic: [], trafficImpact: [],
		publicationAge: { available: false, label: 'Not selected.', days: 0, albums: [], missingAlbumKeys: [] }, ...over
	};
}

function actionsPayload(over: Json = {}): Json {
	return {
		available: true, start: '2026-09-29', end: '2026-10-05', firstRecordedAt: '2026-09-01T00:00:00Z', excludedEvents: 0, totals: { contact_clicks: 4 }, todayTotals: {}, previousTotals: { contact_clicks: 2 },
		recordedSections: ['profile'], page: 0, pageCount: 1, pages: [], freshness: { status: 'current', refreshedAt: FRESH, summaryCutoffAt: FRESH, lastFailureAt: null, todayAvailable: true, completedThrough: '2026-10-05' }, ...over
	};
}

interface Over {
	launches?: Json | ((args: Json) => Json);
	launchError?: boolean;
	report?: Json;
	reportError?: boolean;
	actions?: Json;
	actionsError?: boolean;
	delivery?: Json;
	deliveryError?: boolean;
	incidents?: Json[] | null;
	covers?: Json[];
	/** Newest reconciled_at in analytics_daily_coverage; null = no row; 'error' = the read fails. */
	refreshAt?: string | null | 'error';
}

function fixture(over: Over = {}) {
	const reads: Array<{ table: string; in?: unknown[] }> = [];
	const rpcs: Array<{ name: string; args: Json }> = [];
	const client = {
		from(table: string) {
			const entry: { table: string; in?: unknown[] } = { table };
			reads.push(entry);
			const refresh = over.refreshAt === undefined ? FRESH : over.refreshAt;
			const result = table === 'analytics_intelligence_incidents'
				? over.incidents === null ? { data: null, error: { message: 'down' } } : { data: over.incidents ?? [], error: null }
				: table === 'analytics_daily_coverage'
					? refresh === 'error' ? { data: null, error: { message: 'down' } } : { data: refresh === null ? [] : [{ reconciled_at: refresh }], error: null }
					: { data: over.covers ?? [], error: null };
			const chain: Json = {
				select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
				in: (_column: string, values: unknown[]) => { entry.in = values; return chain; },
				then: (resolve: (value: unknown) => unknown) => resolve(result)
			};
			return chain;
		},
		async rpc(name: string, args: Json) {
			rpcs.push({ name, args });
			if (name === 'analytics_read_launches') return over.launchError ? { data: null, error: { code: 'XX000', message: 'down' } } : { data: typeof over.launches === 'function' ? over.launches(args) : over.launches ?? launchPayload(), error: null };
			if (name === 'analytics_read_scheduled_gallery_report') return over.reportError ? { data: null, error: { code: 'XX000', message: 'down' } } : { data: over.report ?? reportPayload(), error: null };
			if (name === 'analytics_site_actions') return over.actionsError ? { data: null, error: { message: 'down' } } : { data: over.actions ?? actionsPayload(), error: null };
			if (name === 'analytics_posthog_delivery_health') return over.deliveryError ? { data: null, error: { message: 'down' } } : { data: over.delivery ?? { failed: 0, pending: 0, oldest_pending_at: null }, error: null };
			throw new Error(`unexpected rpc ${name}`);
		}
	} as unknown as SupabaseClient;
	return { client, reads, rpcs };
}

const noProvider = async () => new Response('down', { status: 500 });
const run = (over: Over = {}, env: { CLOUDFLARE_ACCOUNT_ID?: string; CLOUDFLARE_ANALYTICS_TOKEN?: string } = {}, now = AS_OF) => {
	const { client, reads, rpcs } = fixture(over);
	return loadHome({ admin: client, env, fetch: noProvider as unknown as typeof fetch, now }).then((view) => ({ view, reads, rpcs }));
};

test('Home reads each source once and never once per album; only public launches, only the first three covers', async () => {
	const { view, reads, rpcs } = await run({ covers: [{ album_key: 'A', cover_cf_image_id: 'cover-a' }] });
	assert.deepEqual(rpcs.map((call) => call.name).sort(), ['analytics_posthog_delivery_health', 'analytics_read_launches', 'analytics_read_scheduled_gallery_report', 'analytics_site_actions']);
	const launches = rpcs.find((call) => call.name === 'analytics_read_launches')!.args;
	assert.equal(launches.p_public_only, true);
	assert.equal(launches.p_traffic, 'conservative');
	assert.deepEqual(Object.keys(launches).sort(), ['p_as_of', 'p_days', 'p_public_only', 'p_traffic']);
	const report = rpcs.find((call) => call.name === 'analytics_read_scheduled_gallery_report')!.args;
	assert.equal(report.p_public_only, true);
	assert.equal(report.p_scope, 'all');
	assert.equal(report.p_measure, 'photo_opens');
	assert.equal(report.p_traffic, 'conservative');
	assert.equal(report.p_compare, 'previous');
	assert.equal(report.p_start, '2026-09-29');
	assert.equal(report.p_end, '2026-10-05');
	assert.equal(rpcs.find((call) => call.name === 'analytics_site_actions')!.args.p_period, 7);
	const covers = reads.find((read) => read.table === 'albums_summary')!;
	assert.deepEqual(covers.in, ['A', 'B', 'C'], 'the fourth launch gets no card, so its cover is not read');
	assert.equal(reads.filter((read) => read.table === 'albums_summary').length, 1);
	assert.equal(view.cards.length, 3);
	assert.equal(view.cards[0].cover, 'cover-a');
	assert.equal(view.moreLaunches, 1);
});

test('the quiet gallery on a fresh day reads as quiet, with no open problem except the provider that is not configured', async () => {
	const { view } = await run();
	assert.equal(view.state, 'quiet');
	assert.match(sentenceText(view.opening), /^Alpha finished its first week (tied for )?\d(st|nd|rd|th) of \d+ launches\.$/);
	assert.equal(sentenceText(view.then!), 'No new album since Sep 26 (date recovered afterwards from a log), 10 days ago.');
	// Both windows hold the first week of the launches in the fixture (published Sep 26), so there is no calendar-week line at all.
	assert.equal(view.week, null);
	assert.deepEqual(view.problems, []);
	assert.equal(view.site.reach.value, null);
	assert.match(view.site.reach.detail, /not configured/);
	assert.equal(view.site.contacts.value, '4');
	assert.equal(view.site.contacts.detail, 'Sep 29 – Oct 5, against 2 in the 7 days before. These are links opened, not messages sent.');
});

test('Cloudflare page loads are the reach measure, with the week before as the comparison', async () => {
	const rows = (date: string, count: number) => ({ count, dimensions: { date, requestPath: '/', refererHost: null, deviceType: 'desktop' }, sum: { visits: count } });
	const cloudflare = (async (_url: unknown, init: { body: string }) => {
		const { variables } = JSON.parse(init.body);
		const current = variables.start === '2026-09-29';
		return new Response(JSON.stringify({ data: { viewer: { accounts: [{ rumPageloadEventsAdaptiveGroups: [rows(current ? '2026-10-01' : '2026-09-24', current ? 730 : 658)] }] } } }), { status: 200, headers: { 'content-type': 'application/json' } });
	}) as unknown as typeof fetch;
	const { client } = fixture();
	const view = await loadHome({ admin: client, env: { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_ANALYTICS_TOKEN: 'token' }, fetch: cloudflare, now: AS_OF });
	assert.equal(view.site.reach.label, 'Page loads on ninochavez.co (Cloudflare)');
	assert.equal(view.site.reach.value, '730');
	assert.match(view.site.reach.detail, /up 11% from 658 in the 7 days before\.$/);
});

test('each source fails alone: the rest of Home still reads', async () => {
	const launchDown = await run({ launchError: true });
	assert.equal(launchDown.view.state, 'unavailable');
	assert.deepEqual(launchDown.view.cards, []);
	assert.match(sentenceText(launchDown.view.week!), /^Gallery photo opens, Sep 29 – Oct 5: 35\. The 7 days before \(Sep 22 – 28\) had 70\. Launch dates could not be read, so no change is stated\.$/);
	assert.ok(launchDown.view.problems.some((problem) => problem.id === 'launches-unreadable'));

	const reportDown = await run({ reportError: true });
	assert.equal(reportDown.view.state, 'quiet', 'the refresh time is read apart from the report, so a failed report does not make freshness unknown');
	assert.match(sentenceText(reportDown.view.week!), /could not be read/);
	assert.equal(reportDown.view.cards.length, 3, 'launches still show');
	assert.ok(reportDown.view.problems.some((problem) => problem.id === 'week-unreadable'));

	const incidentsDown = await run({ incidents: null });
	assert.equal(incidentsDown.view.state, 'quiet');
	assert.deepEqual(incidentsDown.view.problems.map((problem) => problem.id), ['incidents-unreadable']);

	const actionsDown = await run({ actionsError: true });
	assert.equal(actionsDown.view.site.contacts.value, null);
	assert.match(actionsDown.view.site.contacts.detail, /not a report of zero/);
	assert.deepEqual(actionsDown.view.problems, []);

	const deliveryDown = await run({ deliveryError: true });
	assert.deepEqual(deliveryDown.view.problems.map((problem) => problem.id), ['delivery-unknown']);
});

test('a refresh that has stopped is said first, and a gap in the last complete day is a stop in the counts', async () => {
	const late = await run({ refreshAt: '2026-10-06T13:00:00Z' });
	assert.equal(late.view.state, 'stale');
	assert.equal(sentenceText(late.view.opening), 'The gallery counts were last refreshed at 8:00 AM Chicago time, so recent activity may be missing; this is not a quiet day.');
	assert.deepEqual(late.view.problems.map((problem) => problem.id), ['refresh-late']);

	const daily = reportPayload().daily.map((day: Json) => (day.date >= '2026-10-04' ? { date: day.date, count: null, observed: 2, coverage: 'partial' } : day));
	const gap = await run({ report: reportPayload({ daily, coverage: 'partial', total: null }) });
	assert.equal(gap.view.state, 'stale');
	assert.equal(sentenceText(gap.view.opening), 'Counts stop at Oct 3: the days since are incomplete, so this is a gap in the records, not a quiet gallery.');
	assert.match(sentenceText(gap.view.week!), /not stated/);
	assert.equal(gap.view.problems[0].id, 'coverage');

	// A refresh time that cannot be read is unknown, never current.
	assert.equal((await run({ refreshAt: null })).view.state, 'stale');
	assert.equal((await run({ refreshAt: 'error' })).view.state, 'stale');
	assert.match(sentenceText((await run({ refreshAt: 'error' })).view.opening), /could not be checked, so this is not a quiet day\.$/);
	// 00:10 Chicago on Oct 6: today has no row yet and the last refresh was 23:30 the day before. That is 40 minutes old, not stale.
	const midnight = await run({ refreshAt: '2026-10-06T04:30:00Z' }, {}, new Date('2026-10-06T05:10:00Z'));
	assert.equal(midnight.view.state, 'quiet');
	assert.deepEqual(midnight.view.problems, []);
	// The same last refresh an hour and a half later is stale: the limit is the age of the last refresh, not the day.
	assert.equal((await run({ refreshAt: '2026-10-06T04:30:00Z' }, {}, new Date('2026-10-06T06:10:00Z'))).view.state, 'stale');
});

test('the launch read and the page must agree on the day, or no launch is shown', async () => {
	const { view } = await run({ launches: launchPayload({ today: '2026-10-07', lastCompleteDay: '2026-10-06' }) });
	assert.equal(view.state, 'unavailable');
	assert.deepEqual(view.cards, []);
});

test('the Chicago day, not the UTC day, is today: 21:30 Chicago on Oct 6 is already Oct 7 in UTC', async () => {
	const { view, rpcs } = await run({}, {}, new Date('2026-10-07T02:30:00Z'));
	assert.equal(rpcs.find((call) => call.name === 'analytics_read_scheduled_gallery_report')!.args.p_end, '2026-10-05');
	assert.equal(view.today, '2026-10-06');
});

test('open incidents are described by kind and never by a name from the finding', async () => {
	const { view } = await run({ incidents: [{ finding_id: 'collection-health-provider_delivery_failures' }, { finding_id: 'download-failed-Re7kho' }] });
	assert.deepEqual(view.problems.map((problem) => problem.text), ['A data collection check is failing. This incident is open.', 'Download requests are failing for visitors. This incident is open.']);
	assert.ok(view.problems.every((problem) => !/Re7kho|Alpha/.test(problem.text)));
});

test('contact link clicks need a full 7 days of history; the week before needs its own', async () => {
	const since = await run({ actions: actionsPayload({ firstRecordedAt: '2026-10-01T12:00:00Z' }) });
	assert.equal(since.view.site.contacts.value, null);
	assert.equal(since.view.site.contacts.detail, 'Link clicks have been counted since Oct 1, so there is no full 7 days to count yet.');
	const none = await run({ actions: actionsPayload({ firstRecordedAt: null, recordedSections: [] }) });
	assert.equal(none.view.site.contacts.value, null);
	assert.match(none.view.site.contacts.detail, /not been counted yet.*not zero/);
	const noPrevious = await run({ actions: actionsPayload({ firstRecordedAt: '2026-09-25T00:00:00Z' }) });
	assert.equal(noPrevious.view.site.contacts.value, '4');
	assert.match(noPrevious.view.site.contacts.detail, /nothing to compare it with\. These are links opened, not messages sent\.$/);
	const stale = await run({ actions: actionsPayload({ freshness: { status: 'stale', refreshedAt: '2026-10-05T03:00:00Z', summaryCutoffAt: '2026-10-05T03:00:00Z', lastFailureAt: null, todayAvailable: false, completedThrough: '2026-10-04' } }) });
	assert.deepEqual(stale.view.problems.map((problem) => problem.id), ['site-actions-stale']);
	assert.equal(stale.view.problems[0].href, 'site-measures');
});

test('Home shows no finding for an album unlisted after its snapshot was written, with the real visibility read', async () => {
	const { loadVisibleFindings } = await import('./intelligence-panel.server');
	const { HOME, launchFinding, publicClient } = await import('./intelligence-public.fixture');
	const world = (unlisted: string[]) => publicClient({ snapshots: [{ scope: HOME, findings: [launchFinding('launch-failed-A', 'A', { rule: 'launch_failures', severity: 'high' }), launchFinding('launch-failed-B', 'B', { rule: 'launch_failures', severity: 'high' })], checkedAt: '2026-10-06T15:45:00Z' }], albums: ['A', 'B', 'C'], unlisted });
	const { client } = fixture();
	const hidden = await loadHome({ admin: client, env: {}, fetch: noProvider as unknown as typeof fetch, now: AS_OF, findings: () => loadVisibleFindings(world(['A']), HOME, 'test') });
	assert.deepEqual(hidden.cards.map((card) => [card.albumKey, card.findings.map((f) => f.id)]), [['A', []], ['B', ['launch-failed-B']], ['C', []]]);
	assert.equal(hidden.cards[0].findingsCheck, null);
	assert.deepEqual(hidden.cards[1].findingsCheck, { text: 'Last checked 10:45 AM Chicago time.', late: false });
	const listed = await loadHome({ admin: client, env: {}, fetch: noProvider as unknown as typeof fetch, now: AS_OF, findings: () => loadVisibleFindings(world([]), HOME, 'test') });
	assert.deepEqual(listed.cards[0].findings.map((f) => f.id), ['launch-failed-A'], 'control: the same snapshot while A is public');
});
