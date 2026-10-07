import assert from 'node:assert/strict';
import test from 'node:test';
import {
	basisWords, buildDataView, coverageView, deliveryView, evidenceView, freshnessForStatus, impactScope, journeysView, notReadNote, openLocationsView,
	siteJourneyNote, siteMeasuresView, statusView, trafficClassWords, trafficView, type DataInput, type NotRead
} from './data-quality';
import { DATA_ANCHORS } from './data-anchors';
import type { Freshness } from './home';
import { parseMeasurementHealth } from './measurement-health';
import type { OperatorReport } from './operator-report.server';
import type { JourneyAggregate } from './posthog.types';
import type { SiteActionReport } from './site-actions';
import { summarizeSiteTraffic } from './site-traffic.server';
import type { V2ReportProjection } from './v2-report-projection.server';

/*
 * Fixtures follow production on 2026-10-06, the last 30 complete days (Sep 6 to Oct 5): 254 public albums,
 * 136 of them with a photo open; 2,290 photo opens and 169 album opens, which are the 2,459 open locations;
 * traffic of 2,290 audience, 1 operator; Cloudflare 730 page loads over 30 days, the site's own counter since Sep 29.
 */
const TODAY = '2026-10-06';
const LAST = '2026-10-05';
const NOW = '2026-10-06T15:00:00Z';
const REFRESHED = '2026-10-06T14:40:00Z';

function days(start: string, count: number, coverage: 'complete' | 'partial' | 'unavailable' = 'complete', override: Record<string, 'partial' | 'unavailable'> = {}) {
	return Array.from({ length: count }, (_, i) => {
		const d = new Date(`${start}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i);
		const date = d.toISOString().slice(0, 10);
		return { date, count: 10, observed: 10, coverage: override[date] ?? coverage };
	});
}

function albums(photoByAlbum: number[], albumOpensByAlbum: number[]) {
	return photoByAlbum.map((photo, i) => ({
		albumKey: `a${i}`, count: photo, previousCount: null, difference: null, risingValue: null, lastActivity: null, publicationAt: null,
		measures: { photo_opens: photo, album_opens: albumOpensByAlbum[i] ?? 0, downloads: 0, favorites: 0, shares: 0 }
	}));
}

function report(over: Partial<OperatorReport> = {}): OperatorReport {
	// 254 albums: two carry most of the opens, 134 carry one each, 118 carry none.
	const photo = [1011, 266, ...Array(134).fill(1), ...Array(118).fill(0)];
	const sum = photo.reduce((a, b) => a + b, 0);
	const adjust = 2290 - sum;
	photo[2] += adjust; // keep the production total of 2,290
	const albumOpens = [59, 30, ...Array(20).fill(4), ...Array(232).fill(0)];
	const impact = photo.map((count, i) => ({ albumKey: `a${i}`, count })).filter((item) => item.count > 0).map((item, i) => ({ albumKey: item.albumKey, inclusive: item.count, conservative: item.count, excluded: 0, inclusiveRank: i + 1, conservativeRank: i + 1 }));
	return {
		available: true, query: { start: '2026-09-06', end: LAST, measure: 'photo_opens', scope: 'all', albumKeys: [], compare: 'none', traffic: 'conservative' },
		previous: { start: '2026-08-07', end: '2026-09-05' }, comparison: null, coverage: 'complete', previousCoverage: 'unavailable',
		total: 2290, observedTotal: 2290, today: { date: TODAY, count: null, asOf: null }, dataAsOf: REFRESHED, preservedSince: '2026-07-01', catalogueBasis: 'event_snapshot, backfill',
		previousTotal: null, change: null, daily: days('2026-09-06', 30), rising: { available: false, label: '', basis: 'unavailable' } as never,
		albums: albums(photo, albumOpens), photos: [], albumOnlyActions: [],
		sources: { arrivals: [{ source: 'instagram', count: 153 }], openLocations: [{ source: 'Album page', count: 169 }, { source: 'Photo grid', count: 2290 }], unknown: 0 },
		traffic: [{ classification: 'audience', count: 2290 }, { classification: 'operator', count: 1 }],
		trafficImpact: impact, diagnostics: [{ type: 'download_failed', status: 'failed', count: 2, resultCount: null, errorCodes: ['E1'], latestAt: '2026-10-03T12:00:00Z' }],
		diagnosticsCoverage: { availableFrom: '2026-09-29', label: 'First recorded diagnostic evidence: 2026-09-29. Earlier coverage is unknown.', error: null },
		visitorEstimate: { value: null, limit: '' }, publicationAge: { available: false, label: '', days: 7, albums: [], missingAlbumKeys: [] }, generatedAt: NOW,
		...over
	} as unknown as OperatorReport;
}

const traffic = summarizeSiteTraffic([{ count: 730, dimensions: { date: '2026-10-01', requestPath: '/', refererHost: '', deviceType: 'mobile' }, sum: { visits: 120 } }], 30, '2026-09-06', LAST, null, NOW);
function actions(over: Partial<Extract<SiteActionReport, { available: true }>> = {}): SiteActionReport {
	return {
		available: true, start: '2026-09-06', end: LAST, firstRecordedAt: '2026-09-29T05:00:00Z', excludedEvents: 0, totals: { page_views: 85, contact_clicks: 0, external_clicks: 3 }, todayTotals: {}, previousTotals: {},
		recordedSections: ['profile'], page: 0, pageCount: 1, pages: [],
		freshness: { status: 'current', refreshedAt: REFRESHED, summaryCutoffAt: REFRESHED, lastFailureAt: null, todayAvailable: true, completedThrough: LAST }, ...over
	};
}
const v2: V2ReportProjection = { available: true, coverage: { start: '2026-09-06', end: LAST, firstRecordedAt: null, rawRetainedFrom: null, archivedFrom: null, archivedThrough: null, label: 'Recorded since Sep 29.' }, counts: [{ event: 'album_opened', label: 'Album opened', count: 259 }] as never };
const health = parseMeasurementHealth({ schema_version: 2, pending: 0, submitted: 0, confirmed: 120, failed: 0, control_pending: 0, confirmed_watermark: '2026-10-06T14:00:00Z', collection: { accepted: 500, rejected: 1, duplicate: 3 }, eligible_observations_14d: 140, eligible_days_observed: 14 });

function input(over: Partial<DataInput> = {}): DataInput {
	return {
		asOf: NOW, today: TODAY, lastCompleteDay: LAST, days: 30, owner: false, report: report(), names: new Map(), v2, health: null, refreshedAt: REFRESHED,
		incidents: [], diagnostics: [], traffic, actions: actions(), posthogConfigured: true, ...over
	};
}

test('open locations: 2,459 is album opens and photo opens together, and the split is stated only because it adds up', () => {
	const view = openLocationsView(report().sources.openLocations, report());
	assert.equal(view.total, 2459);
	assert.equal(view.photoOpens, 2290);
	assert.equal(view.albumOpens, 169);
	assert.equal(view.splits, true);
	assert.match(view.sentence, /^These 2,459 opens are album opens and photo opens together: 2,290 photo opens and 169 album opens\. Home and Albums count only the 2,290 photo opens\.$/);
});

test('open locations never present one number as a subtotal of the other when they do not add up, or cannot be split', () => {
	const off = openLocationsView([{ source: 'x', count: 2500 }], report());
	assert.equal(off.splits, false);
	assert.match(off.sentence, /do not add up to 2,500, so use the locations as a guide/);
	const incomplete = report({ coverage: 'partial', albums: albums([5], [1]).map((item) => ({ ...item, measures: { ...item.measures, photo_opens: null } })) as never });
	const unknown = openLocationsView([{ source: 'x', count: 6 }], incomplete);
	assert.equal(unknown.splits, false);
	assert.equal(unknown.photoOpens, null);
	assert.match(unknown.sentence, /cannot be split here because a day in these dates has incomplete records/);
});

test('traffic impact says which albums it covers and why: 136 of 254', () => {
	const view = trafficView({ report: report(), names: new Map([['a0', 'HS Girls VB - JCA at ACC']]) })!;
	assert.equal(view.impact.rows.length, 136);
	assert.equal(view.impact.scope, 'Lists the 136 of 254 public albums that had at least one recorded photo open in these dates. The other 118 had none in any traffic class, so leaving traffic out cannot change their place.');
	assert.equal(view.impact.rows[0].name, 'HS Girls VB - JCA at ACC');
	// A name that cannot be found is not invented.
	assert.equal(view.impact.rows[1].name, 'An album with no name on record');
	assert.equal(view.impact.changes, 'Leaving the excluded traffic out changes no album\'s place.');
	assert.equal(impactScope(254, 254, 'photo_opens'), 'Lists all 254 public albums, each with at least one recorded photo open in these dates.');
	assert.match(impactScope(3, null, 'downloads'), /^Lists the 3 albums that had at least one recorded download request/);
});

test('traffic classes count audience and unclassified, leave the rest out, and never call unclassified human', () => {
	const view = trafficView({ report: report({ traffic: [{ classification: 'audience', count: 2000 }, { classification: 'unclassified', count: 290 }, { classification: 'operator', count: 1 }, { classification: 'known_crawler', count: 4 }] }), names: new Map() })!;
	assert.deepEqual([view.countedTotal, view.leftOutTotal], [2290, 5]);
	assert.match(view.summary, /^Reports count 2,290 of these photo opens and leave out 5\./);
	assert.match(view.summary, /Unclassified activity is counted and is not called human\./);
	assert.equal(trafficClassWords('unclassified'), 'Unclassified (counted, not called human)');
	const changed = trafficView({ report: report({ trafficImpact: [{ albumKey: 'a0', inclusive: 10, conservative: 8, excluded: 2, inclusiveRank: 1, conservativeRank: 2 }, { albumKey: 'a1', inclusive: 9, conservative: 9, excluded: 0, inclusiveRank: 2, conservativeRank: 1 }] }), names: new Map() })!;
	assert.equal(changed.impact.changes, 'Leaving the excluded traffic out changes the place of 2 albums.');
	assert.equal(changed.impact.rows[0].rankChange, '1 to 2');
	assert.deepEqual(changed.impact.changed.map((row) => row.albumKey), ['a0', 'a1']);
	assert.deepEqual(view.impact.changed, []);
});

test('the status uses Home\'s own rule: current, partial, or attention, with the same problems', () => {
	const current = buildDataView(input());
	assert.equal(current.status.state, 'current');
	assert.equal(current.status.headline, 'Everything is current.');
	assert.match(current.status.detail, /^The gallery counts were last refreshed at 9:40 AM Chicago time and cover every complete day through Oct 5\. They normally refresh every 30 minutes\.$/);
	// A late refresh is the same problem Home shows.
	const late = buildDataView(input({ refreshedAt: '2026-10-06T12:00:00Z' }));
	assert.equal(late.status.state, 'attention');
	assert.equal(late.status.headline, 'One thing needs attention.');
	assert.deepEqual(late.status.problems.map((p) => p.id), ['refresh-late']);
	// A day with incomplete records.
	const gap = buildDataView(input({ report: report({ daily: days('2026-09-06', 30, 'complete', { '2026-10-03': 'partial', '2026-10-04': 'partial' }) }) }));
	assert.equal(gap.status.state, 'attention');
	assert.match(gap.status.problems[0].text, /^Records are incomplete for 2 completed days of the last 7 \(Oct 3, Oct 4\)/);
	assert.equal(gap.status.headline, 'One thing needs attention.');
	// Two causes at once.
	assert.equal(buildDataView(input({ refreshedAt: '2026-10-06T12:00:00Z', incidents: ['search-failures'] })).status.headline, '2 things need attention.');
});

test('a part that could not be read is partial, not healthy, and it names where its own note is', () => {
	const noCloudflare = buildDataView(input({ traffic: { available: false, period: 30, reason: 'Cloudflare Web Analytics access is not configured for this report.' }, posthogConfigured: false }));
	assert.equal(noCloudflare.status.state, 'partial');
	assert.equal(noCloudflare.status.headline, 'Nothing is wrong, but 2 parts of this page could not be read.');
	assert.deepEqual(noCloudflare.status.notRead.map((item) => item.id), ['cloudflare', 'posthog']);
	assert.match(noCloudflare.site.cloudflare.detail, /no Cloudflare access set up here/);
	assert.equal(noCloudflare.site.cloudflare.value, null);
	// A problem and a missing part together are still a problem first.
	assert.equal(buildDataView(input({ posthogConfigured: false, refreshedAt: '2026-10-06T12:00:00Z' })).status.state, 'attention');
	// The gallery summary itself unreadable: said as a problem, with a note where the numbers would be, and no zero.
	const down = buildDataView(input({ report: null }));
	assert.equal(down.status.state, 'attention');
	assert.ok(down.status.problems.some((p) => p.id === 'week-unreadable'));
	assert.equal(down.coverage, null);
	assert.equal(down.traffic, null);
	assert.match(down.reportDown!.what, /not a report of zero/);
});

test('every place the status can point at exists on the page, and so does every place Home points at', () => {
	const known = new Set<string>(DATA_ANCHORS);
	const view = buildDataView(input({ report: report({ daily: days('2026-09-06', 30, 'complete', { '2026-10-04': 'partial' }) }), refreshedAt: '2026-10-06T12:00:00Z', incidents: ['a'], traffic: null, actions: null, posthogConfigured: false, v2: null }));
	assert.ok(view.status.problems.length >= 3);
	for (const problem of view.status.problems) assert.ok(known.has(problem.href), problem.id);
	const notRead: NotRead[] = view.status.notRead;
	assert.ok(notRead.length >= 4);
	for (const item of notRead) assert.ok(known.has(item.section), item.id);
});

test('delivery detail waits for the owner; everyone else is told why and where the failures already show', () => {
	const signedOut = buildDataView(input());
	assert.equal(signedOut.deliveryState, 'owner_only');
	assert.equal(signedOut.delivery.rows, null);
	assert.match(signedOut.deliveryNote!, /shown when you are signed in\. Whether delivery has failed or is late is already in the status above\./);
	const owner = buildDataView(input({ owner: true, health }));
	assert.equal(owner.deliveryState, 'shown');
	assert.equal(owner.deliveryNote, null);
	assert.equal(owner.delivery.rows!.find((row) => row.label === 'Collection, last 30 days')!.value, '500 accepted · 1 rejected · 3 duplicate');
	assert.equal(owner.delivery.rows!.find((row) => row.label === 'Oldest event waiting')!.value, 'None waiting');
	assert.match(owner.delivery.volume!, /^About 300 eligible observations in a future 30-day period/);
	assert.match(owner.delivery.volumeLimit, /not people, provider quota, cost or spend approval\.$/);
	const failed = buildDataView(input({ owner: true, health: parseMeasurementHealth(null) }));
	assert.equal(failed.deliveryState, 'failed');
	assert.match(failed.deliveryNote!, /not a healthy result\. Reload in a few minutes\./);
	assert.match(deliveryView(null, TODAY).quota, /unknown/);
});

test('coverage names the days, the refresh and what the history keeps', () => {
	const full = coverageView({ report: report(), days: 30, refreshedAt: REFRESHED, lastCompleteDay: LAST, now: NOW, today: TODAY })!;
	assert.equal(full.headline, 'Records are complete for all 30 days (Sep 6 – Oct 5).');
	assert.equal(full.since, 'Jul 1');
	const partial = coverageView({ report: report({ daily: days('2026-09-06', 30, 'complete', { '2026-10-01': 'unavailable' }) }), days: 30, refreshedAt: null, lastCompleteDay: LAST, now: NOW, today: TODAY })!;
	assert.match(partial.headline, /^Records are complete for 29 of the last 30 days\. A total that includes an incomplete day is not shown/);
	assert.deepEqual(partial.incompleteDays, ['Oct 1']);
	assert.match(partial.refresh, /could not be read, so whether the counts are current is unknown/);
	assert.equal(coverageView({ report: { ...report(), available: false } as OperatorReport, days: 30, refreshedAt: null, lastCompleteDay: LAST, now: NOW, today: TODAY }), null);
});

test('the status window is the last seven complete days, as on Home, however many days the page covers', () => {
	const freshness: Freshness = { incompleteDays: ['2026-09-20', '2026-10-03'], refreshedAt: REFRESHED, checked: true };
	assert.deepEqual(freshnessForStatus(freshness, LAST, 7).incompleteDays, ['2026-10-03']);
	assert.deepEqual(freshnessForStatus(freshness, LAST, 30).incompleteDays, ['2026-09-20', '2026-10-03']);
	assert.equal(statusView({ problems: [], notRead: [], refreshedAt: null, lastCompleteDay: LAST, today: TODAY }).detail, 'When the gallery counts were last refreshed could not be read, so whether they are current is unknown. They cover complete days through Oct 5.');
});

test('site measures: two counts that are not expected to match, with the days each covers', () => {
	const view = siteMeasuresView({ traffic, actions: actions(), days: 30 });
	assert.equal(view.cloudflare.value, '730');
	assert.equal(view.firstParty.value, '85');
	assert.match(view.firstParty.detail, /^Sep 29 – Oct 5\. The site's own counter began Sep 29, so it covers 7 of the last 30 days\.$/);
	assert.match(view.crossCheck, /^Cloudflare counted 730 page loads\. The site's own counter recorded 85 page views\. They use different definitions and different days, so they are not expected to match and neither one checks the other\.$/);
	assert.match(view.sampling, /Cloudflare adapts how much it samples/);
	assert.deepEqual(view.devices, [{ name: 'mobile', pageLoads: 730 }]);
	const none = siteMeasuresView({ traffic: null, actions: actions({ firstRecordedAt: null }), days: 7 });
	assert.equal(none.cloudflare.value, null);
	assert.equal(none.firstParty.value, null);
	assert.match(none.firstParty.detail, /has not recorded a page view yet\. This is not zero\./);
	assert.match(none.crossCheck, /so they are not compared\.$/);
	assert.equal(none.devices, null);
	assert.match(siteMeasuresView({ traffic, actions: null, days: 7 }).firstParty.detail, /not zero\. Reload in a few minutes\./);
});

test('linked journeys: unavailable reports are said once, with what to do, not as a box each', () => {
	const make = (report: JourneyAggregate['report'], available: boolean, error?: JourneyAggregate['error']): JourneyAggregate => ({ report, available, error, asOf: null, coverage: { start: '', end: '', timezone: 'America/Chicago', definitionVersion: 2, cohort: '', excluded: '', metadata: '' }, totals: {}, breakdown: [] });
	const none = journeysView(['discovery', 'album_use', 'search_usefulness'].map((name) => make(name as JourneyAggregate['report'], false, 'provider_unavailable')));
	assert.equal(none.available.length, 0);
	assert.match(none.unavailable!.what, /^All linked-journey reports need PostHog, which is not connected here \(Discovery, Album use, Search usefulness\)\. No figure is shown, and that is not zero\.$/);
	assert.match(none.unavailable!.todo, /Add the PostHog query settings/);
	const some = journeysView([make('discovery', true), make('album_use', false, 'provider_query_failed')]);
	assert.equal(some.available.length, 1);
	assert.match(some.unavailable!.what, /^1 of 2 linked-journey reports could not be read \(Album use\)\./);
	assert.equal(journeysView([make('discovery', true)]).unavailable, null);
	assert.match(journeysView(null).unavailable!.what, /not zero/);
	assert.match(notReadNote('posthog').todo, /Reload in a few minutes/);
});

test('counting rules and event counts say what a number stands for', () => {
	const view = buildDataView(input());
	assert.match(view.counting!.rule, /counted once per day.*not people\.$/);
	assert.deepEqual(view.counting!.totals.map((item) => item.value), ['2,290', '169', '0']);
	assert.equal(view.counting!.events.counts![0].count, 259);
	const without = buildDataView(input({ v2: null }));
	assert.equal(without.counting!.events.counts, null);
	assert.match(without.eventsDown!.what, /not zero\.$/);
	assert.ok(without.status.notRead.some((item) => item.id === 'events'));
	// A partial period says "recorded", never a bare total.
	const partial = buildDataView(input({ report: report({ coverage: 'partial' }) }));
	assert.equal(partial.counting!.totals[0].value, '2,290 recorded');
});

test('the browser estimate is a figure with its limit, or says it is not shown, and never a zero it cannot prove', () => {
	const limit = 'Estimated browsers with recorded activity, counted once across the report. This is not a verified people count.';
	const counted = buildDataView(input({ report: report({ visitorEstimate: { value: 125, limit } }) }));
	assert.deepEqual(counted.counting!.browsers, { value: '125', limit });
	const unread = buildDataView(input({ report: report({ visitorEstimate: { value: null, limit: 'Estimated visitors are unavailable because the protected retained-data query could not run.' } }) }));
	assert.equal(unread.counting!.browsers.value, null);
	assert.match(unread.counting!.browsers.limit, /unavailable/);
});

test('search and download evidence: nothing is silent, and nothing is called a completed transfer', () => {
	const view = evidenceView(report(), TODAY)!;
	assert.deepEqual(view.rows[0], { path: 'download failed', status: 'failed', recorded: '2', results: 'not recorded', errors: 'E1', latest: 'Oct 3, 7:00 AM' });
	assert.match(view.note, /requests and failures, not completed transfers/);
	assert.equal(evidenceView({ ...report(), available: false } as OperatorReport, TODAY), null);
});

test('the catalogue basis reads as words, and a site-journey failure is said in this page\'s words', () => {
	assert.equal(basisWords('backfill_current_catalogue, event_snapshot, mixed'), 'a backfill from the current catalogue, event snapshots and a mix of both');
	assert.equal(basisWords('event_snapshot'), 'event snapshots');
	assert.equal(basisWords('something_new'), 'something new');
	assert.equal(basisWords(''), 'an unknown source');
	assert.match(siteJourneyNote('PostHog linked journeys are not configured. First-party action counts above remain available.').what, /^PostHog is not connected here, so no linked-journey figure is shown for the site\. This is not zero\.$/);
	assert.doesNotMatch(siteJourneyNote('PostHog linked journeys are not configured. First-party action counts above remain available.').what, /above/);
	assert.match(siteJourneyNote('PostHog linked journeys are still pending after the report deadline. This is not zero activity.').todo, /Reload in a few minutes/);
	assert.match(siteJourneyNote('PostHog linked journeys could not be read.').todo, /check the PostHog query settings/);
});
