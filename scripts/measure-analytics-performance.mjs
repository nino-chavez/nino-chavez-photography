/**
 * Repeatable lab load check. Uses an isolated automated browser; never edits production data.
 *
 * Every non-GET request is aborted before it leaves the browser and counted (`blockedNonGet`): on the production host that is
 * Cloudflare's own beacon and challenge scripts, which the page injects and which are not part of the app.
 * Runs go round-robin over the pages (run 1 of every page, then run 2 of every page) with a pause between loads, so one page is
 * never loaded twice in a row and production is not hammered. Every load is a fresh browser context: cold browser cache.
 *
 * Environment:
 *   ANALYTICS_MEASURE_ORIGIN        default https://analytics.ninochavez.co (a local server origin works too)
 *   ANALYTICS_MEASURE_PATHS         comma-separated paths, default every report surface
 *   ANALYTICS_MEASURE_RUNS          1 to 15 loads per page and device, default 3
 *   ANALYTICS_MEASURE_GAP_MS        pause between loads, default 1500
 *   ANALYTICS_MEASURE_INTERACTIONS  set to 1 to also time navigation-link clicks from the first page (default off)
 *   ANALYTICS_MEASURE_OUTPUT        default .temp/analytics-performance.json
 *   PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
 *
 * Reported per page and device: responseStartMs (navigation start to the first response, includes connection setup),
 * serverMs (request sent to that first response), documentMs (request sent to the last byte of the HTML document),
 * finalHeadersMs (request sent to the final response headers), responseEndMs, the document's transfer size, the transfer
 * size of resources the browser is allowed to measure, wireBytes (everything received, counted by the browser's network
 * layer, including cross-origin images), largest contentful paint and layout shift.
 * On the production host the first response is Cloudflare's 103 Early Hints, sent before the app answers, so responseStartMs
 * and serverMs are not server time there. documentMs and finalHeadersMs follow the app; they are almost equal because the
 * app does not stream the document.
 */
import {chromium} from '@playwright/test';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
const origin=process.env.ANALYTICS_MEASURE_ORIGIN ?? 'https://analytics.ninochavez.co';
const paths=(process.env.ANALYTICS_MEASURE_PATHS ?? '/,/albums,/albums/Re7kho,/albums/DWdCET,/albums/Re7kho?recap=7,/photos,/sites,/data,/settings').split(',');
const runs=Number(process.env.ANALYTICS_MEASURE_RUNS ?? 3);
const gapMs=Number(process.env.ANALYTICS_MEASURE_GAP_MS ?? 1500);
const interactionsOn=process.env.ANALYTICS_MEASURE_INTERACTIONS==='1';
if(!Number.isInteger(runs)||runs<1||runs>15)throw new Error('Use 1–15 runs per page and device.');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const percentile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.max(0,Math.ceil(p*sorted.length)-1)]:null;};
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
const results=[];
try {
 for(const device of ['desktop','mobile']) for(let run=1;run<=runs;run++) for(const path of paths){
  const context=await browser.newContext({viewport:device==='mobile'?{width:390,height:844}:{width:1440,height:900},isMobile:device==='mobile',deviceScaleFactor:1});
  const blockedNonGet=[];
  await context.route('**/*',route=>{const request=route.request();if(!['GET','HEAD'].includes(request.method())){blockedNonGet.push(`${request.method()} ${new URL(request.url()).pathname}`);return route.abort();}return route.continue();});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const cdp=await context.newCDPSession(page);
  let wireBytes=0;
  await cdp.send('Network.enable');
  cdp.on('Network.loadingFinished',event=>{wireBytes+=event.encodedDataLength;});
  if(device==='mobile'){
   await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750});
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  }
  await page.addInitScript(()=>{
   window.__lab={lcp:0,cls:0,longTasks:[]};
   new PerformanceObserver(list=>{for(const e of list.getEntries())window.__lab.lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});
   new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__lab.cls+=e.value;}).observe({type:'layout-shift',buffered:true});
   new PerformanceObserver(list=>{for(const e of list.getEntries())window.__lab.longTasks.push(e.duration);}).observe({type:'longtask',buffered:true});
  });
  const started=Date.now();
  let response=null;
  try {
   response=await page.goto(origin+path,{waitUntil:'load',timeout:60000});
   await page.getByRole('heading',{level:1}).first().waitFor({timeout:30000});
  } catch(error){errors.push(`load: ${error.message}`);}
  let controlsReadyMs=null;
  if(await page.getByRole('button',{name:'Apply',exact:true}).count()){
   await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Apply'&&!button.disabled));
   controlsReadyMs=await page.evaluate(()=>performance.now());
  }
  await page.waitForTimeout(1500);
  const metrics=await page.evaluate(()=>{
   const n=performance.getEntriesByType('navigation')[0],resources=performance.getEntriesByType('resource');
   return {...window.__lab,requestStartMs:n.requestStart,responseStartMs:n.responseStart,serverMs:n.responseStart-n.requestStart,finalHeadersMs:n.finalResponseHeadersStart>0?n.finalResponseHeadersStart-n.requestStart:null,firstInterimMs:n.firstInterimResponseStart>0?n.firstInterimResponseStart-n.requestStart:null,documentMs:n.responseEnd-n.requestStart,responseEndMs:n.responseEnd,domContentLoadedMs:n.domContentLoadedEventEnd,loadMs:n.loadEventEnd,documentBytes:n.transferSize,resourceBytes:resources.reduce((sum,r)=>sum+r.transferSize,0),resourceCount:resources.length,crossOriginResources:resources.filter(r=>new URL(r.name).origin!==location.origin).length,scriptBytes:resources.filter(r=>r.initiatorType==='script').reduce((sum,r)=>sum+r.transferSize,0)};
  }).catch(error=>{errors.push(`metrics: ${error.message}`);return {};});
  const interactions=[];
  const unavailable=await page.getByRole('heading',{name:/report unavailable/i}).count();
  if(interactionsOn&&path===paths[0]&&!unavailable){
   for(const name of ['Albums','Site','Data']){
    const link=page.getByRole('link',{name,exact:true}).first();
    if(!await link.count())continue;
    try {
     const before=await page.evaluate(()=>({origin:performance.timeOrigin,path:location.pathname}));
     const clickedAt=Date.now();
     await link.click();
     await page.waitForFunction(from=>location.pathname!==from,before.path,{timeout:30000});
     await page.getByRole('heading',{level:1}).first().waitFor();
     await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
     const after=await page.evaluate(()=>performance.timeOrigin);
     interactions.push({name,clickToReportReadyMs:Date.now()-clickedAt,nativeNavigation:before.origin!==after});
     await page.goBack();await page.getByRole('heading',{level:1}).first().waitFor();
    } catch(error){errors.push(`${name}: ${error.message}`);break;}
   }
  }
  results.push({device,run,path,url:origin+path,status:response?.status()??null,...metrics,wireBytes,blockedNonGet,controlsReadyMs,interactions,unavailable,errors,elapsedMs:Date.now()-started});
  await context.close();
  await sleep(gapMs);
 }
}finally{await browser.close();}
const summary=[];
for(const device of ['desktop','mobile']) for(const path of paths){
 const rows=results.filter(r=>r.device===device&&r.path===path&&r.status===200&&!r.unavailable);
 const stat=key=>({median:percentile(rows.map(r=>r[key]),0.5),p90:percentile(rows.map(r=>r[key]),0.9)});
 summary.push({device,path,n:rows.length,failed:results.filter(r=>r.device===device&&r.path===path).length-rows.length,responseStartMs:stat('responseStartMs'),serverMs:stat('serverMs'),finalHeadersMs:stat('finalHeadersMs'),documentMs:stat('documentMs'),responseEndMs:stat('responseEndMs'),documentBytes:stat('documentBytes'),resourceBytes:stat('resourceBytes'),wireBytes:stat('wireBytes'),lcp:stat('lcp'),resourceCount:stat('resourceCount'),cls:stat('cls')});
}
const output=process.env.ANALYTICS_MEASURE_OUTPUT ?? '.temp/analytics-performance.json';
await mkdir(dirname(output),{recursive:true});
await writeFile(output,JSON.stringify({measuredAt:new Date().toISOString(),origin,runsPerPageAndDevice:runs,gapMs,kind:'Lab measurements; cold browser cache on every load; mobile simulates 150ms RTT, 1.6Mbps down, 4x CPU. Not real-user INP or field Core Web Vitals. Percentiles are nearest-rank.',summary,results},null,2));
const f=(v,d=0)=>v===null||v===undefined?'-':Number(v).toFixed(d);
console.log(['device','path','n','first response med/p90 (production: Cloudflare 103)','request to document complete med/p90','end med/p90','doc B med','wire B med/p90','lcp med/p90'].join(' | '));
for(const s of summary)console.log([s.device,s.path,s.n,`${f(s.serverMs.median)}/${f(s.serverMs.p90)}`,`${f(s.documentMs.median)}/${f(s.documentMs.p90)}`,`${f(s.responseEndMs.median)}/${f(s.responseEndMs.p90)}`,f(s.documentBytes.median),`${f(s.wireBytes.median)}/${f(s.wireBytes.p90)}`,`${f(s.lcp.median)}/${f(s.lcp.p90)}`].join(' | '));
if(results.some(result=>result.status!==200||result.unavailable||result.errors.length))process.exitCode=1;
