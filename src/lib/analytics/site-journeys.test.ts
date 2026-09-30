import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSiteJourneyQuery,loadSiteJourneys} from './site-journeys.server';
import {createProviderCache} from './provider-cache.server';
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
