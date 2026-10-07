import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.use({userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'});

test('actual browser senders produce accepted photo, item, ZIP and exclusion events', async ({ page, baseURL }) => {
 if (!baseURL || !['127.0.0.1','localhost','analytics-review.localhost'].includes(new URL(baseURL).hostname)) throw Error('Collection rehearsal is loopback-only');
 await page.goto('/photography/analytics/data?period=7');
 const observed: {name:string,status:number,body:any,payload:any}[]=[];
 const pending: Promise<void>[]=[];
 page.on('response',response=>{
  if(!response.url().endsWith('/api/analytics/events'))return;
  pending.push((async()=>{observed.push({name:response.request().postDataJSON().event_name,status:response.status(),body:await response.json(),payload:response.request().postDataJSON()});})());
 });
 await page.evaluate(async()=>{
  // Import the same Vite module the gallery components call; do not reconstruct its payloads.
  const modulePath='/photography/src/lib/analytics/client.ts';
  const analytics=await import(modulePath);
  await analytics.sendAnalyticsEventV2({eventName:'photo_rendered',properties:{photo_id:'legacy-1',view_id:crypto.randomUUID(),load_duration_ms:40}});
  const zip=analytics.startDownloadLifecycle('saved_photo_zip',{},2);
  zip.itemRequested('legacy-1'); zip.itemPrepared('legacy-1',undefined,100); zip.itemPrepared('legacy-1',undefined,100);
  zip.prepared(120); zip.handedOff(); zip.cancelled('handoff');
  const cached=analytics.startDownloadLifecycle('album_zip',{albumKey:'legacy'},2);
  cached.prepared(500,false); cached.handedOff();
 });
 await expect.poll(()=>observed.length).toBe(9);
 await Promise.all(pending);
 for(const event of observed)expect(event.body,event.name).toMatchObject({accepted:true,duplicate:false});
 expect(observed.filter(x=>x.name==='download_item_prepared')).toHaveLength(1);
 expect(observed.filter(x=>x.name==='download_cancelled')).toHaveLength(0);
 const mixed=observed.find(x=>x.name==='download_prepared'&&x.payload.properties.mode==='saved_photo_zip')!;
 expect(mixed.payload.properties).toMatchObject({prepared_item_count:1,byte_count:120});
 expect(mixed.payload.properties.album_key).toBeUndefined();
 const cached=observed.find(x=>x.name==='download_prepared'&&x.payload.properties.mode==='album_zip')!;
 expect(cached.payload.properties.item_count_known).toBe(false);
 expect(cached.payload.properties.prepared_item_count).toBeUndefined();
 const preference=await page.request.post('/photography/api/analytics/preferences',{data:{linkedAnalytics:false,excludeThisBrowser:true},headers:{origin:baseURL!}});
 expect(preference.ok()).toBe(true);
 const cookies=await page.context().cookies();
 expect(cookies.find(x=>x.name==='gallery_analytics_excluded_v2')?.value).toBe('1');
 const excluded=await page.request.post('/photography/api/engagement',{data:{event_type:'view',photo_id:'legacy-1'},headers:{origin:baseURL!}});
 expect(await excluded.json()).toMatchObject({accepted:false,reason:'self_excluded'});
});


test('permission binds a server identity before collection and withdrawal cancels later export', async ({page,baseURL})=>{
 if(!baseURL || !['127.0.0.1','localhost','analytics-review.localhost'].includes(new URL(baseURL).hostname))throw Error('Loopback only');
 await page.goto('/photography/analytics/data');
 const permission=await page.request.post('/photography/api/analytics/preferences',{data:{linkedAnalytics:true,excludeThisBrowser:false},headers:{origin:baseURL!}});
 expect(permission.ok()).toBe(true);
 const binding=(await page.context().cookies()).find(x=>x.name==='gallery_analytics_identity_v2');
 expect(binding?.httpOnly).toBe(true);
 const event={schema_version:2,event_id:crypto.randomUUID(),event_name:'photo_opened',occurred_at:new Date().toISOString(),anonymous_browser_id:crypto.randomUUID(),visit_id:crypto.randomUUID(),properties:{photo_id:'legacy-1',view_id:crypto.randomUUID(),entry_surface:'photo_route'}};
 const accepted=await page.request.post('/photography/api/analytics/events',{data:event,headers:{origin:baseURL!}});
 expect(await accepted.json()).toMatchObject({accepted:true,export_eligible:true});
 const runtime=JSON.parse(readFileSync('.temp/analytics-local-rehearsal/runtime.json','utf8'));
 if(!['127.0.0.1','localhost'].includes(new URL(runtime.API_URL).hostname))throw Error('Local DB only');
 const headers={apikey:runtime.SERVICE_ROLE_KEY,authorization:'Bearer '+runtime.SERVICE_ROLE_KEY};
 const stored=await page.request.get(runtime.API_URL+'/rest/v1/analytics_events_v2?event_id=eq.'+event.event_id+'&select=anonymous_browser_id,export_eligible',{headers});
 const rows=await stored.json();
 expect(rows[0].anonymous_browser_id).toBe(binding!.value.split('.')[0]);
 expect(rows[0].anonymous_browser_id).not.toBe(event.anonymous_browser_id);
 const withdrawal=await page.request.post('/photography/api/analytics/preferences',{data:{linkedAnalytics:false,excludeThisBrowser:false},headers:{origin:baseURL!}});
 expect(withdrawal.ok()).toBe(true);
 const queued=await page.request.get(runtime.API_URL+'/rest/v1/analytics_posthog_outbox?event_id=eq.'+event.event_id+'&select=event_id',{headers});
 expect(await queued.json()).toEqual([]);
 expect((await page.context().cookies()).some(x=>x.name==='gallery_analytics_identity_v2')).toBe(false);
 const later=await page.request.post('/photography/api/analytics/events',{data:{...event,event_id:crypto.randomUUID()},headers:{origin:baseURL!}});
 expect(await later.json()).toMatchObject({accepted:true,export_eligible:false});
});
