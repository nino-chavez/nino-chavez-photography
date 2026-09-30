/** Synthetic provider rehearsal. Refuses every project except the existing isolated test project. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPostHogCaptureClient} from '../src/lib/analytics/posthog.server';
import {createPostHogQueryTransport} from '../src/lib/analytics/posthog-queries.server';
import {loadSiteJourneys} from '../src/lib/analytics/site-journeys.server';
import type {AcceptedEventV2} from '../src/lib/analytics/events-v2';
import {preparePostHogDelivery} from '../src/lib/analytics/posthog-contract';
if(process.env.POSTHOG_PROJECT_ID!=='635867'||!process.env.POSTHOG_PROJECT_API_KEY||!process.env.POSTHOG_QUERY_API_KEY)throw Error('isolated test credentials required');
const capture=createPostHogCaptureClient({projectApiKey:process.env.POSTHOG_PROJECT_API_KEY,host:'https://us.i.posthog.com'})!;
const transport=createPostHogQueryTransport({...process.env,POSTHOG_ENABLED:'true',POSTHOG_TARGET_ENVIRONMENT:'production',POSTHOG_HOST:'https://us.i.posthog.com'})!;
const date=new Date().toISOString().slice(0,10),before=await loadSiteJourneys(transport,date,date,'writing');
assert.equal(before.available,true);
const baseline=before.available?before.rows.find(r=>r.section==='writing'):null;
const browser=randomUUID(),visit=randomUUID(),view=randomUUID();
const envelope=(event_name:AcceptedEventV2['event_name'],properties:Record<string,string|number>,offset:number):AcceptedEventV2=>({event_id:randomUUID(),schema_version:2,event_name,occurred_at:new Date(Date.now()+offset).toISOString(),received_at:new Date().toISOString(),anonymous_browser_id:browser,visit_id:visit,traffic_context:'audience',export_eligible:true,properties:{site_section:'writing',canonical_path:'/blog/synthetic-provider-check',view_id:view,release:'synthetic-site-actions-verification',...properties}});
const events=[envelope('site_page_viewed',{layout_class:'wide',content_kind:'article'},0),envelope('content_progressed',{threshold:90},1000),envelope('site_link_clicked',{target_kind:'email'},2000)];
for(const e of [...events,events[0]]){const delivery=preparePostHogDelivery(e)!;await capture.capture(delivery);}
let after;
for(let attempt=0;attempt<10;attempt++){
 await new Promise(resolve=>setTimeout(resolve,2000));
 after=await loadSiteJourneys(transport,date,date,'writing');
 if(after.available&&after.rows.some(r=>r.section==='writing'&&r.views===(baseline?.views??0)+1 && r.contactViews===(baseline?.contactViews??0)+1 && r.progressViews===(baseline?.progressViews??0)+1))break;
}
assert.equal(after?.available,true);
const row=after?.available?after.rows.find(r=>r.section==='writing'):null;
console.log(JSON.stringify({baseline,row}));
assert.equal(row?.views,(baseline?.views??0)+1);assert.equal(row?.contactViews,(baseline?.contactViews??0)+1);assert.equal(row?.progressViews,(baseline?.progressViews??0)+1);
console.log(JSON.stringify({project:635867,scope:'synthetic provider rehearsal only',duplicateViewCountedOnce:true,contactAfterView:true,progressAfterView:true,productionActivated:false}));
