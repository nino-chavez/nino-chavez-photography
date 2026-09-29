/** Explicit local-rehearsal -> dedicated PostHog test project acceptance. Never production. */
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createPostHogCaptureClient } from '../src/lib/analytics/posthog.server';
import { createPostHogOutboxClient } from '../src/lib/analytics/posthog-outbox.server';
import { deliverPostHogBatch } from '../src/lib/analytics/posthog-delivery.server';
import { createPostHogQueryTransport, reconcilePostHogEventIds } from '../src/lib/analytics/posthog-queries.server';

if(process.env.POSTHOG_PROJECT_ID!=='635867')throw Error('Dedicated photography test project 635867 required');
const runtime=JSON.parse(readFileSync('.temp/analytics-local-rehearsal/runtime.json','utf8'));
if(!['127.0.0.1','localhost'].includes(new URL(runtime.API_URL).hostname))throw Error('Loopback database required');
const app=process.env.ANALYTICS_PIPELINE_ORIGIN ?? 'http://analytics-review.localhost:57210';
if(!['localhost','127.0.0.1','analytics-review.localhost'].includes(new URL(app).hostname))throw Error('Loopback gallery required');
const db=createClient(runtime.API_URL,runtime.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const identity=await db.from('analytics_rehearsal_identity').select('identity').single();
if(identity.error || identity.data?.identity!=='photography-analytics-synthetic-v1')throw Error('Synthetic database identity required');
const cookies=new Map<string,string>();
async function post(path:string,body:unknown){
 const response=await fetch(app+'/photography'+path,{method:'POST',headers:{'content-type':'application/json',origin:new URL(app).origin,cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36'},body:JSON.stringify(body)});
 for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],equal=pair.indexOf('=');cookies.set(pair.slice(0,equal),pair.slice(equal+1));}
 if(!response.ok)throw Error('Local gallery rejected '+path+' with '+response.status);
 return response.json();
}
await post('/api/analytics/preferences',{linkedAnalytics:true,excludeThisBrowser:false});
const browser=randomUUID(),visit=randomUUID(),view=randomUUID(),ids:string[]=[];
const definitions=[['photo_opened',{photo_id:'legacy-1',view_id:view,entry_surface:'photo_route'}],['photo_rendered',{photo_id:'legacy-1',view_id:view,load_duration_ms:120}],['favorite_added',{photo_id:'legacy-1',surface:'photo_route'}]] as const;
for(const [name,properties] of definitions){
 const event={schema_version:2,event_id:randomUUID(),event_name:name,occurred_at:new Date().toISOString(),anonymous_browser_id:browser,visit_id:visit,properties};
 const result=await post('/api/analytics/events',event);
 if(!result.accepted || !result.export_eligible)throw Error('Local event not export eligible');
 ids.push(event.event_id);
 if(name==='photo_opened'){
  const duplicate=await post('/api/analytics/events',event);
  if(!duplicate.duplicate || duplicate.accepted)throw Error('Collector duplicate was accepted twice');
 }
}
const capture=createPostHogCaptureClient({projectApiKey:process.env.POSTHOG_PROJECT_API_KEY!,host:'https://us.i.posthog.com'})!;
const outbox=createPostHogOutboxClient(db);
const submitted=new Set<string>();let claimed=0,failed=0,skipped=0;
// The guarded local database contains synthetic rehearsal rows only; other due fixture rows may also be delivered to the isolated test project.
for(let batch=0;batch<4 && !ids.every(id=>submitted.has(id));batch++){
 const result=await deliverPostHogBatch(capture,outbox,{limit:100,leaseSeconds:300});
 claimed+=result.claimed;failed+=result.failed;skipped+=result.skipped;result.submittedEventIds.forEach(id=>submitted.add(id));
 if(result.claimed===0)break;
}
const query=createPostHogQueryTransport({...process.env,POSTHOG_ENABLED:'true',POSTHOG_TARGET_ENVIRONMENT:'production',POSTHOG_HOST:'https://us.i.posthog.com'});
let reconciliation;
for(let attempt=0;attempt<6;attempt++){
 reconciliation=await reconcilePostHogEventIds(query,ids,eventIds=>outbox.confirm(eventIds));
 if(reconciliation.confirmed===ids.length)break;
 await new Promise(resolve=>setTimeout(resolve,5000));
}
const states=await db.from('analytics_posthog_outbox').select('status,last_error_code').in('event_id',ids);
await post('/api/analytics/preferences',{linkedAnalytics:false,excludeThisBrowser:false});
const passed=ids.every(id=>submitted.has(id)) && reconciliation?.confirmed===ids.length && !states.error && states.data?.every(row=>row.status==='confirmed');
const receipt={project:635867,observedAt:new Date().toISOString(),source:'actual local gallery API -> durable outbox -> official SDK -> live provider query -> confirmed database rows',collectorDuplicateRejected:true,journeyEvents:ids.length,fixtureRowsClaimed:claimed,failed,skipped,states:states.data,available:reconciliation?.available,confirmed:reconciliation?.confirmed,passed,limits:'Local server and synthetic database. Does not prove hosted Cloudflare runtime delivery or production visitor accuracy.'};
writeFileSync('docs/implementation/analytics-20260929/evidence/posthog-pipeline.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
if(!passed)process.exitCode=1;
