/** Synthetic loopback HTTP acceptance. Run after analytics:rehearse with analytics:dev:local running. */
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {unflatten} from 'devalue';
import {createServerClient} from '@supabase/ssr';
import {createAnalyticsTestMarker} from '../src/lib/analytics/collection-contract.ts';
{
const r=JSON.parse(readFileSync('.temp/analytics-local-rehearsal/runtime.json','utf8'));
if(new URL(r.API_URL).hostname!=='127.0.0.1') throw Error('Local API required');
for(const role of ['anonymous','user','operator']) {
 let jar=[];
 if(role!=='anonymous') {
  const c=createServerClient(r.API_URL,r.ANON_KEY,{cookies:{getAll:()=>jar,setAll:xs=>{jar=xs;}}});
  const {error}=await c.auth.signInWithPassword({email:`analytics-${role}@example.test`,password:'synthetic-only-password'});
  if(error) throw error;
 }
 const cookie=jar.map(x=>`${x.name}=${x.value}`).join('; ');
 if(role==='operator') writeFileSync('.temp/analytics-parent-local-cookies.json',JSON.stringify(jar),{mode:0o600});
 for(const path of ['/analytics/operator','/analytics/operator/export.csv']) {
  const res=await fetch('http://127.0.0.1:5187/photography'+path,{headers:{cookie},redirect:'manual',signal:AbortSignal.timeout(20000)});
  assert.equal(res.status,role==='anonymous'?302:role==='user'?403:200);
  assert.equal(res.headers.get('cache-control'),'private, no-store, max-age=0');
  const body=await res.text();assert.equal(body.includes('session_hash'),false);
  console.log(role,path,res.status,res.headers.get('cache-control'),body.includes('session_hash')?'HASH FIELD PRESENT':'no hash field');
 }
}
}
{
const jar=JSON.parse(readFileSync('.temp/analytics-parent-local-cookies.json','utf8'));
const headers={cookie:jar.map(x=>`${x.name}=${x.value}`).join('; ')};
const base='http://127.0.0.1:5187/photography/analytics/operator';
const checks=[];
for(const [name,extra,total,visitors] of [
 ['audience photo opens','',4,7],
 ['inclusive photo opens','&traffic=inclusive',6,9],
 ['photo category removes album-only arrival','&category=action',3,4],
 ['tagged arrival is not a photo open','&source=instagram',0,1],
 ['historical album event date','&event_date=2026-09-20',3,5],
 ['unknown season uses historical nulls','&season=unknown',1,2],
 ['zero under a supported content filter','&sport=basketball',0,0]
]) {
 try {
  const response=await fetch(base+'/__data.json?period=custom&start=2026-09-27&end=2026-09-27&compare=none'+extra,{headers,signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200);
  const data=await response.json();const node=data.nodes.find(n=>n?.data&&unflatten(n.data).report);
  const report=unflatten(node.data).report;
  assert.equal(report.available,true);assert.equal(report.total,total);assert.equal(report.visitorEstimate.value,visitors);
  checks.push({name,pass:true,total,visitors});
 }catch(error){checks.push({name,pass:false,error:error.message});}
}
for(const [name,query,expectedRows] of [
 ['full photo export','period=custom&start=2026-09-28&end=2026-09-28&scope=album&albums=alpha&measure=photo_opens&compare=none&source=gallery-grid',1105],
 ['album-only export','period=custom&start=2026-11-01&end=2026-11-01&scope=album&albums=beta&measure=album_opens',1]
]){
 try{const response=await fetch(base+'/export.csv?'+query,{headers,signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);const csv=await response.text();assert.equal(csv.trim().split('\n').length-1,expectedRows);assert.equal(csv.includes('session_hash'),false);checks.push({name,pass:true,expectedRows});}
 catch(error){checks.push({name,pass:false,error:error.message});}
}
const receipt={checkedAt:new Date().toISOString(),synthetic:true,checks};
writeFileSync('.temp/analytics-parent-api-results.json',JSON.stringify(receipt,null,2));
console.log(JSON.stringify(receipt,null,2));
if(checks.some(c=>!c.pass))process.exitCode=1;
}
{
const runtime=JSON.parse(readFileSync('.temp/analytics-local-rehearsal/runtime.json','utf8'));
assert.equal(runtime.API_URL,'http://127.0.0.1:55491');
const origin='http://127.0.0.1:5187',route=origin+'/photography/api/engagement';
const jar=JSON.parse(readFileSync('.temp/analytics-parent-local-cookies.json','utf8'));
const marker=createAnalyticsTestMarker({origin,pathPrefix:'/photography',exp:Math.floor(Date.now()/1000)+600},'local-analytics-test-token');
const stamp='load-'+Date.now(),baseHeaders={'content-type':'application/json',origin,'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 '+stamp};
async function post(body,extra={}){const start=performance.now();const response=await fetch(route,{method:'POST',headers:{...baseHeaders,...extra},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});return {status:response.status,body:await response.json(),ms:performance.now()-start};}
const results=[];
for(let batch=0;batch<5;batch++)results.push(...await Promise.all(Array.from({length:20},(_,i)=>post({event_type:'view',photo_id:'alpha-bulk-'+(i+1),source:stamp},{'x-analytics-test-marker':marker}))));
if(results.some(r=>r.status!==200))console.log('Failed sample',results.find(r=>r.status!==200));assert(results.every(r=>r.status===200));assert.equal(results.filter(r=>r.body.accepted).length,20);assert.equal(results.filter(r=>r.body.duplicate).length,80);
for(const event_type of ['view','favorite','download','share','album_open']){const r=await post({event_type,album_key:'alpha',...(event_type==='album_open'?{}:{photo_id:'alpha-1'}),source:stamp},{cookie:jar.map(x=>`${x.name}=${x.value}`).join('; ')});assert.equal(r.status,200);}
const invalid=createAnalyticsTestMarker({origin,pathPrefix:'/photography',exp:Math.floor(Date.now()/1000)-5},'local-analytics-test-token');assert.equal((await post({event_type:'favorite',photo_id:'alpha-2',source:stamp},{'x-analytics-test-marker':invalid})).status,400);
assert.equal((await post({event_type:'view',photo_id:'alpha-1',album_key:'beta'})).status,400);
assert.equal((await post({event_type:'view',photo_id:'missing'})).status,400);
assert.equal((await post({event_type:'view',album_key:'alpha',source_kind:'tagged_arrival'})).status,400);
const normal=await post({event_type:'view',photo_id:'alpha-1',source:stamp,traffic_context:'test'});assert.equal(normal.status,200);assert.equal(normal.body.accepted,true);
const stored=await(await fetch(runtime.API_URL+'/rest/v1/engagement_events?select=traffic_context,event_type&source=eq.'+stamp,{headers:{apikey:runtime.SERVICE_ROLE_KEY,authorization:'Bearer '+runtime.SERVICE_ROLE_KEY}})).json();
assert.equal(stored.filter(r=>r.traffic_context==='test').length,20);assert.equal(stored.filter(r=>r.traffic_context==='operator').length,5);assert.equal(stored.filter(r=>r.traffic_context==='audience').length,1);
const latencies=results.map(r=>r.ms).sort((a,b)=>a-b);
const receipt={checkedAt:new Date().toISOString(),synthetic:true,requests:100,concurrency:20,accepted:20,duplicates:80,errors:0,p50Ms:Math.round(latencies[49]),p95Ms:Math.round(latencies[94]),operatorActionsExcluded:5,ordinaryAudienceControl:1,invalidMarkersRejected:true,invalidTargetsRejected:true,limit:'Loopback rehearsal only; this does not establish production capacity.'};
writeFileSync('.temp/analytics-parent-load-result.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
}
{
// Exercise actual database denial, then restore the two dedicated local grants.
const {spawnSync}=await import('node:child_process');
const runtime=JSON.parse(readFileSync('.temp/analytics-local-rehearsal/runtime.json','utf8'));
const db=new URL(runtime.DB_URL),api=new URL(runtime.API_URL);
assert.equal(db.hostname,'127.0.0.1');assert.equal(db.port,'55492');assert.equal(db.pathname,'/postgres');
assert.equal(api.origin,'http://127.0.0.1:55491');
function sql(command){const r=spawnSync('/opt/homebrew/opt/postgresql@17/bin/psql',['-X','--no-psqlrc','-v','ON_ERROR_STOP=1',runtime.DB_URL,'-Atq'],{input:command,encoding:'utf8',timeout:15000});if(r.status!==0)throw Error('Local failure rehearsal SQL failed');return r.stdout.trim();}
assert.equal(sql("SELECT identity FROM public.analytics_rehearsal_identity;"),'photography-analytics-synthetic-v1');
const jar=JSON.parse(readFileSync('.temp/analytics-parent-local-cookies.json','utf8'));
const headers={cookie:jar.map(x=>`${x.name}=${x.value}`).join('; ')};
const base='http://127.0.0.1:5187/photography';
try {
 sql('REVOKE EXECUTE ON FUNCTION public.analytics_read_report_evidence(date,date) FROM service_role; REVOKE INSERT ON public.engagement_events FROM service_role;');
 const response=await fetch(base+'/analytics/operator/__data.json?period=custom&start=2026-09-27&end=2026-09-27',{headers,signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,200);const body=await response.json();const report=unflatten(body.nodes.find(n=>n?.data&&unflatten(n.data).report).data).report;
 assert.equal(report.available,false);assert.equal(report.total,null);assert.equal(report.photos.length,0);
 const csv=await fetch(base+'/analytics/operator/export.csv?period=custom&start=2026-09-27&end=2026-09-27',{headers,signal:AbortSignal.timeout(20000)});assert.equal(csv.status,503);
 const html=await(await fetch(base+'/analytics/operator?period=custom&start=2026-09-27&end=2026-09-27',{headers,signal:AbortSignal.timeout(20000)})).text();assert(html.includes('Report unavailable'));
 const write=await fetch(base+'/api/engagement',{method:'POST',headers:{'content-type':'application/json',origin:'http://127.0.0.1:5187','user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 failure-rehearsal'},body:JSON.stringify({event_type:'view',photo_id:'alpha-2'}),signal:AbortSignal.timeout(20000)});
 assert.equal(write.status,503);assert.equal((await write.json()).accepted,false);
} finally {sql('GRANT EXECUTE ON FUNCTION public.analytics_read_report_evidence(date,date) TO service_role; GRANT INSERT ON public.engagement_events TO service_role;');}
const receipt={checkedAt:new Date().toISOString(),synthetic:true,reportFailureIsUnavailable:true,failedExportStatus:503,failedCollectionStatus:503,grantsRestored:true};
writeFileSync('.temp/analytics-parent-failure-result.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
}
