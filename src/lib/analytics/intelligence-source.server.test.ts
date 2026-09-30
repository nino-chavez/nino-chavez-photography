import assert from 'node:assert/strict';
import test from 'node:test';
import { loadIntelligenceEvidence } from './intelligence-source.server';

const galleryScope = { kind: 'gallery' as const, query: { start: '2026-09-01', end: '2026-09-30', measure: 'photo_opens' as const, scope: 'all' as const, albumKeys: [], compare: 'previous' as const, traffic: 'conservative' as const } };
const aggregate = (report: any, totals: Record<string, number | null>) => ({ report, available: true, asOf: '2026-10-01T02:00:00.000Z', coverage: { start: '2026-09-01', end: '2026-09-30', timezone: 'America/Chicago' as const, definitionVersion: 2 as const, cohort: 'test', excluded: 'test', metadata: 'test' }, totals, breakdown: [] });

test('gallery adapter preserves provider cohorts, per-target discovery, and deduplicated observed render denominator', async () => {
	const evidence = await loadIntelligenceEvidence({} as any, galleryScope, new Date('2026-10-01T03:00:00.000Z'), {
		gallery: [
			aggregate('search_usefulness', { searches_shown: 30, zero_result_searches: 12, selected_searches: 3 }),
			aggregate('download_reliability', { requests: 25, failed: 2, unknown_terminal_outcome: 4, handed_off: 19 }),
			aggregate('sources_return', { tagged_arrival_visits: 40, subsequent_favorite_visits: 2 })
		],
		decision: { available: true, asOf: '2026-10-01T02:00:00.000Z', truncated: false, photoResponses: [{ photoId: 'photo-1', albumKey: 'album-1', exposures: 25, favorites: 2, downloadItems: 2, responses: 3 }], albumDiscovery: [{ albumKey: 'album-1', exposures: 30, opens: 2, directEntries: 1 }], rendering: { rendered: 20, failed: 1, observedTerminal: 20 }, search: { submitted: 31, failed: 1 } }
	}, {
		diagnostics: async () => [],
		galleryReport: async () => ({ dataAsOf: '2026-10-01T02:00:00.000Z', coverage: 'complete', previousCoverage: 'complete', total: 50, previousTotal: 25, photos: [], publicationAge: { missingAlbumKeys: [] }, albums: [{ albumKey: 'album-1', count: 50, previousCount: 25 }] })
	});
	assert.equal(evidence.albumDiscovery?.[0].albumKey, 'album-1');
	assert.equal(evidence.linkedPhotoResponse?.[0].evidenceLinks[0], '/photo/photo-1');
	assert.equal(evidence.rendering?.observedTerminal, 20);
	assert.deepEqual(evidence.search, { submitted: 31, resultsShown: 30, emptyResults: 12, failures: 1, selections: 3 });
	assert.deepEqual(evidence.distribution, { taggedArrivals: 40, laterNamedAction: 2, actionName: 'favorite-added' });
});

test('site adapter uses actual UTC report boundaries and keeps previous coverage partial when history starts too late', async () => {
	const scope = { kind: 'sites' as const, period: 30 as const, section: 'all' as const };
	const evidence = await loadIntelligenceEvidence({} as any, scope, new Date('2026-10-01T03:00:00.000Z'), {
		site: [
			{ section: 'profile', views: 30, contactViews: 1, outboundViews: 0, articleViews: 0, progressViews: 0, activeViews: 0, demoViews: 0, lastSectionViews: 0 },
			{ section: 'writing', views: 30, contactViews: 0, outboundViews: 0, articleViews: 30, progressViews: 2, activeViews: 1, demoViews: 0, lastSectionViews: 0 },
			{ section: 'demos', views: 30, contactViews: 0, outboundViews: 0, articleViews: 0, progressViews: 0, activeViews: 0, demoViews: 30, lastSectionViews: 3 }
		]
	}, {
		diagnostics: async () => [],
		siteReport: async () => ({ available: true, start: '2026-09-01', end: '2026-09-30', firstRecordedAt: '2026-08-20T00:00:00.000Z', excludedEvents: 0, totals: { page_views: 90 }, previousTotals: { page_views: 0 }, todayTotals: {}, recordedSections: ['profile', 'writing', 'demos'], page: 0, pageCount: 1, pages: [], freshness: { status: 'current', completedThrough: '2026-09-30', summaryCutoffAt: '2026-10-01T02:00:00.000Z', refreshedAt: '2026-10-01T02:00:00.000Z', lastFailureAt: null, todayAvailable: false } })
	});
	assert.equal(evidence.coverage, 'complete');
	assert.equal(evidence.previousCoverage, 'partial');
	assert.deepEqual(evidence.siteWindows, { current: { start: '2026-09-01', end: '2026-09-30' }, previous: { start: '2026-08-02', end: '2026-08-31' } });
	assert.deepEqual(evidence.siteJourneys?.map((row) => row.kind), ['profile', 'writing', 'demos']);
});

test('malformed site report dates never become a complete placeholder window', async () => {
	const scope = { kind: 'sites' as const, period: 30 as const, section: 'profile' as const };
	const evidence = await loadIntelligenceEvidence({} as any, scope, new Date('2026-10-01T03:00:00.000Z'), {}, {
		diagnostics: async () => [],
		siteReport: async () => ({ available: true, start: 'not-a-date', end: 'also-not-a-date', firstRecordedAt: '2026-01-01T00:00:00.000Z', excludedEvents: 0, totals: {}, previousTotals: {}, todayTotals: {}, recordedSections: [], page: 0, pageCount: 1, pages: [], freshness: { status: 'current', completedThrough: '2026-09-30', summaryCutoffAt: '2026-10-01T02:00:00.000Z', refreshedAt: '2026-10-01T02:00:00.000Z', lastFailureAt: null, todayAvailable: false } })
	});
	assert.equal(evidence.coverage, 'partial');
	assert.equal(evidence.siteWindows, undefined);
});

for (const [name, health, failure, expected] of [
 ['healthy quiet collection', { failed:0, pending:0 }, null, []],
 ['failed delivery', {failed:2,pending:0}, null, ['provider_delivery_failures']],
 ['late pending delivery', {failed:0,pending:3,oldest_pending_at:'2026-09-30T00:00:00Z'}, null, ['provider_delivery_overdue']],
 ['fresh pending delivery', {failed:0,pending:3,oldest_pending_at:'2026-10-01T02:59:00Z'}, null, []],
 ['unreadable health', null, {message:'unavailable'}, ['delivery_health_unavailable']]
] as const) test(`actual collection health input: ${name}`, async()=>{
 const client={rpc:async()=>({data:health,error:failure})} as any;
 const result=await loadIntelligenceEvidence(client,galleryScope,new Date('2026-10-01T03:00:00Z'),{}, {galleryReport:async()=>({dataAsOf:null,coverage:'partial',previousCoverage:'partial',total:0,previousTotal:0,photos:[],publicationAge:{missingAlbumKeys:[]},albums:[]})});
 assert.deepEqual(result.diagnostics?.map(row=>row.type), expected);
});
