import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {eventPropertiesMatchContract,isPublicSitePath} from './events-v2';
import {scrubPostHogProperties} from './posthog-contract';
const properties={site_section:'writing',canonical_path:'/blog/real-article',view_id:'10000000-0000-4000-8000-000000000001',threshold:90};
describe('public-site measurement boundary',()=>{
 it('accepts public content and refuses private and query-bearing paths',()=>{
  assert.equal(eventPropertiesMatchContract('content_progressed',properties),true);
  for(const path of ['/blog/private/token/article','/blog/draft/article','/blog/api/feed','/work/a?email=nino@example.com','/demos/a#person','/photography/share/secret','/login','/blog/a%40example.com']) assert.equal(isPublicSitePath(path),false,path);
 });
 it('rejects wrong section, fabricated progress, contact values and target leakage',()=>{
  for(const extra of [{site_section:'profile'},{threshold:100},{email:'nino@example.com'},{photo_id:'private-photo'},{canonical_path:'/blog/draft'}]) assert.equal(eventPropertiesMatchContract('content_progressed',{...properties,...extra}),false);
  assert.equal(eventPropertiesMatchContract('site_link_clicked',{...properties,threshold:undefined,target_kind:'email',target_path:'mailto:nino@example.com'}),false);
  assert.equal(eventPropertiesMatchContract('demo_section_viewed',{site_section:'demos',canonical_path:'/demos/a',view_id:properties.view_id,position:3,section_count:2}),false);
 });
 it('exports only linked audience observations and bounded approved properties',()=>{
  const event={schema_version:2 as const,event_id:properties.view_id,event_name:'content_progressed' as const,occurred_at:'2026-09-29T12:00:00Z',received_at:'2026-09-29T12:00:01Z',anonymous_browser_id:properties.view_id,visit_id:properties.view_id,traffic_context:'audience' as const,export_eligible:true,properties:{...properties,email:'secret@example.com',url:'https://bad.example/?secret=x'}};
  const scrubbed=scrubPostHogProperties(event)!; assert.equal(scrubbed.canonical_path,'/blog/real-article'); assert.equal(scrubbed.site_section,'writing'); assert.equal(scrubbed.threshold,90);
  assert.equal('email' in scrubbed,false);
  assert.equal(scrubPostHogProperties({...event,traffic_context:'operator'}),null);
  assert.equal(scrubPostHogProperties({...event,anonymous_browser_id:null,visit_id:null,export_eligible:false}),null);
 });
});
