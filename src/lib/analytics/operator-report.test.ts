import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregateDiagnostics, reportCsv, type OperatorReport } from './operator-report.server';
import type { ReportQuery } from './report-contract';

const query: ReportQuery = {
	start: '2026-09-01',
	end: '2026-09-30',
	measure: 'photo_opens',
	scope: 'all',
	albumKeys: [],
	traffic: 'conservative',
	compare: 'previous'
};

function report(overrides: Partial<OperatorReport> = {}): OperatorReport {
	return {
		available: true,
		query,
		previous: { start: '2026-08-02', end: '2026-08-31' },
		comparison: { start: '2026-08-02', end: '2026-08-31', total: 0, coverage: 'complete', label: 'Previous equal period' },
		coverage: 'complete', previousCoverage: 'complete', total: 0, previousTotal: 0, change: null,
		rising: { available: true, basis: 'absolute', currentDays: 30, previousDays: 30, label: 'Equal windows.' },
		observedTotal:0, catalogueBasis:'event_snapshot', today:{date:'2026-09-28',count:null,asOf:null}, dataAsOf:null, preservedSince:null,
		daily: [], albums: [], photos: [], albumOnlyActions:[], sources: { arrivals: [], openLocations: [], unknown: 0 },
		traffic: [], trafficImpact: [], diagnostics: [], diagnosticsCoverage: { availableFrom: null, label: 'No diagnostic coverage.', error:null },
		visitorEstimate: { value: 7, limit: 'Estimated browsers.' },
		publicationAge: { available: false, label: 'Not selected.', days: 30, albums: [], missingAlbumKeys: [] },
		generatedAt: '2026-09-28T12:00:00.000Z',
		...overrides
	};
}

test('full photo export preserves more than the PostgREST default page', () => {
	const photos = Array.from({ length: 1_105 }, (_, index) => ({
		photoId: `photo-${index + 1}`,
		albumKey: 'alpha',
		count: index + 1,
		previousCount: index,
		difference: 1,
		risingValue: 1,
		measures: { photo_opens: index + 1, album_opens: 0, downloads: 0, favorites: 0, shares: 0 },
		lastActivity: '2026-09-28T12:00:00.000Z',
		imageUrl: null
	}));
	const csv = reportCsv(report({ photos }));
	assert.equal(csv.split('\n').length, 1_106);
	assert.match(csv, /"photo-1105"/);
});

test('album-open export emits album grain even when there are no photo rows', () => {
	const csv = reportCsv(report({
		query: { ...query, measure: 'album_opens' },
		albums: [{ albumKey: 'alpha', count: 12, previousCount: 8, difference: 4, risingValue: 4, measures: { photo_opens: 0, album_opens: 12, downloads: 0, favorites: 0, shares: 0 }, lastActivity: '2026-09-28T12:00:00.000Z', publicationAt: null }]
	}));
	assert.equal(csv.split('\n').length, 2);
	assert.match(csv, /^"row_type"/);
	assert.match(csv, /"album","","alpha","12"/);
});

test('spreadsheet formulas are neutralized in every exported string field', () => {
	const csv = reportCsv(report({
		photos: [{ photoId: '=IMPORTXML("https://example.invalid")', albumKey: '+unsafe', count: 1, previousCount: 0, difference: 1, risingValue: 1, measures: { photo_opens: 1, album_opens: 0, downloads: 0, favorites: 0, shares: 0 }, lastActivity: '@NOW()', imageUrl: null }]
	}));
	assert.match(csv, /"'=IMPORTXML/);
	assert.match(csv, /"'\+unsafe"/);
	assert.match(csv, /"'@NOW\(\)"/);
});


test('mixed download export preserves both photo and album-only actions without double counting', () => {
 const value=report({query:{...query,measure:'downloads'},
  photos:[{photoId:'one',albumKey:'alpha',count:2,previousCount:3,difference:-1,risingValue:-1,measures:{photo_opens:0,album_opens:0,downloads:2,favorites:0,shares:0},lastActivity:null,imageUrl:null}],
  albums:[{albumKey:'alpha',count:5,previousCount:3,difference:2,risingValue:2,measures:{photo_opens:0,album_opens:0,downloads:5,favorites:0,shares:0},lastActivity:null,publicationAt:null}],
  albumOnlyActions:[{albumKey:'alpha',count:3,previousCount:0,difference:3,lastActivity:null}]
 });
 const csv=reportCsv(value);
 assert.equal(csv.split('\n').length,3);
 assert.match(csv, /"photo","one","alpha","2","3","-1"/);
 assert.match(csv, /"album_action","","alpha","3"/);
 assert.equal(reportCsv(value,new Set(['missing'])).split('\n').length,1);
});

test('diagnostics retain result aggregates and bounded error categories', () => {
	const diagnostics = aggregateDiagnostics([
		{ id: 1, diagnostic_type: 'search_results', status: 'ok', occurred_at: '2026-09-28T12:00:00Z', traffic_context: 'audience', album_key: null, photo_id: null, source: null, result_count: 0, error_code: null },
		{ id: 2, diagnostic_type: 'search_results', status: 'ok', occurred_at: '2026-09-28T13:00:00Z', traffic_context: 'audience', album_key: null, photo_id: null, source: null, result_count: 3, error_code: null },
		{ id: 3, diagnostic_type: 'download', status: 'failed', occurred_at: '2026-09-28T14:00:00Z', traffic_context: 'audience', album_key: 'alpha', photo_id: null, source: null, result_count: null, error_code: 'upstream_503' },
		{ id: 4, diagnostic_type: 'download', status: 'failed', occurred_at: '2026-09-28T15:00:00Z', traffic_context: 'audience', album_key: 'alpha', photo_id: null, source: null, result_count: null, error_code: 'upstream_503' }
	]);
	assert.deepEqual(diagnostics.find((row) => row.type === 'search_results'), { type: 'search_results', status: 'ok', count: 2, resultCount: 3, errorCodes: [], latestAt: '2026-09-28T13:00:00Z' });
	assert.deepEqual(diagnostics.find((row) => row.type === 'download')?.errorCodes, ['upstream_503']);
});

// Exercise the full aggregation path: hidden albums must not affect public numbers,
// comparisons, CSVs, publication-age reports, or the distinct-browser query.
import { buildOperatorReport } from './operator-report.server';
import type { SupabaseClient } from '@supabase/supabase-js';

function privacyFixture(visibilityError = false) {
 const day = '2026-09-20';
 const visitorCalls: string[][] = [];
 const tables: Record<string, Record<string, unknown>[]> = {
  albums: ['visible', 'hidden'].map(album_key => ({album_key, sport:'volleyball', event_date:day})),
  album_settings: ['visible', 'hidden'].map(album_key => ({album_key, visibility:album_key === 'hidden' ? 'unlisted' : 'public', published_at:day+'T12:00:00Z'})),
  photo_metadata: ['visible', 'hidden'].map(album_key => ({album_key, photo_id:album_key+'-photo', cf_image_id:album_key+'-image', photo_category:'action'})),
  analytics_collection_diagnostics: [],
  analytics_diagnostic_coverage: [],
  analytics_daily_coverage: [{bucket_date:day}]
 };
 const client = {
  from(table:string) {
   let data = [...(tables[table] ?? [])];
   const q = {
    select(){return q;},order(){return q;},gte(){return q;},lt(){return q;},gt(){return q;},lte(){return q;},
    in(key:string, values:unknown[]){data=data.filter(row=>values.includes(row[key]));return q;},
    limit(n:number){data=data.slice(0,n);return q;},
    range(start:number,end:number){data=data.slice(start,end+1);return q;},
    then(resolve:(value:unknown)=>unknown){return Promise.resolve({data,error:visibilityError&&table==='album_settings'?{message:'visibility unavailable'}:null}).then(resolve);}
   };return q;
  },
  async rpc(name:string, args:Record<string,unknown>) {
   if(name==='analytics_count_distinct_visitors') {
    const keys=args.p_album_keys as string[];visitorCalls.push(keys);
    return {data:keys.length===0 ? 12 : keys.includes('visible') ? 2 : 0,error:null};
   }
   return {data:{
    rows:['visible','hidden'].map(album_key=>({bucket_date:day,album_key,photo_id:album_key+'-photo',event_type:'view',source:album_key+'-source',source_kind:'internal_open_location',sport:'volleyball',photo_category:'action',traffic_classification:'audience',action_count:album_key==='hidden'?10:2,coverage_state:'complete',latest_event_at:day+'T12:00:00Z'})),
    coverage:[{bucket_date:day,coverage_state:'complete',cutoff_at:day+'T23:59:59Z'}]
   },error:null};
  }
 } as unknown as SupabaseClient;
 return {client,visitorCalls,query:{...query,start:day,end:day,compare:'publication_age' as const}};
}

test('public reports exclude unlisted albums from every aggregate and export',async()=>{
 const f=privacyFixture();
 const privateReport=await buildOperatorReport(f.client,f.query);
 assert.equal(privateReport.observedTotal,12); // Negative control: fixture really contains hidden traffic.
 const publicReport=await buildOperatorReport(f.client,f.query,{publicOnly:true});
 assert.equal(publicReport.available,true);
 assert.equal(publicReport.observedTotal,2);
 assert.equal(publicReport.visitorEstimate.value,2);
 assert.deepEqual(f.visitorCalls.at(-1),['visible']);
 assert.doesNotMatch(JSON.stringify(publicReport),/hidden/);
 assert.doesNotMatch(reportCsv(publicReport),/hidden/);
 const hiddenOnly=await buildOperatorReport(f.client,{...f.query,scope:'album',albumKeys:['hidden']},{publicOnly:true});
 assert.equal(hiddenOnly.observedTotal,0);
 assert.equal(hiddenOnly.visitorEstimate.value,0);
 assert.deepEqual(f.visitorCalls.at(-1),['__no_public_albums__']);
 assert.equal(hiddenOnly.photos.length,0);
 assert.equal(hiddenOnly.publicationAge.albums.length,0);
});

test('public reports fail closed when album visibility cannot be read',async()=>{
 const f=privacyFixture(true);
 const report=await buildOperatorReport(f.client,f.query,{publicOnly:true});
 assert.equal(report.available,false);
 assert.equal(report.photos.length,0);
 assert.equal(f.visitorCalls.length,0);
});
