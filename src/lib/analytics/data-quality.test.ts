import assert from 'node:assert/strict';
import test from 'node:test';
import {
	basisWords, buildDataView, coverageView, deliveryView, rejectionSplit, rejectedOnDay, EVENTS_NOT_READ, eventsView, evidenceView, freshnessForStatus, impactScope, journeysView, notReadNote, openLocationsView,
	siteJourneyNote, siteMeasuresView, statusView, trafficClassWords, trafficView, withNotRead, type DataInput, type NotRead
} from './data-quality';
import { DATA_ANCHORS } from './data-anchors';
import type { Freshness } from './home';
import { parseMeasurementHealth, rejectionReading, type RejectionDay } from './measurement-health';
import type { OperatorReport } from './operator-report.server';
import type { JourneyAggregate } from './posthog.types';
import type { SiteActionReport } from './site-actions';
import { summarizeSiteTraffic } from './site-traffic.server';
import { unavailableV2ReportProjection, type V2ReportProjection } from './v2-report-projection.server';

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
		asOf: NOW, today: TODAY, lastCompleteDay: LAST, days: 30, owner: false, report: report(), names: new Map(), health: null, refreshedAt: REFRESHED,
		incidents: [], diagnostics: [], rejections: null, traffic, actions: actions(), posthogConfigured: true, ...over
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
	assert.equal(changed.impact.rows[0].rankChange, '1st to 2nd');
	assert.equal(changed.impact.rows[0].movement, 'Goes from 1st to 2nd when the left-out traffic is removed: 10 with all traffic, 8 counted.');
	assert.equal(trafficView({ report: report({ trafficImpact: [{ albumKey: 'a0', inclusive: 5, conservative: 5, excluded: 0, inclusiveRank: 3, conservativeRank: 3 }] }), names: new Map() })!.impact.rows[0].rankChange, '3rd, no change');
	assert.deepEqual(changed.impact.changed.map((row) => row.albumKey), ['a0', 'a1']);
	assert.deepEqual(view.impact.changed, []);
});

test('the status uses Home\'s own rule: current, partial, or attention, with the same problems', () => {
	// Every part reaches back to the first day asked for: nothing limited, nothing wrong.
	const FULL = { diagnosticsCoverage: { availableFrom: '2026-09-01', label: 'x', error: null } };
	const current = buildDataView(input({ report: report(FULL) }));
	assert.equal(current.status.state, 'current');
	assert.equal(current.status.headline, 'The gallery counts are current.');
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

test('the headline is the worst state on the page: a limit leads a quiet page, and anything worse leads over a limit', () => {
	// Production's shape: search and download evidence began on Sep 29, after the first day of the 30 asked for.
	const limited = buildDataView(input());
	assert.equal(limited.status.state, 'limited');
	assert.equal(limited.status.headline, 'The gallery counts are current. Search and download evidence starts on Sep 29; earlier days have no record.');
	assert.deepEqual(limited.status.limits, ['Search and download evidence starts on Sep 29; earlier days have no record.']);
	// A 7-day page that sits wholly inside the evidence has nothing to limit.
	const week = buildDataView(input({ days: 7, report: report({ query: { start: '2026-09-29', end: LAST } as never }) }));
	assert.equal(week.status.state, 'current');
	// Evidence never recorded at all is said, not left as a quiet page.
	assert.equal(buildDataView(input({ report: report({ diagnosticsCoverage: { availableFrom: null, label: 'x', error: null } }) })).status.headline, 'The gallery counts are current. No search or download attempt has been recorded yet.');
	// Daily records that begin after the first day asked for are a limit too, and both are said: one in the headline, the rest in the detail.
	const both = buildDataView(input({ report: report({ preservedSince: '2026-09-15' }) }));
	assert.equal(both.status.limits.length, 2);
	assert.match(both.status.detail, /History is kept since Sep 15; earlier days have no record\.$/);
	// Something worse than a limit leads, and the limit is still said.
	const worse = buildDataView(input({ refreshedAt: '2026-10-06T12:00:00Z' }));
	assert.equal(worse.status.headline, 'One thing needs attention.');
	assert.match(worse.status.detail, /Search and download evidence starts on Sep 29/);
	const partial = buildDataView(input({ posthogConfigured: false }));
	assert.equal(partial.status.state, 'partial');
	// A visitor is not shown delivery and collection health, so a visitor's page never gives an all-clear for the rest.
	assert.equal(partial.status.headline, '1 part of this page could not be read. Collection health is shown to the owner only.');
	assert.equal(buildDataView(input({ posthogConfigured: false, owner: true })).status.headline, '1 part of this page could not be read. No problem was found in the rest.');
	// Evidence that could not be read at all is a part not read, never "none recorded".
	const broken = buildDataView(input({ report: report({ diagnosticsCoverage: { availableFrom: null, label: 'x', error: 'diagnostics unavailable' } }) }));
	assert.deepEqual(broken.status.notRead.map((item) => item.id), ['evidence']);
	assert.equal(broken.status.limits.length, 0);
});

test('a part that could not be read is partial, not healthy, and it names where its own note is', () => {
	const noCloudflare = buildDataView(input({ owner: true, traffic: { available: false, period: 30, reason: 'Cloudflare Web Analytics access is not configured for this report.' }, posthogConfigured: false }));
	assert.equal(noCloudflare.status.state, 'partial');
	assert.equal(noCloudflare.status.headline, '2 parts of this page could not be read. No problem was found in the rest.');
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
	const view = buildDataView(input({ report: report({ daily: days('2026-09-06', 30, 'complete', { '2026-10-04': 'partial' }) }), refreshedAt: '2026-10-06T12:00:00Z', incidents: ['a'], traffic: null, actions: null, posthogConfigured: false }));
	assert.ok(view.status.problems.length >= 3);
	for (const problem of view.status.problems) assert.ok(known.has(problem.href), problem.id);
	const notRead: NotRead[] = view.status.notRead;
	assert.ok(notRead.length >= 3);
	for (const item of [...notRead, EVENTS_NOT_READ]) assert.ok(known.has(item.section), item.id);
});

test('delivery detail waits for the owner; everyone else is told why and where the failures already show', () => {
	const signedOut = buildDataView(input());
	assert.equal(signedOut.deliveryState, 'owner_only');
	assert.equal(signedOut.delivery.rows, null);
	assert.match(signedOut.deliveryNote!, /shown when you are signed in\. Whether delivery to the analytics provider has failed or is late is already in the status above\./);
	const owner = buildDataView(input({ owner: true, health }));
	assert.equal(owner.deliveryState, 'shown');
	assert.equal(owner.deliveryNote, null);
	assert.equal(owner.delivery.rows!.find((row) => row.label === 'Collection, last 30 days')!.value, '500 accepted · 1 rejected · 3 duplicate');
	// Every word in those rows is defined where the rows are, and a signed-out reader has no rows and so no terms.
	const terms = owner.delivery.terms.map((item) => item.term);
	assert.deepEqual(terms, ['Accepted', 'Rejected', 'Duplicate', 'Usual', 'Pending', 'Submitted', 'Confirmed', 'Failed', 'Classification changes waiting']);
	assert.match(owner.delivery.terms.find((item) => item.term === 'Rejected')!.means, /Crawlers are rejected on purpose\. An event that could not be stored is lost unless the browser's one retry worked\.$/);
	// Before the reasons migration the reading has no day list: the rows say so, never a zero.
	assert.equal(owner.delivery.rows!.find((row) => row.label === 'Why events were rejected, last 30 days')!.value, 'Not recorded yet. Reasons are kept from the day the collector update is installed.');
	assert.equal(owner.delivery.rows!.find((row) => row.label === 'Rejected on Oct 5')!.value, 'Not recorded yet');
	assert.deepEqual(signedOut.delivery.terms, []);
	assert.equal(owner.delivery.rows!.find((row) => row.label === 'Oldest event waiting')!.value, 'None waiting');
	assert.match(owner.delivery.volume!, /^About 300 eligible observations in a future 30-day period/);
	assert.match(owner.delivery.volumeLimit, /not people, provider quota, cost or spend approval\.$/);
	const failed = buildDataView(input({ owner: true, health: parseMeasurementHealth(null) }));
	assert.equal(failed.deliveryState, 'failed');
	assert.match(failed.deliveryNote!, /not a healthy result\. Reload in a few minutes\./);
	assert.match(deliveryView(null, TODAY, null, '2026-10-05').quota, /unknown/);
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
	assert.equal(statusView({ problems: [], notRead: [], refreshedAt: null, lastCompleteDay: LAST, today: TODAY, owner: true }).detail, 'When the gallery counts were last refreshed could not be read, so whether they are current is unknown. They cover complete days through Oct 5.');
});

test('site measures: two counts that are not expected to match, with the days each covers', () => {
	const view = siteMeasuresView({ traffic, actions: actions(), days: 30, owner: true });
	assert.equal(view.cloudflare.value, '730');
	assert.equal(view.firstParty.value, '85');
	assert.match(view.firstParty.detail, /^Sep 29 – Oct 5\. The site's own counter began Sep 29, so it covers 7 of the last 30 days\.$/);
	assert.match(view.crossCheck, /^Cloudflare counted 730 page loads\. The site's own counter recorded 85 page views\. They use different definitions and different days, so they are not expected to match and neither one checks the other\.$/);
	assert.match(view.sampling, /Cloudflare adapts how much it samples/);
	assert.deepEqual(view.devices, [{ name: 'mobile', pageLoads: 730 }]);
	const none = siteMeasuresView({ traffic: null, actions: actions({ firstRecordedAt: null }), days: 7, owner: true });
	assert.equal(none.cloudflare.value, null);
	assert.equal(none.firstParty.value, null);
	assert.match(none.firstParty.detail, /has not recorded a page view yet\. This is not zero\./);
	assert.match(none.crossCheck, /so they are not compared\.$/);
	assert.equal(none.devices, null);
	assert.match(siteMeasuresView({ traffic, actions: null, days: 7, owner: true }).firstParty.detail, /not zero\. Reload in a few minutes\./);
});

test('linked journeys: unavailable reports are said once, with what to do, not as a box each', () => {
	const make = (report: JourneyAggregate['report'], available: boolean, error?: JourneyAggregate['error']): JourneyAggregate => ({ report, available, error, asOf: null, coverage: { start: '', end: '', timezone: 'America/Chicago', definitionVersion: 2, cohort: '', excluded: '', metadata: '' }, totals: {}, breakdown: [] });
	const none = journeysView(['discovery', 'album_use', 'search_usefulness'].map((name) => make(name as JourneyAggregate['report'], false, 'provider_unavailable')), true);
	assert.equal(none.available.length, 0);
	assert.match(none.unavailable!.what, /^All linked-journey reports need PostHog, which is not connected here \(Discovery, Album use, Search usefulness\)\. No figure is shown, and that is not zero\.$/);
	assert.match(none.unavailable!.todo, /Add the PostHog query settings/);
	const some = journeysView([make('discovery', true), make('album_use', false, 'provider_query_failed')], true);
	assert.equal(some.available.length, 1);
	assert.match(some.unavailable!.what, /^1 of 2 linked-journey reports could not be read \(Album use\)\./);
	assert.equal(journeysView([make('discovery', true)], true).unavailable, null);
	assert.match(journeysView(null, true).unavailable!.what, /not zero/);
	assert.match(notReadNote('posthog', true).todo, /Reload in a few minutes/);
});

test('counting rules and event counts say what a number stands for', () => {
	const view = buildDataView(input());
	assert.match(view.counting!.rule, /counted once per day.*not people\.$/);
	assert.deepEqual(view.counting!.totals.map((item) => item.value), ['2,290', '169', '0']);
	// The event counts arrive after the page, from their own view.
	const events = eventsView(v2, true);
	assert.equal(events.available, true);
	assert.equal(events.counts![0].count, 259);
	assert.equal(events.down, null);
	const without = eventsView(null, true);
	assert.deepEqual([without.available, without.counts], [false, null]);
	assert.match(without.down!.what, /not zero\.$/);
	assert.equal(without.label, 'Detailed event counts were not read.');
	assert.match(eventsView(unavailableV2ReportProjection({} as never), true).label, /^Detailed event counts could not be read\. This is not a zero-result or complete-coverage report\.$/);
	// Until they arrive the page says nothing about them; if they cannot be read the headline changes with them.
	const status = buildDataView(input()).status;
	assert.ok(!status.notRead.some((item) => item.id === 'events'));
	const failed = withNotRead(status, EVENTS_NOT_READ);
	assert.equal(failed.state, 'partial');
	assert.equal(failed.headline, '1 part of this page could not be read. Collection health is shown to the owner only.');
	assert.equal(withNotRead(buildDataView(input({ owner: true })).status, EVENTS_NOT_READ).headline, '1 part of this page could not be read. No problem was found in the rest.');
	assert.match(failed.detail, /Search and download evidence starts on Sep 29/, 'what the numbers do not reach back to is still said');
	assert.equal(withNotRead(failed, EVENTS_NOT_READ), failed, 'the same part is not added twice');
	// Something that needs attention stays the headline.
	const worse = buildDataView(input({ refreshedAt: '2026-10-06T12:00:00Z' })).status;
	assert.equal(withNotRead(worse, EVENTS_NOT_READ).headline, 'One thing needs attention.');
	assert.deepEqual(withNotRead(worse, EVENTS_NOT_READ).notRead.map((item) => item.id), ['events']);
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
	assert.deepEqual(view.rows[0], { path: 'download failed', status: 'failed', recorded: '2', results: 'none counted', errors: 'E1', latest: 'Oct 3, 7:00 AM' });
	assert.match(view.note, /requests and failures, not completed transfers/);
	// "none counted" is explained where it appears: a requested row has no results yet, a download never has any.
	assert.match(view.note, /A "requested" row is written before any result exists, so it reads "none counted"/);
	assert.match(view.note, /A download has no result count\./);
	assert.equal(evidenceView({ ...report(), available: false } as OperatorReport, TODAY), null);
});

test('the catalogue basis reads as words, and a site-journey failure is said in this page\'s words', () => {
	assert.equal(basisWords('backfill_current_catalogue, event_snapshot, mixed'), 'a backfill from the current catalogue, event snapshots and a mix of both');
	assert.equal(basisWords('event_snapshot'), 'event snapshots');
	assert.equal(basisWords('something_new'), 'something new');
	assert.equal(basisWords(''), 'an unknown source');
	assert.match(siteJourneyNote('PostHog linked journeys are not configured. First-party action counts above remain available.', true).what, /^PostHog is not connected here, so no linked-journey figure is shown for the site\. This is not zero\.$/);
	assert.doesNotMatch(siteJourneyNote('PostHog linked journeys are not configured. First-party action counts above remain available.', true).what, /above/);
	assert.match(siteJourneyNote('PostHog linked journeys are still pending after the report deadline. This is not zero activity.', true).todo, /Reload in a few minutes/);
	assert.match(siteJourneyNote('PostHog linked journeys could not be read.', true).todo, /check the PostHog query settings/);
});

test('a page with a part missing no longer says nothing is wrong', () => {
	const partial = buildDataView(input({ posthogConfigured: false }));
	assert.doesNotMatch(partial.status.headline, /Nothing is wrong/);
});

test('S11: a visitor is told that a part is not available, and never handed the owner\'s setup', () => {
	// Cloudflare not set up: the owner reads what to add; a visitor reads only that page loads are not available.
	const unset = { available: false as const, period: 30 as const, reason: 'Cloudflare Web Analytics access is not configured for this report.' };
	const owner = siteMeasuresView({ traffic: unset, actions: actions(), days: 30, owner: true });
	assert.match(owner.cloudflare.detail, /Add the Cloudflare analytics settings to the site's server settings\./);
	const visitor = siteMeasuresView({ traffic: unset, actions: actions(), days: 30, owner: false });
	assert.equal(visitor.cloudflare.detail, 'Page loads are not available right now.');
	// The journeys: the owner reads which settings to add; a visitor reads the fact and, when it helps, to reload.
	const make = (report: JourneyAggregate['report'], error: JourneyAggregate['error']): JourneyAggregate => ({ report, available: false, error, asOf: null, coverage: { start: '', end: '', timezone: 'America/Chicago', definitionVersion: 2, cohort: '', excluded: '', metadata: '' }, totals: {}, breakdown: [] });
	const missing = [make('discovery', 'provider_unavailable')];
	assert.match(journeysView(missing, true).unavailable!.todo, /Add the PostHog query settings to the site's server settings/);
	assert.equal(journeysView(missing, false).unavailable!.todo, '');
	assert.equal(journeysView(null, false).unavailable!.todo, 'Reload in a few minutes.');
	// Server settings, the database and the delivery job are the owner's.
	for (const kind of ['cloudflare', 'posthog', 'events', 'report', 'delivery'] as const) {
		assert.doesNotMatch(notReadNote(kind, false).todo, /server settings|database|delivery job|token/, kind);
		assert.equal(notReadNote(kind, false).what, notReadNote(kind, true).what, `${kind}: the fact is the same for everyone`);
	}
	assert.equal(siteJourneyNote('PostHog linked journeys are not configured.', false).todo, '');
	// The whole page, built for a visitor, carries none of it.
	const page = buildDataView(input({ owner: false, traffic: unset, posthogConfigured: false, report: null }));
	assert.doesNotMatch(JSON.stringify(page), /server settings|database is the thing to check|delivery job/);
});

test('S13: the traffic classes say what they mean for the numbers, in the share they come to', () => {
	// Production, 2026-10-07: 454 audience and 1,893 unclassified, so 81% of the counted actions could not be sorted.
	const heavy = trafficView({ report: report({ traffic: [{ classification: 'audience', count: 454 }, { classification: 'unclassified', count: 1893 }, { classification: 'operator', count: 1 }] }), names: new Map() })!;
	assert.equal(heavy.meaning, '81% of the counted actions came from browsers the collector could not sort as audience, operator, test or automated. They are counted, and they are not called human, so read these totals as an upper limit on what real visitors did.');
	// A small share is said without the warning.
	const light = trafficView({ report: report({ traffic: [{ classification: 'audience', count: 2000 }, { classification: 'unclassified', count: 290 }] }), names: new Map() })!;
	assert.equal(light.meaning, '13% of the counted actions came from browsers the collector could not sort as audience, operator, test or automated. They are counted, and they are not called human.');
	// Nothing unclassified, nothing to explain.
	assert.equal(trafficView({ report: report({ traffic: [{ classification: 'audience', count: 100 }] }), names: new Map() })!.meaning, null);
});

test('S13: the owner\'s delivery rows and the parts that could not be read use words a tired reader can follow', () => {
	const owner = buildDataView(input({ owner: true, health }));
	assert.equal(owner.delivery.rows!.find((row) => row.label === 'Event format and your classification changes')!.value, 'Event format 2 · 0 classification changes waiting to reach PostHog');
	assert.deepEqual(buildDataView(input({ posthogConfigured: false })).status.notRead.map((item) => item.name), ['what visitors did after arriving (PostHog)']);
	assert.doesNotMatch(JSON.stringify(buildDataView(input({ owner: true, health, posthogConfigured: false }))), /linked journeys \(PostHog\)|Traffic corrections|Place \d/);
});

/* Daily rejections, Chicago days, from analytics_collection_delivery_counters read on 2026-10-07. Oct 2 to Oct 5 are its
 * exact figures. Sep 29 to Oct 1 are stand-ins inside the range that read reported, about 400 to 430 a day. */
const SURGE: RejectionDay[] = [
	{ day: '2026-09-29', reason: 'not_recorded', count: 412 }, { day: '2026-09-30', reason: 'not_recorded', count: 431 }, { day: '2026-10-01', reason: 'not_recorded', count: 405 },
	{ day: '2026-10-02', reason: 'not_recorded', count: 24882 }, { day: '2026-10-03', reason: 'not_recorded', count: 27842 }, { day: '2026-10-04', reason: 'not_recorded', count: 23316 },
	{ day: '2026-10-05', reason: 'not_recorded', count: 20528 }
];

test('delivery rows split refusals by reason and compare the last complete day with the usual rate', () => {
	assert.equal(rejectionSplit([]), 'None rejected');
	assert.equal(rejectionSplit([...SURGE, { day: '2026-10-07', reason: 'known_crawler', count: 900 }, { day: '2026-10-07', reason: 'accept_failed', count: 2 }, { day: '2026-10-07', reason: 'invalid_event', count: 1 }, { day: '2026-10-07', reason: 'invalid_json', count: 1 }]),
		'97,816 counted before reasons were kept · 900 from known crawlers · 2 could not be stored · 2 not valid');
	assert.deepEqual(rejectedOnDay(rejectionReading(SURGE, LAST), SURGE, LAST), { label: 'Rejected on Oct 5', value: '20,528 (usual 412 a day)' });
	assert.equal(rejectedOnDay(rejectionReading(SURGE, '2026-09-30'), SURGE, '2026-09-30').value, '431 (usual not known yet)');
	assert.equal(rejectedOnDay(null, [], LAST).value, 'None');
	const health = parseMeasurementHealth({ schema_version: 2, pending: 0, submitted: 0, confirmed: 1, failed: 0, collection: { accepted: 1, rejected: 1, duplicate: 0 }, collection_rejected_days: SURGE });
	const view = buildDataView(input({ owner: true, health, rejections: rejectionReading(SURGE, LAST) }));
	assert.equal(view.delivery.rows!.find((row) => row.label === 'Rejected on Oct 5')!.value, '20,528 (usual 412 a day)');
	// A surge leads the status: the headline can never say nothing is wrong above it.
	assert.equal(view.status.state, 'attention');
	assert.deepEqual(view.status.problems.map((problem) => problem.id), ['collection-surge']);
	assert.equal(view.status.problems[0].href, 'delivery');
	// The surge alone is the headline in its own words, and the list under it carries only what the headline leaves out.
	assert.equal(view.status.headline, 'The collector rejected 20,528 events on Oct 5, 50 times its usual 412 a day.');
	assert.ok(!view.status.problems[0].text.startsWith('The collector rejected'), 'the headline is not said again under itself');
	// With another problem the headline is a count, and the surge is said in full in the list.
	const two = buildDataView(input({ owner: true, health, rejections: rejectionReading(SURGE, LAST), refreshedAt: '2026-10-06T12:00:00Z' }));
	assert.equal(two.status.headline, '2 things need attention.');
	assert.ok(two.status.problems.some((problem) => problem.id === 'collection-surge' && problem.text.startsWith('The collector rejected 20,528 events')));
});
