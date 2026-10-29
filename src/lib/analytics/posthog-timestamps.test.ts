import assert from 'node:assert/strict';
import test from 'node:test';
import { scrubPostHogProperties } from './posthog-contract';
import type { PostHogEnvelope } from './posthog.types';
const event: PostHogEnvelope = {
 event_id:'550e8400-e29b-41d4-a716-446655440000', schema_version:2,event_name:'photo_opened',
 occurred_at:'2026-09-29T12:00:00.123+00:00',received_at:'2026-09-29T12:00:00.123456+00:00',
 anonymous_browser_id:'synthetic-browser',visit_id:'synthetic-visit',traffic_context:'audience',export_eligible:true,
 properties:{photo_id:'synthetic-photo',view_id:'550e8400-e29b-41d4-a716-446655440001'}
};
test('database JSON timestamptz values pass the provider boundary',()=>{
 assert.ok(scrubPostHogProperties(event));
 assert.ok(scrubPostHogProperties({...event,occurred_at:'2026-09-29T07:00:00-05:00'}));
 for(const invalid of ['not a date','2026-09-29T99:00:00Z','2026-09-29T12:00:00']){
  assert.equal(scrubPostHogProperties({...event,received_at:invalid}),null);
 }
});
