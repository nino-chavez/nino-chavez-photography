import type { SupabaseClient } from '@supabase/supabase-js';
import { cfImageUrl } from '$lib/utils/cloudflare-images';
import type { OperatorReport } from './operator-report.server';
import type { ReportQuery } from './report-contract';
import type { PhotoWindow } from './gallery-performance.server';

type ScheduledPayload = Pick<OperatorReport,
	'coverage'|'previousCoverage'|'total'|'previousTotal'|'observedTotal'|'today'|'dataAsOf'|
	'preservedSince'|'catalogueBasis'|'daily'|'albums'|'photos'|'photoPagination'|
	'albumOnlyActions'|'sources'|'traffic'|'trafficImpact'|'publicationAge'>;
const coverages = ['complete','partial','unavailable'] as const;
const measures = ['photo_opens','album_opens','downloads','favorites','shares'] as const;
const isObject = (v: unknown): v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v);
const isDate = (v: unknown) => typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
const isInstant = (v: unknown) => v===null || (typeof v==='string' && !Number.isNaN(Date.parse(v)));
const isCount = (v: unknown): v is number => typeof v==='number' && Number.isSafeInteger(v) && v>=0;
const isMaybeCount = (v: unknown) => v===null || isCount(v);
const isMetric = (v: unknown) => v===null || (typeof v==='number' && Number.isFinite(v));
const isString = (v: unknown) => typeof v==='string';
function keys(v:Record<string,unknown>, names:string[]): boolean { return names.every((name)=>name in v); }
function validMeasures(v:unknown):boolean { return isObject(v)&&measures.every((m)=>isMaybeCount(v[m])); }
function validGroup(v:unknown,photo:boolean):boolean {
	if(!isObject(v)||!keys(v,[photo?'photoId':'albumKey','albumKey','count','previousCount','difference','lastActivity']))return false;
	return isString(v.albumKey)&&(!photo||isString(v.photoId))&&isMaybeCount(v.count)&&isMaybeCount(v.previousCount)&&isMetric(v.difference)&&isInstant(v.lastActivity)&&(!('measures'in v)||validMeasures(v.measures))&&(!('risingValue'in v)||isMetric(v.risingValue));
}

export function decodeScheduledGalleryReport(value:unknown):ScheduledPayload {
	if(!isObject(value)||!keys(value,['coverage','previousCoverage','total','previousTotal','observedTotal','today','dataAsOf','preservedSince','catalogueBasis','daily','albums','photos','photoPagination','albumOnlyActions','sources','traffic','trafficImpact','publicationAge']))throw new Error('Invalid scheduled gallery report');
	if(/"(?:anonymous_browser_id|visit_id|session_hash|visitor_fingerprint|search_query)"\s*:/.test(JSON.stringify(value)))throw new Error('Invalid scheduled gallery identifiers');
	const r=value;
	if(!coverages.includes(r.coverage as never)||!coverages.includes(r.previousCoverage as never)||!isMaybeCount(r.total)||!isMaybeCount(r.previousTotal)||!isCount(r.observedTotal)||!isInstant(r.dataAsOf)||!(r.preservedSince===null||isDate(r.preservedSince))||!isString(r.catalogueBasis))throw new Error('Invalid scheduled gallery totals');
	if((r.coverage==='complete')!==(r.total!==null)||(r.previousCoverage==='complete')!==(r.previousTotal!==null))throw new Error('Invalid scheduled gallery coverage semantics');
	if(!isObject(r.today)||!isDate(r.today.date)||!isMaybeCount(r.today.count)||!isInstant(r.today.asOf))throw new Error('Invalid scheduled gallery today');
	if(!Array.isArray(r.daily)||!r.daily.every((v)=>isObject(v)&&isDate(v.date)&&coverages.includes(v.coverage as never)&&isMaybeCount(v.count)&&isMaybeCount(v.observed)&&(v.coverage==='complete'?v.count!==null&&v.observed!==null:v.coverage==='partial'?v.count===null&&v.observed!==null:v.count===null&&v.observed===null)))throw new Error('Invalid scheduled gallery daily');
	if(!Array.isArray(r.albums)||!r.albums.every((v)=>validGroup(v,false)&&isObject(v)&&validMeasures(v.measures)&&isInstant(v.publicationAt)))throw new Error('Invalid scheduled gallery albums');
	if(!Array.isArray(r.photos)||!r.photos.every((v)=>validGroup(v,true)&&isObject(v)&&validMeasures(v.measures)&&(v.imageUrl===null||isString(v.imageUrl))))throw new Error('Invalid scheduled gallery photos');
	if(!Array.isArray(r.albumOnlyActions)||!r.albumOnlyActions.every((v)=>validGroup(v,false)))throw new Error('Invalid scheduled gallery album actions');
	if(!isObject(r.photoPagination)||!isCount(r.photoPagination.page)||!isCount(r.photoPagination.pageSize)||r.photoPagination.pageSize>100||!isCount(r.photoPagination.total)||!isCount(r.photoPagination.pageCount)||!['popular','rising','recent'].includes(String(r.photoPagination.rank))||(r.photoPagination.pageCount===0?r.photoPagination.page!==0:r.photoPagination.page>=r.photoPagination.pageCount))throw new Error('Invalid scheduled gallery pagination');
	if(!isObject(r.sources)||!Array.isArray(r.sources.arrivals)||!Array.isArray(r.sources.openLocations)||!isCount(r.sources.unknown)||![...r.sources.arrivals,...r.sources.openLocations].every((v)=>isObject(v)&&isString(v.source)&&isCount(v.count)))throw new Error('Invalid scheduled gallery sources');
	if(!Array.isArray(r.traffic)||!r.traffic.every((v)=>isObject(v)&&isString(v.classification)&&isCount(v.count)))throw new Error('Invalid scheduled gallery traffic');
	if(!Array.isArray(r.trafficImpact)||!r.trafficImpact.every((v)=>isObject(v)&&isString(v.albumKey)&&isCount(v.inclusive)&&isCount(v.conservative)&&v.conservative<=v.inclusive&&isCount(v.excluded)&&v.excluded===v.inclusive-v.conservative&&isCount(v.inclusiveRank)&&v.inclusiveRank>0&&isCount(v.conservativeRank)&&v.conservativeRank>0))throw new Error('Invalid scheduled gallery traffic impact');
	const publicationAge=r.publicationAge;
	if(!isObject(publicationAge)||typeof publicationAge.available!=='boolean'||!isString(publicationAge.label)||!isCount(publicationAge.days)||!Array.isArray(publicationAge.albums)||!Array.isArray(publicationAge.missingAlbumKeys)||!publicationAge.missingAlbumKeys.every(isString)||!publicationAge.albums.every((v)=>isObject(v)&&isString(v.albumKey)&&isInstant(v.publishedAt)&&isMaybeCount(v.total)&&coverages.includes(v.coverage as never)&&((v.coverage==='complete')===(v.total!==null))&&Array.isArray(v.series)&&v.series.length===publicationAge.days&&v.series.every(isMaybeCount)&&(v.coverage==='complete'?v.series.every(isCount):v.series.some((n)=>n===null))))throw new Error('Invalid scheduled gallery publication age');
	return r as unknown as ScheduledPayload;
}

export async function fetchScheduledGalleryReport(client:SupabaseClient,query:ReportQuery,options:{publicOnly?:boolean;photoWindow?:PhotoWindow;rangeMode?:'interactive'|'export';includeToday?:boolean}={}):Promise<ScheduledPayload>{
	const window=options.photoWindow??{page:0,pageSize:0,rank:'popular' as const};
	const full=options.rangeMode==='export'||!options.photoWindow;
	const {data,error}=await client.rpc('analytics_read_scheduled_gallery_report',{p_start:query.start,p_end:query.end,p_measure:query.measure,p_scope:query.scope,p_album_keys:query.albumKeys,p_sport:query.sport??null,p_category:query.category??null,p_source:query.source??null,p_event_date:query.eventDate??null,p_season:query.season??null,p_album_event_type:query.albumEventType??null,p_compare:query.compare,p_compare_start:query.compareStart??null,p_compare_end:query.compareEnd??null,p_traffic:query.traffic,p_public_only:options.publicOnly??false,p_photo_page:window.page,p_photo_page_size:window.pageSize,p_photo_rank:window.rank,p_export:full,p_include_today:options.includeToday!==false});
	if(error){if(error.code==='PGRST202')throw new Error('Scheduled gallery reporting is not installed. This is not a zero-result report.');throw error;}
	const report=decodeScheduledGalleryReport(data);
	if(options.photoWindow&&options.rangeMode!=='export'&&report.photos.length){
		const ids=report.photos.map((p)=>p.photoId);const {data:rows,error:photoError}=await client.from('photo_metadata').select('photo_id, album_key, cf_image_id').in('photo_id',ids);
		if(photoError)throw photoError;const byKey=new Map((rows??[]).map((row)=>[`${row.photo_id}\0${row.album_key}`,row.cf_image_id]));
		report.photos=report.photos.map((p)=>({...p,imageUrl:byKey.get(`${p.photoId}\0${p.albumKey}`)?cfImageUrl(byKey.get(`${p.photoId}\0${p.albumKey}`) as string,'thumbnail'):null,photoSegment:byKey.get(`${p.photoId}\0${p.albumKey}`)??null}));
	}
	return report;
}
