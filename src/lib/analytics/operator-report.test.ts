import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { aggregateDiagnostics, buildOperatorReport, reportCsv, type OperatorReport } from './operator-report.server';
import { decodeScheduledGalleryReport, fetchScheduledGalleryReport } from './scheduled-gallery-report.server';
import type { ReportQuery } from './report-contract';
import type { V2ReportProjection } from './v2-report-projection.server';

const query: ReportQuery = { start: '2026-09-01', end: '2026-09-30', measure: 'photo_opens', scope: 'all', albumKeys: [], traffic: 'conservative', compare: 'previous' };
const totals = { photo_opens: 2, album_opens: 0, downloads: 0, favorites: 0, shares: 0 };
function payload(overrides: Record<string, unknown> = {}) {
	return { coverage: 'complete', previousCoverage: 'complete', total: 2, previousTotal: 1, observedTotal: 2, today: { date: '2026-09-29', count: 1, asOf: '2026-09-29T12:00:00Z' }, dataAsOf: '2026-09-29T12:00:00Z', preservedSince: '2026-01-01', catalogueBasis: 'event_snapshot', daily: [{ date: '2026-09-01', coverage: 'complete', count: 2, observed: 2 }], albums: [{ albumKey: 'visible', count: 2, previousCount: 1, difference: 1, risingValue: 1, measures: totals, lastActivity: null, publicationAt: null }], photos: [{ photoId: 'visible-photo', albumKey: 'visible', count: 2, previousCount: 1, difference: 1, risingValue: 1, measures: totals, lastActivity: null, imageUrl: null }], photoPagination: { page: 0, pageSize: 24, total: 1, pageCount: 1, rank: 'popular' }, albumOnlyActions: [], sources: { arrivals: [], openLocations: [], unknown: 0 }, traffic: [], trafficImpact: [], publicationAge: { available: false, label: 'Not selected.', days: 30, albums: [], missingAlbumKeys: [] }, ...overrides };
}
function fixture(result: { data?: unknown; error?: { code?: string; message: string } }) {
	const calls: string[] = [];
	return { calls, client: {
		async rpc(name: string) { calls.push(name); return { data: result.data ?? null, error: result.error ?? null }; },
		from() { return { select() { return { async in() { return { data: [{ photo_id: 'visible-photo', album_key: 'visible', cf_image_id: 'image-id' }], error: null }; } }; } }; }
	} as unknown as SupabaseClient };
}
function completeReport(overrides: Partial<OperatorReport> = {}): OperatorReport {
	return { available: true, query, previous: { start: '2026-08-02', end: '2026-08-31' }, comparison: { start: '2026-08-02', end: '2026-08-31', total: 0, coverage: 'complete', label: 'Previous equal period' }, coverage: 'complete', previousCoverage: 'complete', total: 0, previousTotal: 0, change: null, rising: { available: true, basis: 'absolute', currentDays: 30, previousDays: 30, label: 'Equal windows.' }, observedTotal: 0, catalogueBasis: 'event_snapshot', today: { date: '2026-09-29', count: null, asOf: null }, dataAsOf: null, preservedSince: null, daily: [], albums: [], photos: [], albumOnlyActions: [], sources: { arrivals: [], openLocations: [], unknown: 0 }, traffic: [], trafficImpact: [], diagnostics: [], diagnosticsCoverage: { availableFrom: null, label: '', error: null }, visitorEstimate: { value: 7, limit: '' }, publicationAge: { available: false, label: '', days: 30, albums: [], missingAlbumKeys: [] }, generatedAt: '2026-09-29T00:00:00Z', ...overrides };
}
test('full CSV preserves more than the PostgREST default page', () => {
	const photos=Array.from({length:1105},(_,i)=>({photoId:`photo-${i+1}`,albumKey:'alpha',count:i+1,previousCount:i,difference:1,risingValue:1,measures:{...totals,photo_opens:i+1},lastActivity:null,imageUrl:null}));
	const csv=reportCsv(completeReport({photos}));assert.equal(csv.split('\n').length,1106);assert.match(csv,/"photo-1105"/);
});
test('album and album-only action grains survive CSV export', () => {
	const album={albumKey:'alpha',count:12,previousCount:8,difference:4,risingValue:4,measures:{...totals,album_opens:12},lastActivity:null,publicationAt:null};
	assert.match(reportCsv(completeReport({query:{...query,measure:'album_opens'},albums:[album]})),/"album","","alpha","12"/);
	const mixed=reportCsv(completeReport({query:{...query,measure:'downloads'},photos:[{photoId:'one',albumKey:'alpha',count:2,previousCount:3,difference:-1,risingValue:-1,measures:{...totals,downloads:2},lastActivity:null,imageUrl:null}],albumOnlyActions:[{albumKey:'alpha',count:3,previousCount:0,difference:3,lastActivity:null}]}));
	assert.match(mixed,/"album_action","","alpha","3"/);assert.equal(mixed.split('\n').length,3);
});
test('CSV retains all measures and identifier-free v2 labels', () => {
	const v2:V2ReportProjection={available:true,coverage:{start:query.start,end:query.end,firstRecordedAt:null,rawRetainedFrom:null,archivedFrom:null,archivedThrough:null,label:'Coverage label'},counts:[{event:'photo_opened',label:'Photos opened',count:3}]};
	const csv=reportCsv(completeReport(),undefined,v2);assert.match(csv,/"photo_opens","album_opens","downloads","favorites","shares"/);assert.match(csv,/"Photos opened"/);assert.doesNotMatch(csv,/visit_id|anonymous_browser_id/);
});
test('diagnostics retain result aggregates and bounded error categories', () => {
	const rows=aggregateDiagnostics([
		{id:1,diagnostic_type:'search_results',status:'ok',occurred_at:'2026-09-28T12:00:00Z',traffic_context:'audience',album_key:null,photo_id:null,source:null,result_count:0,error_code:null},
		{id:2,diagnostic_type:'search_results',status:'ok',occurred_at:'2026-09-28T13:00:00Z',traffic_context:'audience',album_key:null,photo_id:null,source:null,result_count:3,error_code:null},
		{id:3,diagnostic_type:'download',status:'failed',occurred_at:'2026-09-28T14:00:00Z',traffic_context:'audience',album_key:'alpha',photo_id:null,source:null,result_count:null,error_code:'upstream_503'}
	]);
	assert.deepEqual(rows.find((row)=>row.type==='search_results'),{type:'search_results',status:'ok',count:2,resultCount:3,errorCodes:[],latestAt:'2026-09-28T13:00:00Z'});assert.deepEqual(rows.find((row)=>row.type==='download')?.errorCodes,['upstream_503']);
});
test('scheduled adapter maps bounded aggregate payloads and paging', async () => {
	const f = fixture({ data: payload() });
	const report = await fetchScheduledGalleryReport(f.client, query, { photoWindow: { page: 1, pageSize: 12, rank: 'rising' } });
	assert.equal(report.photos[0].photoId, 'visible-photo');
	assert.deepEqual(f.calls, ['analytics_read_scheduled_gallery_report']);
});
test('missing scheduled RPC is honest and never falls back to evidence', async () => {
	const f = fixture({ error: { code: 'PGRST202', message: 'missing' } });
	const report = await buildOperatorReport(f.client, query);
	assert.equal(report.available, false); assert.deepEqual(f.calls, ['analytics_read_scheduled_gallery_report']);
});
test('invalid scheduled payload is rejected', () => assert.throws(() => decodeScheduledGalleryReport({ coverage: 'complete' }), /Invalid scheduled gallery report/));
test('decoder rejects unsafe counts and broken coverage null semantics', () => {
	assert.throws(() => decodeScheduledGalleryReport(payload({ observedTotal: Number.MAX_SAFE_INTEGER + 1 })), /Invalid scheduled gallery totals/);
	assert.throws(() => decodeScheduledGalleryReport(payload({ coverage: 'partial', total: 2 })), /coverage semantics/);
	assert.throws(() => decodeScheduledGalleryReport(payload({ daily: [{ date: '2026-09-01', coverage: 'unavailable', count: 0, observed: 0 }] })), /daily/);
});
test('decoder rejects malformed nested sections and pagination', () => {
	assert.throws(() => decodeScheduledGalleryReport(payload({ sources: { arrivals: [{ source: 'x', count: -1 }], openLocations: [], unknown: 0 } })), /sources/);
	assert.throws(() => decodeScheduledGalleryReport(payload({ photoPagination: { page: 2, pageSize: 24, total: 1, pageCount: 1, rank: 'popular' } })), /pagination/);
	assert.throws(() => decodeScheduledGalleryReport(payload({ trafficImpact: [{ albumKey: 'a', inclusive: 1, conservative: 2, excluded: 0, inclusiveRank: 1, conservativeRank: 1 }] })), /traffic impact/);
});
test('partial coverage keeps observed counts but suppresses claimed totals', async () => {
	const f = fixture({ data: payload({ coverage: 'partial', total: null, photos: [{ ...payload().photos[0], count: null, measures: { photo_opens: null, album_opens: null, downloads: null, favorites: null, shares: null } }] }) });
	const report = await buildOperatorReport(f.client, query, { includeDiagnostics: false, includeVisitorEstimate: false }); assert.equal(report.observedTotal, 2); assert.equal(report.total, null); assert.equal(report.photos[0].measures.photo_opens, null);
});
test('CSV neutralizes formulas and contains no browser identifiers', () => {
	const report = { available: true, query, previous: { start: '2026-08-02', end: '2026-08-31' }, comparison: null, coverage: 'complete', previousCoverage: 'unavailable', total: 2, previousTotal: null, observedTotal: 2, today: { date: '2026-09-29', count: null, asOf: null }, dataAsOf: null, preservedSince: null, catalogueBasis: 'event_snapshot', change: null, daily: [], rising: { available: false, basis: 'unavailable', currentDays: 30, previousDays: 0, label: 'None' }, albums: [], photos: [{ photoId: '=unsafe', albumKey: 'visible', count: 2, previousCount: null, difference: null, risingValue: null, measures: totals, lastActivity: null, imageUrl: null }], albumOnlyActions: [], sources: { arrivals: [], openLocations: [], unknown: 0 }, traffic: [], trafficImpact: [], diagnostics: [], diagnosticsCoverage: { availableFrom: null, label: '', error: null }, visitorEstimate: { value: null, limit: '' }, publicationAge: { available: false, label: '', days: 0, albums: [], missingAlbumKeys: [] }, generatedAt: '2026-09-29T00:00:00Z' } satisfies OperatorReport;
	const csv = reportCsv(report); assert.match(csv, /'=unsafe/); assert.doesNotMatch(csv, /anonymous_browser_id|visit_id|session_hash/);
});

test('public browser estimates use the protected SQL visibility boundary', async()=>{
 const calls:Array<{name:string;args:any}>=[];
 const client={rpc:async(name:string,args:any)=>{calls.push({name,args});return {data:name==='analytics_count_scheduled_gallery_browsers'?7:payload(),error:null};}} as unknown as SupabaseClient;
 const report=await buildOperatorReport(client,query,{publicOnly:true,includeDiagnostics:false});
 assert.equal(report.available,true);assert.equal(report.visitorEstimate.value,7);
 assert.deepEqual(calls.map(c=>c.name),['analytics_read_scheduled_gallery_report','analytics_count_scheduled_gallery_browsers']);
 assert.equal(calls[1].args.p_public_only,true);
});
test('CSV marks rows from an album published after the comparison window', () => {
	const fresh={albumKey:'fresh',count:12,previousCount:0,difference:12,risingValue:12,measures:{...totals,album_opens:12},lastActivity:null,publicationAt:'2026-09-20T15:00:00Z'};
	const older={...fresh,albumKey:'older',publicationAt:'2026-07-01T15:00:00Z'};
	const photo={photoId:'p1',albumKey:'fresh',count:3,previousCount:0,difference:3,risingValue:3,measures:totals,lastActivity:null,imageUrl:null};
	const lines=reportCsv(completeReport({query:{...query,measure:'album_opens'},albums:[fresh,older],photos:[photo]})).split('\n');
	assert.match(lines[0],/"comparison_note"$/);
	assert.match(lines.find((line)=>line.startsWith('"photo","p1"'))!,/"published_after_comparison_window"$/);
	assert.match(lines.find((line)=>line.includes('"fresh"')&&line.startsWith('"album"'))!,/"published_after_comparison_window"$/);
	assert.match(lines.find((line)=>line.includes('"older"'))!,/""$/);
	const width=(line:string)=>line.match(/"(?:[^"]|"")*"/g)!.length;
	assert.ok(lines.every((line)=>width(line)===width(lines[0])),'every row keeps the header width');
});
