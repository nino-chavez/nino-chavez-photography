/** Test-project-only provider acceptance. Synthetic IDs, never gallery visitor data. */
import { PostHog } from 'posthog-node';
import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createPostHogQueryTransport, buildPostHogJourneyQuery, reconcilePostHogEventIds } from '../src/lib/analytics/posthog-queries.server';
import { POSTHOG_JOURNEY_REPORTS } from '../src/lib/analytics/posthog.types';
const project=process.env.POSTHOG_PROJECT_ID;
if(project!=='635867')throw Error('This rehearsal can only use the dedicated photography test project 635867');
const query={async query(body:unknown):Promise<any> {
 const headers={authorization:'Bearer '+process.env.POSTHOG_QUERY_API_KEY,'content-type':'application/json'};
 const response=await fetch('https://us.posthog.com/api/projects/'+project+'/query/',{method:'POST',headers,body:JSON.stringify({...body as object,refresh:'force_async',async:true}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('query start '+response.status);
 let result:any=await response.json();
 if(result.results)return result;
 const id=result.query_status?.id;
 if(!id)throw Error('query status absent');
 for(let attempt=0;attempt<60;attempt++){
  await new Promise(resolve=>setTimeout(resolve,700));
  const poll=await fetch('https://us.posthog.com/api/projects/'+project+'/query/'+id+'/',{headers,signal:AbortSignal.timeout(15000)});
  if(!poll.ok)throw Error('query status '+poll.status+' '+(await poll.text()).slice(0,2200));
  result=await poll.json();
  if(result.query_status?.error)throw Error('provider query rejected: '+String(result.query_status.error_message).slice(0,300));
  if(result.query_status?.complete)return result.query_status.results;
 }
 throw Error('provider query pending');
}};
if(!query || !process.env.POSTHOG_PROJECT_API_KEY)throw Error('Test capture and query credentials required');
const capture=new PostHog(process.env.POSTHOG_PROJECT_API_KEY,{host:'https://us.i.posthog.com',flushAt:1,flushInterval:0,disableGeoip:true,fetchRetryCount:0,requestTimeout:10000});
const existing=process.env.POSTHOG_VERIFY_EXISTING==='true' ? JSON.parse(readFileSync('docs/implementation/analytics-20260929/evidence/posthog-test.json','utf8')) : null;
const browser=randomUUID(),visit=randomUUID(),run=existing?.run ?? randomUUID(),request=randomUUID(),search=randomUUID();
const album='rehearsal-'+run,photo='rehearsal-photo-'+run;
const end=new Date();const start=new Date(end.getTime()-60000);
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago'}).format(end);
const names=['gallery_page_viewed','album_exposed','album_opened','photo_exposed','photo_opened','photo_rendered','favorite_added','download_requested','download_item_requested','download_item_prepared','download_prepared','download_handed_off','search_results_shown','search_result_selected'];
const ids=names.map(()=>randomUUID());
for(let i=0;!existing && i<names.length;i++){
 const event={distinctId:browser,event:names[i],uuid:ids[i],timestamp:new Date(start.getTime()+i*1000),properties:{$process_person_profile:false,$session_id:visit,visit_id:visit,event_id:ids[i],schema_version:2,traffic_context:'audience',album_key:album,photo_id:photo,tagged_source:'rehearsal',album_sport:'volleyball',photo_category:'action',download_request_id:request,download_mode:'single_photo',mode:'single_photo',search_id:search,release:run,result_set_id:search,result_count:1,duration_ms:1000,requested_item_count:1,prepared_item_count:1}};
 await capture.captureImmediate(event);
 if(i===0)await capture.captureImmediate(event); // same UUID, deliberately duplicated.
}
await capture.shutdown();
const receipt:any={project,run,album,day,expectedEvents:names.length,duplicateDelivery:1,queried:false,queries:{},observedAt:new Date().toISOString()};
for(let attempt=0;attempt<(existing?1:6);attempt++){
 const r:any=await query.query({query:{kind:'HogQLQuery',query:`SELECT count(), uniqExact(uuid) FROM events WHERE toString(properties.release) = '${run}' AND toDate(toTimeZone(timestamp, 'America/Chicago')) = toDate('${day}')`}});
 receipt.providerCounts=r.results;
 if(Number(r.results?.[0]?.[1])===names.length){receipt.queried=true;break;}
 await new Promise(resolve=>setTimeout(resolve,5000));
}
for(const report of POSTHOG_JOURNEY_REPORTS.filter(r=> !process.env.POSTHOG_VERIFY_REPORT || r===process.env.POSTHOG_VERIFY_REPORT)){
 const q=buildPostHogJourneyQuery({report,start:day,end:day,...(process.env.POSTHOG_VERIFY_FILTERS==='true'?{source:'rehearsal',sport:'volleyball',category:'action'}:{}),...(['search_usefulness','sources_return','experiments'].includes(report)?{}:{albumKeys:[album]})},[album]);
 if (!q) throw Error('Invalid test report '+report);
 q.query=q.query.replace('FROM events WHERE ', `FROM events WHERE properties.release = '${run}' AND `);
 try{const r:any=await query.query({query:q!});receipt.queries[report]={columns:r.columns,results:r.results};}
 catch(e){receipt.queries[report]={error:e instanceof Error?e.message:'query failed'};}
 console.log(report,JSON.stringify(receipt.queries[report]));
}
mkdirSync('docs/implementation/analytics-20260929/evidence',{recursive:true});
writeFileSync('docs/implementation/analytics-20260929/evidence/posthog-test.json',JSON.stringify(receipt,null,2)+'\n');
const providerIds:any=await query.query({query:{kind:'HogQLQuery',query:`SELECT uuid FROM events WHERE toString(properties.release) = '${run}' AND toDate(toTimeZone(timestamp, 'America/Chicago')) = toDate('${day}') LIMIT 100`}});
const runtimeTransport=createPostHogQueryTransport({...process.env,POSTHOG_ENABLED:'true',POSTHOG_TARGET_ENVIRONMENT:'production',POSTHOG_HOST:'https://us.i.posthog.com'});
receipt.reconciliation=await reconcilePostHogEventIds(runtimeTransport,providerIds.results.map((row:any[])=>row[0]),async()=>{});
const expected:Record<string,number[]>={discovery:[1,1,1,0],album_use:[1,1,1],search_usefulness:[1,0,1],download_reliability:[1,1,1,0,0,0,1,0,0,1,1,1,1,0,0,0,0],photo_response:[1,1],sources_return:[1,0,0],experiments:[0,0,0]};
receipt.passed=receipt.queried && receipt.reconciliation.confirmed===names.length && Number(receipt.providerCounts?.[0]?.[0])===names.length && Object.entries(receipt.queries).every(([name,value]:[string,any])=>!value.error && expected[name].every((n,i)=>value.results?.find((row:any[])=>name!=='sources_return'||row[0]==='overall')?.[i+(name==='sources_return'?2:0)]===n));
receipt.filtered=process.env.POSTHOG_VERIFY_FILTERS==='true';
writeFileSync('docs/implementation/analytics-20260929/evidence/posthog-test.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
if(!receipt.passed)process.exitCode=1;
