import {test,expect,type Page} from '@playwright/test';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,sep} from 'node:path';
const tracker=readFileSync('static/site-activity.js','utf8');
type Preferences={linkedAnalytics:boolean;excludeThisBrowser:boolean};
async function fixture(page:Page,options:{linked?:boolean;excluded?:boolean;webdriver?:boolean;path?:string;react?:boolean;demo?:boolean;preferences?:Promise<Preferences>}={}) {
 const events:any[]=[];
 // Only this intercepted fixture simulates a human browser. No requests reach production.
 if(!options.webdriver) await page.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{get:()=>false}));
 await page.route('https://ninochavez.co/**',async route=>{
  const req=route.request();
  if(req.url().includes('/api/analytics/preferences')) {
   try { return route.fulfill({json:options.preferences?await options.preferences:{linkedAnalytics:!!options.linked,excludeThisBrowser:!!options.excluded}}); }
   catch { return route.abort('failed'); }
  }
  if(req.url().includes('/api/analytics/events')) {events.push(req.postDataJSON());return route.fulfill({json:{accepted:true}});}
  if(req.url().includes('site-activity.js')) return route.fulfill({body:tracker,contentType:'application/javascript'});
  return route.fulfill({contentType:'text/html',body:`<html><body><h1>Mock — synthetic tracking fixture</h1><article data-pagefind-body style="height:3000px">Article</article><a href="mailto:private@example.com?subject=private" id="email">Contact</a><a href="https://elsewhere.test/?private=yes" id="out">External</a>${options.demo ? '<main data-analytics-demo-path="/demos/example"><section data-analytics-demo-section="1" style="height:9000px">Tall chapter</section><section data-analytics-demo-section="2" style="height:2000px">Last chapter</section></main>' : ''}<script defer ${options.react ? 'data-site-navigation="react"' : ''} src="/photography/site-activity.js"></script></body></html>`});
 });
 await page.goto('https://ninochavez.co'+(options.path??'/blog/sample'));
 await page.waitForTimeout(400);
 return events;
}
for(const initialPath of ['/work/blueprint','/photography']) test('React readiness waits for loaded preferences at '+initialPath,async({page})=>{
 let resolvePreferences!:(value:Preferences)=>void;
 const preferences=new Promise<Preferences>(resolve=>{resolvePreferences=resolve;});
 const events=await fixture(page,{react:true,path:initialPath,preferences});
 await page.evaluate(path=>{document.documentElement.dataset.analyticsPath=path;dispatchEvent(new Event('nino:page-ready'));dispatchEvent(new Event('nino:page-ready'));},initialPath);
 expect(events).toHaveLength(0);
 resolvePreferences({linkedAnalytics:false,excludeThisBrowser:false});
 await expect.poll(()=>events.filter(e=>e.event_name==='site_page_viewed').length).toBe(1);
 await page.evaluate(()=>{history.pushState(null,'','/about');document.documentElement.dataset.analyticsPath='/about';dispatchEvent(new Event('nino:page-ready'));});
 await expect.poll(()=>events.filter(e=>e.event_name==='site_page_viewed').length).toBe(2);
});
test('delayed excluded preferences send no actions',async({page})=>{
 let resolvePreferences!:(value:Preferences)=>void;
 const preferences=new Promise<Preferences>(resolve=>{resolvePreferences=resolve;});
 const events=await fixture(page,{react:true,path:'/work/example',preferences});
 await page.evaluate(()=>{document.documentElement.dataset.analyticsPath='/work/example';dispatchEvent(new Event('nino:page-ready'));});
 resolvePreferences({linkedAnalytics:false,excludeThisBrowser:true});
 await page.waitForFunction(()=>localStorage.getItem('gallery-analytics-preferences-v2')==='{"linkedAnalytics":false,"excludeThisBrowser":true}');
 expect(events).toHaveLength(0);
});
test('failed preferences do not consume or send the initial view',async({page})=>{
 let rejectPreferences!:(reason:Error)=>void;
 const preferences=new Promise<Preferences>((_,reject)=>{rejectPreferences=reject;});
 const events=await fixture(page,{react:true,path:'/work/example',preferences});
 await page.evaluate(()=>{document.documentElement.dataset.analyticsPath='/work/example';dispatchEvent(new Event('nino:page-ready'));});
 rejectPreferences(new Error('unavailable'));
 await page.waitForTimeout(300);
 expect(events).toHaveLength(0);
});
test('unconsented views, progress and contact clicks carry no identity or contact data',async({page})=>{
 const events=await fixture(page);
 expect(events.filter(e=>e.event_name==='site_page_viewed')).toHaveLength(1);
 await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));
 await page.locator('#email').click();
 await expect.poll(()=>events.some(e=>e.event_name==='content_progressed'&&e.properties.threshold===90)).toBe(true);
 expect(events.find(e=>e.event_name==='site_link_clicked').properties.target_kind).toBe('email');
 for(const event of events){expect(event.anonymous_browser_id).toBeNull();expect(event.visit_id).toBeNull();expect(JSON.stringify(event)).not.toContain('private');}
 await page.evaluate(()=>history.replaceState(null,'',location.href));await page.waitForTimeout(300);
 expect(events.filter(e=>e.event_name==='site_page_viewed')).toHaveLength(1);
});
test('consented events share a visit and route navigation creates a new view',async({page})=>{
 const events=await fixture(page,{linked:true});
 await page.evaluate(()=>history.pushState(null,'','/work/example'));await page.waitForTimeout(300);
 expect(events.filter(e=>e.event_name==='site_page_viewed')).toHaveLength(2);
 expect(events[0].visit_id).toBe(events[1].visit_id);
 expect(events[0].properties.view_id).not.toBe(events[1].properties.view_id);
});
for(const options of [{excluded:true},{webdriver:true},{path:'/blog/private/token/article'}]) test('suppresses '+JSON.stringify(options),async({page})=>{
 const events=await fixture(page,options);expect(events).toHaveLength(0);
});

test('React navigation waits for the newly rendered route and measures the matching demo chapters',async({page})=>{
 const events=await fixture(page,{react:true,path:'/demos/example',demo:true});
 expect(events).toHaveLength(0);
 await page.evaluate(()=>{document.documentElement.dataset.analyticsPath='/demos/example';dispatchEvent(new Event('nino:page-ready'));});
 await expect.poll(()=>events.some(e=>e.event_name==='site_page_viewed')).toBe(true);
 expect(events.find(e=>e.event_name==='site_page_viewed').properties.content_kind).toBe('demo_story');
 await page.locator('[data-analytics-demo-section="1"]').scrollIntoViewIfNeeded();
 await expect.poll(()=>events.some(e=>e.event_name==='demo_section_viewed'&&e.properties.position===1)).toBe(true);
 await page.locator('[data-analytics-demo-section="2"]').scrollIntoViewIfNeeded();
 await expect.poll(()=>events.some(e=>e.event_name==='demo_section_viewed'&&e.properties.position===2)).toBe(true);
 await page.evaluate(()=>history.pushState(null,'','/work/example'));await page.waitForTimeout(300);
 expect(events.filter(e=>e.event_name==='site_page_viewed')).toHaveLength(1);
 await page.evaluate(()=>{document.documentElement.dataset.analyticsPath='/work/example';dispatchEvent(new Event('nino:page-ready'));});
 await expect.poll(()=>events.filter(e=>e.event_name==='site_page_viewed').length).toBe(2);
 expect(events.filter(e=>e.event_name==='site_page_viewed')[1].properties.content_kind).toBe('page');
});
test('active article time requires the article on screen',async({page})=>{
 await page.clock.install();
 const events=await fixture(page);
 await page.clock.runFor(31000);
 await expect.poll(()=>events.some(e=>e.event_name==='content_active_time'&&e.properties.threshold===30)).toBe(true);
 await page.evaluate(()=>{const spacer=document.createElement('footer');spacer.style.height='2000px';document.body.append(spacer);scrollTo(0,document.body.scrollHeight);});
 await page.clock.runFor(31000);
 expect(events.filter(e=>e.event_name==='content_active_time'&&e.properties.threshold===60)).toHaveLength(0);
});

test('deployed main-site adapter records rendered navigation and uses the first-party collector', async ({page}) => {
 const siteBase=process.env.ANALYTICS_MAIN_TEST_BASE_URL;
 test.skip(!siteBase,'main-site production-build rehearsal supplies its loopback URL');
 const events:any[]=[];
 await page.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{get:()=>false}));
 await page.route('https://ninochavez.co/**',async route=>{
  if(route.request().url().endsWith('/photography/site-activity.js')) return route.fulfill({body:tracker,contentType:'application/javascript'});
  if(route.request().url().includes('/api/analytics/preferences')) return route.fulfill({json:{linkedAnalytics:true,excludeThisBrowser:false}});
  if(route.request().url().includes('/api/analytics/events')) {events.push(route.request().postDataJSON());return route.fulfill({json:{accepted:true}});}
  const url=new URL(route.request().url());
  const response=await fetch(siteBase!+url.pathname+url.search,{headers:{accept:route.request().headers()['accept'] ?? '*/*'}});
  return route.fulfill({status:response.status,contentType:response.headers.get('content-type') ?? 'text/plain',body:Buffer.from(await response.arrayBuffer())});
 });
 await page.goto('https://ninochavez.co/');
 await expect.poll(()=>events.filter(e=>e.event_name==='site_page_viewed').length).toBe(1);
 expect(events[0].properties.canonical_path).toBe('/');
 await page.locator('a[href="/work"]').first().click();
 await expect.poll(()=>events.filter(e=>e.event_name==='site_page_viewed').length).toBe(2);
 expect(events.filter(e=>e.event_name==='site_page_viewed')[1].properties.canonical_path).toBe('/work');
 expect(events[0].visit_id).toBe(events.filter(e=>e.event_name==='site_page_viewed')[1].visit_id);
 expect(await page.locator('script[data-nino-site-activity]').count()).toBe(1);
});


test('built blog article loads the owned tracker and sends linked progression without production requests',async({page})=>{
 const dist=process.env.ANALYTICS_BLOG_TEST_DIST;test.skip(!dist,'built blog rehearsal provides its dist folder');
 const root=resolve(dist!);const article='/blog/22gb-to-2gb-video-compression-as-agentic-collaboration';
 const events:any[]=[];await page.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{get:()=>false}));
 await page.route('https://ninochavez.co/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/photography/site-activity.js')return route.fulfill({body:tracker,contentType:'application/javascript'});
  if(path.includes('/api/analytics/preferences'))return route.fulfill({json:{linkedAnalytics:true,excludeThisBrowser:false}});
  if(path.includes('/api/analytics/events')){events.push(route.request().postDataJSON());return route.fulfill({json:{accepted:true}});}
  const file=resolve(root,'.'+decodeURIComponent(path)+(path===article?'.html':''));
  if(!file.startsWith(root+sep)||!existsSync(file))return route.fulfill({status:404});
  return route.fulfill({body:readFileSync(file),contentType:path===article?'text/html':path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':'application/octet-stream'});
 });
 await page.goto('https://ninochavez.co'+article);
 await expect.poll(()=>events.some(e=>e.event_name==='site_page_viewed')).toBe(true);
 expect(events.find(e=>e.event_name==='site_page_viewed').properties.content_kind).toBe('article');
 await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));
 await expect.poll(()=>events.some(e=>e.event_name==='content_progressed'&&e.properties.threshold===90)).toBe(true);
 expect(events[0].anonymous_browser_id).toBeTruthy();
});
