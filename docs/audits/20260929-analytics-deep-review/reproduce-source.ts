import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { buildOperatorReport } from '../../../src/lib/analytics/operator-report.server';
import { buildV2ReportProjection } from '../../../src/lib/analytics/v2-report-projection.server';
import { parseReportQuery, datesInclusive, type ReportQuery } from '../../../src/lib/analytics/report-contract';

const query: ReportQuery = {start:'2026-09-20',end:'2026-09-20',scope:'all',albumKeys:[],measure:'photo_opens',traffic:'conservative',compare:'previous'};
async function movedPhoto(currentAlbum: string) {
 const tables: Record<string, any[]> = {
  albums:['public','hidden'].map(album_key=>({album_key,sport:'volleyball',event_date:query.start})),
  album_settings:['public','hidden'].map(album_key=>({album_key,visibility:album_key==='hidden'?'unlisted':'public',published_at:query.start+'T12:00:00Z'})),
  photo_metadata:[{photo_id:'moved-photo',album_key:currentAlbum,cf_image_id:'moved-image',photo_category:'action'}],
  analytics_collection_diagnostics:[],analytics_diagnostic_coverage:[],analytics_daily_coverage:[{bucket_date:query.start}]
 };
 const client:any={from(table:string){let data=[...(tables[table]??[])];const q:any={select(){return q},order(){return q},gte(){return q},lte(){return q},gt(){return q},lt(){return q},in(k:string,v:any[]){data=data.filter(r=>v.includes(r[k]));return q},limit(n:number){data=data.slice(0,n);return q},range(a:number,b:number){data=data.slice(a,b+1);return q},then(resolve:any){return Promise.resolve({data,error:null}).then(resolve)}};return q},async rpc(name:string){return name==='analytics_count_distinct_visitors'?{data:1,error:null}:{data:{rows:[{bucket_date:query.start,album_key:'public',photo_id:'moved-photo',event_type:'view',source:'gallery',source_kind:'internal_open_location',sport:'volleyball',photo_category:'action',traffic_classification:'audience',action_count:1,coverage_state:'complete',latest_event_at:query.start+'T12:00:00Z'}],coverage:[{bucket_date:query.start,coverage_state:'complete',cutoff_at:query.start+'T23:59:59Z'}]},error:null}}};
 return buildOperatorReport(client,query,{publicOnly:true});
}
const visible=await movedPhoto('public'), hidden=await movedPhoto('hidden');
assert.equal(visible.available,true);assert.equal(visible.photos.length,1);
assert.equal(hidden.available,true);assert.equal(hidden.photos.length,1);assert.ok(hidden.photos[0].imageUrl);
const projection=buildV2ReportProjection([{event_name:'photo_opened',occurred_at:'2026-09-20T12:00:00Z',album_key:'public',photo_id:'moved-photo',traffic_context:'operator',classification:'audience',properties:{}}],[],query,{publicAlbumKeys:['public']});
assert.equal(projection.counts.find(x=>x.event==='photo_opened')?.count,1);

async function collector(readyBeforePreferences:boolean){
 const handlers=new Map<string,Function>();const posts:any[]=[];let resolvePreferences:any;
 const preferencePromise=new Promise(resolve=>resolvePreferences=resolve);
 const doc:any={currentScript:{dataset:{siteNavigation:'react'}},documentElement:{dataset:{analyticsPath:'/work/example'}},visibilityState:'visible',readyState:'complete',querySelector(){return null},querySelectorAll(){return []},addEventListener(name:string,f:Function){handlers.set(name,f)},hasFocus(){return true}};
 const context:any={window:{},location:{origin:'https://ninochavez.co',pathname:'/work/example'},navigator:{webdriver:false},document:doc,localStorage:{getItem(){return null},setItem(){},removeItem(){}},crypto:{randomUUID},performance:{now:()=>1},innerWidth:1440,innerHeight:900,setInterval(){return 1},clearInterval(){},setTimeout(){return 1},clearTimeout(){},addEventListener(name:string,f:Function){handlers.set(name,f)},fetch(url:string,options:any){if(url.endsWith('/preferences'))return preferencePromise;posts.push(JSON.parse(options.body));return Promise.resolve({status:200,ok:true})}};
 vm.runInNewContext(readFileSync('static/site-activity.js','utf8'),context);
 if(readyBeforePreferences)handlers.get('nino:page-ready')?.();
 resolvePreferences({ok:true,json:async()=>({linkedAnalytics:false,excludeThisBrowser:false})});
 await new Promise(r=>setImmediate(r));
 if(!readyBeforePreferences)handlers.get('nino:page-ready')?.();
 return posts.filter(x=>x.event_name==='site_page_viewed').length;
}
const normal=await collector(false), race=await collector(true);assert.equal(normal,1);assert.equal(race,0);
const parsed=parseReportQuery(new URLSearchParams('period=custom&start=2020-01-01&end=2026-09-28'));
const days=datesInclusive(parsed.start,parsed.end).length;assert.equal(days,2463);
const result={synthetic:true, movedUnlistedPhoto:{negativeControlVisible:visible.photos.length, hiddenCurrentAlbumStillExposed:hidden.photos.length, previewStillExposed:true},immutableContext:{operatorCorrectedToAudienceCount:1}, collector:{preferencesBeforeReadyPageViews:normal,readyBeforePreferencesPageViews:race},unboundedCustomRangeDays:days};
writeFileSync('docs/audits/20260929-analytics-deep-review/source-repros.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
