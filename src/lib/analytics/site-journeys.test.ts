import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSiteJourneyQuery,loadSiteJourneys} from './site-journeys.server';
import {createProviderCache} from './provider-cache.server';
import {createPostHogQueryTransport} from './posthog-queries.server';
test('site journeys validate scope and distinguish unavailable from empty',async()=>{
 assert.throws(()=>buildSiteJourneyQuery("2026-09-01' OR true",'2026-09-28','all'));
 assert.throws(()=>buildSiteJourneyQuery('2026-01-01','2026-09-28','all'));
 const query=buildSiteJourneyQuery('2026-09-01','2026-09-28','writing').query;
 assert.match(query,/classification_version/);assert.match(query,/toTimeZone\(timestamp,'UTC'\)/);assert.match(query,/contact_at>=viewed_at/);assert.match(query,/GROUP BY section,path,visit_id,view_id/);
 assert.equal((await loadSiteJourneys(null,'2026-09-01','2026-09-28','writing')).available,false);
 assert.deepEqual(await loadSiteJourneys({query:async()=>({results:[]})},'2026-09-01','2026-09-28','writing'),{available:true,rows:[]});
 assert.equal((await loadSiteJourneys({query:async()=>({results:[['private',0]]})},'2026-09-01','2026-09-28','writing')).available,false);
});

test('site journey cache deduplicates exact scopes and retries invalid responses',async()=>{
 let now=1_000,calls=0;
 const cache=createProviderCache({ttlMs:100,maxEntries:8,maxInFlight:4,maxBytes:20_000,now:()=>now});
 const valid=[['writing',4,1,2,3,2,1,0,0]];
 const client=(account:string,credential:string,results:unknown=valid)=>({
  providerCache:{origin:'https://us.posthog.com',account,credentialIdentity:Promise.resolve(credential)},
  query:async()=>{calls+=1;await Promise.resolve();return {results};}
 });
 await Promise.all([
  loadSiteJourneys(client('1','credential-a'),'2026-09-01','2026-09-28','writing',{cache}),
  loadSiteJourneys(client('1','credential-a'),'2026-09-01','2026-09-28','writing',{cache})
 ]);
 assert.equal(calls,1);
 await loadSiteJourneys(client('2','credential-a'),'2026-09-01','2026-09-28','writing',{cache});
 await loadSiteJourneys(client('1','credential-b'),'2026-09-01','2026-09-28','writing',{cache});
 await loadSiteJourneys(client('1','credential-a'),'2026-09-01','2026-09-28','profile',{cache});
 assert.equal(calls,4);
 now+=101;
 await loadSiteJourneys(client('1','credential-a'),'2026-09-01','2026-09-28','writing',{cache});
 assert.equal(calls,5);

 let retryCalls=0;
 const retryCache=createProviderCache({ttlMs:100,maxEntries:2,maxInFlight:2,maxBytes:10_000});
 const retryClient={
  providerCache:{origin:'https://us.posthog.com',account:'1',credentialIdentity:Promise.resolve('retry-credential')},
  query:async()=>({results:++retryCalls===1?[['private',0]]:valid})
 };
 assert.equal((await loadSiteJourneys(retryClient,'2026-09-01','2026-09-28','writing',{cache:retryCache})).available,false);
 assert.equal((await loadSiteJourneys(retryClient,'2026-09-01','2026-09-28','writing',{cache:retryCache})).available,true);
 assert.equal(retryCalls,2);
});

test('a site journey left pending at the deadline is collected from the PostHog cache on retry',async()=>{
 // PostHog, probed 2026-10-07: an abandoned run still finishes and caches. `async` returns a fresh cached result;
 // `force_async` computes again and misses the deadline again.
 const cached=new Map<string,unknown>();
 let now=0;
 const pending=()=>new Response(JSON.stringify({query_status:{id:'run',complete:false}}));
 const transport=createPostHogQueryTransport({POSTHOG_ENABLED:'true',POSTHOG_TARGET_ENVIRONMENT:'production',POSTHOG_QUERY_API_KEY:'query-key',POSTHOG_PROJECT_ID:'42',POSTHOG_HOST:'https://us.i.posthog.com'},{
  fetcher:async(_url,init)=>{
   if(init?.method!=='POST') return pending();
   const body=JSON.parse(String(init.body)) as {refresh:string;query:{query:string}};
   if(body.refresh==='async'&&cached.has(body.query.query)) return new Response(JSON.stringify({is_cached:true,results:cached.get(body.query.query)}));
   cached.set(body.query.query,[['writing',4,1,2,3,2,1,0,0]]);
   return pending();
  },
  now:()=>now,totalDeadlineMs:1_000,sleep:async(milliseconds)=>{now+=milliseconds;},scheduleAbort:()=>1,cancelAbort:()=>{}
 });
 assert.equal((await loadSiteJourneys(transport,'2026-09-01','2026-09-28','writing',{cache:null})).available,false);
 assert.deepEqual(await loadSiteJourneys(transport,'2026-09-01','2026-09-28','writing',{cache:null}),{available:true,rows:[{section:'writing',views:4,contactViews:1,outboundViews:2,articleViews:3,progressViews:2,activeViews:1,demoViews:0,lastSectionViews:0}]});
});
