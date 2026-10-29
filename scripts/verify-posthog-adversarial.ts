/** Dedicated test project only: negative attribution and out-of-order correction evidence. */
import { PostHog } from 'posthog-node';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { buildPostHogJourneyQuery, createPostHogQueryTransport } from '../src/lib/analytics/posthog-queries.server';
if(process.env.POSTHOG_PROJECT_ID!=='635867')throw Error('Dedicated photography test project required');
const provider=new PostHog(process.env.POSTHOG_PROJECT_API_KEY!,{host:'https://us.i.posthog.com',flushAt:1,flushInterval:0,disableGeoip:true,fetchRetryCount:0,requestTimeout:10000});
const transport=createPostHogQueryTransport({...process.env,POSTHOG_ENABLED:'true',POSTHOG_TARGET_ENVIRONMENT:'production',POSTHOG_HOST:'https://us.i.posthog.com'})!;
const run=randomUUID(),album='adversarial-'+run,hidden='hidden-'+run;
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago'}).format(new Date());
let sequence=0;const epoch=Date.now()-120000;
async function capture(event:string,visit:string,properties:Record<string,unknown>){
 const uuid=randomUUID();await provider.captureImmediate({event,uuid,distinctId:'synthetic-'+visit,timestamp:new Date(epoch+(sequence++)*1000),properties:{$process_person_profile:false,event_id:uuid,schema_version:2,traffic_context:'audience',visit_id:visit,release:run,...properties}});return uuid;
}
const v1=randomUUID(),v2=randomUUID(),v3=randomUUID();
for(const visit of [v1,v2])await capture('gallery_page_viewed',visit,{tagged_source:'instagram'});
await capture('photo_exposed',v1,{album_key:album,photo_id:'one',photo_category:'action'});
await capture('favorite_added',v1,{album_key:album,photo_id:'different',photo_category:'portrait'});
await capture('photo_exposed',v2,{album_key:album,photo_id:'two',photo_category:'action'});
const target=await capture('favorite_added',v2,{album_key:album,photo_id:'two',photo_category:'action'});
await capture('photo_exposed',v3,{album_key:album,photo_id:'three',photo_category:'action'});
await capture('favorite_added',v3,{album_key:hidden,photo_id:'three',photo_category:'action',tagged_source:'instagram'});
const checks:Record<string,unknown>={};
async function expectReport(name:string,expected:number[],source?:string){
 const query=buildPostHogJourneyQuery({report:'photo_response',start:day,end:day,albumKeys:[album],category:'action',...(source?{source}:{})},[album])!;
 query.query=query.query.replace('FROM events WHERE ',`FROM events WHERE properties.release = '${run}' AND `);
 let last:unknown;
 for(let attempt=0;attempt<18;attempt++){
  try {const result=await transport.query({refresh:'force_async',query}) as {results?:unknown[][]};last=result.results?.[0];if(Array.isArray(last)&&expected.every((n,i)=>last![i]===n)){checks[name]={passed:true,expected,observed:last};return;}}catch{last='query unavailable';}
  await new Promise(resolve=>setTimeout(resolve,3000));
 }
 checks[name]={passed:false,expected,observed:last};throw Error(name+' failed');
}
async function correction(version:number,classification:string){await provider.captureImmediate({event:'analytics_classification_changed',uuid:randomUUID(),distinctId:'analytics-system-classification-v2',properties:{$process_person_profile:false,schema_version:2,target_event_id:target,classification_version:version,classification}});}
let passed=false;
try{
 await expectReport('wrong photo, wrong category, hidden album do not convert',[3,1]);
 await expectReport('tag on action is not a tagged arrival',[2,1],'instagram');
 await correction(2,'suspected_automation');await correction(1,'audience');
 await expectReport('highest version beats later delivery',[3,0]);
 await correction(3,'audience');
 await expectReport('reversal restores the retained eligible action',[3,1]);
 passed=true;
}finally{
 await provider.shutdown();
 const receipt={project:635867,run,observedAt:new Date().toISOString(),passed,checks,limits:'Synthetic provider observations. Does not prove hosted collection, every report, or causal photography advice.'};
 writeFileSync('docs/implementation/analytics-20260929/evidence/posthog-adversarial.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}
if(!passed)process.exitCode=1;
