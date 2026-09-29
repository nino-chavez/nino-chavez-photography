import assert from 'node:assert/strict';
import test from 'node:test';
import worker,{runRelay} from './index';

test('disabled relay never contacts production and public requests cannot invoke it',async()=>{
 assert.deepEqual(await runRelay({},()=>{throw Error('unexpected call');}),{state:'disabled',batches:0});
 assert.equal((await worker.fetch()).status,404);
});
test('relay fails closed, disallows redirects, and bounds backlog work',async()=>{
 await assert.rejects(runRelay({ANALYTICS_RELAY_ENABLED:'true'}),/secret_missing/);
 let calls=0;
 const result=await runRelay({ANALYTICS_RELAY_ENABLED:'true',ANALYTICS_POSTHOG_SCHEDULE_TOKEN:'x'.repeat(32)},async(url,init)=>{
  calls++;assert.equal(url,'https://ninochavez.co/photography/api/internal/analytics-posthog');assert.equal(init?.redirect,'error');
  return Response.json({ok:true,delivery:{claimed:100},health:{pending:1000}});
 });
 assert.equal(calls,4);assert.equal(result.batches,4);
 await assert.rejects(runRelay({ANALYTICS_RELAY_ENABLED:'true',ANALYTICS_POSTHOG_SCHEDULE_TOKEN:'x'.repeat(32)},async()=>new Response('',{status:403})),/http_403/);
});
