/** Dedicated test-project acceptance. Capture requires an explicit test-only flag. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PostHog } from 'posthog-node';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildGalleryDecisionQuery, parseGalleryDecisionEvidence, createPostHogQueryTransport } from '../src/lib/analytics/posthog-queries.server';
if (process.env.POSTHOG_PROJECT_ID !== '635867' || !process.env.POSTHOG_QUERY_API_KEY) throw Error('Dedicated test query credentials required');
const fixture = JSON.parse(readFileSync('docs/implementation/analytics-20260929/evidence/posthog-test.json', 'utf8'));
assert.equal(fixture.project, '635867');
assert.match(fixture.album, /^rehearsal-/);
const transport = createPostHogQueryTransport({...process.env, POSTHOG_ENABLED:'true', POSTHOG_TARGET_ENVIRONMENT:'production', POSTHOG_HOST:'https://us.i.posthog.com'}, {totalDeadlineMs:30000})!;
const query = buildGalleryDecisionQuery({start:fixture.day,end:fixture.day,albumKeys:[fixture.album]},[fixture.album])!;
query.query = query.query.replace('FROM events WHERE ', `FROM events WHERE properties.release = '${fixture.run}' AND `);
const didCapture = process.env.POSTHOG_VERIFY_RENDERING_CAPTURE === 'true';
if (didCapture) {
 if (!process.env.POSTHOG_PROJECT_API_KEY) throw Error('Dedicated test capture key required');
 const capture = new PostHog(process.env.POSTHOG_PROJECT_API_KEY, {host:'https://us.i.posthog.com', flushAt:1, flushInterval:0, disableGeoip:true, fetchRetryCount:0, requestTimeout:10000});
 const stable = (name:string) => { const hex=createHash('sha256').update(fixture.run+':intelligence-render:'+name).digest('hex'); return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`; };
 const visit=stable('visit');
 try {
  for (const [name,event,view] of [['success','photo_rendered','one'],['failed','photo_load_failed','two'],['recovered','photo_rendered','two']] as const) {
   const item={event,uuid:stable(name),distinctId:'synthetic-intelligence-'+visit,timestamp:new Date(`${fixture.day}T18:00:00Z`),properties:{$process_person_profile:false,schema_version:2,traffic_context:'audience',visit_id:visit,view_id:stable(view),event_id:stable(name),release:fixture.run,album_key:fixture.album,photo_id:'rehearsal-render-'+fixture.run}};
   await capture.captureImmediate(item); if(name==='success') await capture.captureImmediate(item);
  }
 } finally { await capture.shutdown(); }
}
let result: ReturnType<typeof parseGalleryDecisionEvidence> = null;
for(let attempt=0;attempt<6;attempt++) {
 const raw = await transport.query({query}); result = parseGalleryDecisionEvidence(raw, new Date().toISOString(), true);
 if(result?.rendering?.observedTerminal===2) break;
 if(!didCapture) break;
 await new Promise(resolve=>setTimeout(resolve,3000));
}
assert.equal(result?.available, true);
assert.equal(result?.photoResponses.length, 1);
assert.deepEqual(result?.photoResponses.map(({exposures, favorites, downloadItems, responses})=>({exposures,favorites,downloadItems,responses})), [{exposures:1,favorites:1,downloadItems:1,responses:1}]);
assert.deepEqual(result?.albumDiscovery.map(({exposures,opens,directEntries})=>({exposures,opens,directEntries})), [{exposures:1,opens:1,directEntries:0}]);
assert.deepEqual(result?.rendering, {rendered:2,failed:1,observedTerminal:2});
assert.equal(result?.search, null);
const receipt={project:635867,observedAt:new Date().toISOString(),scope:'existing synthetic test cohort',capturePerformed:didCapture,passed:true,checks:['provider accepts fixed decision query','favorites and download response overlap counted once','per-photo denominator','per-album discovery','successful retry and failed view overlap counted once','duplicate event delivery counted once','events missing view IDs excluded','sliced searches withheld'],limits:'Dedicated test-project synthetic provider acceptance; does not prove live audience behavior or collection on deployed sites.'};
mkdirSync('docs/implementation/analytics-intelligence-20260930/evidence',{recursive:true});
writeFileSync('docs/implementation/analytics-intelligence-20260930/evidence/posthog-decisions.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
