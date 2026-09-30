/** Repeatable lab load check. Uses an isolated automated browser; never edits production data. */
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const origin=process.env.ANALYTICS_MEASURE_ORIGIN ?? 'https://analytics.ninochavez.co';
const paths=(process.env.ANALYTICS_MEASURE_PATHS ?? '/photography/analytics/sites,/photography/analytics/operator').split(',');
const runs=Number(process.env.ANALYTICS_MEASURE_RUNS ?? 3);
if(!Number.isInteger(runs)||runs<1||runs>5)throw new Error('Use 1–5 runs per page and device.');
const browser=await chromium.launch({headless:true});
const results=[];
try {
 for(const device of ['desktop','mobile']) for(const path of paths) for(let run=1;run<=runs;run++){
  const context=await browser.newContext({viewport:device==='mobile'?{width:390,height:844}:{width:1440,height:900},isMobile:device==='mobile',deviceScaleFactor:1});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const cdp=await context.newCDPSession(page);
  if(device==='mobile'){
   await cdp.send('Network.enable');
   await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750});
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  }
  await page.addInitScript(()=>{
   window.__lab={lcp:0,cls:0,longTasks:[]};
   new PerformanceObserver(list=>{for(const e of list.getEntries())window.__lab.lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});
   new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__lab.cls+=e.value;}).observe({type:'layout-shift',buffered:true});
   new PerformanceObserver(list=>{for(const e of list.getEntries())window.__lab.longTasks.push(e.duration);}).observe({type:'longtask',buffered:true});
  });
  const started=Date.now();const response=await page.goto(origin+path,{waitUntil:'load',timeout:60000});
  await page.getByRole('heading',{level:1}).waitFor();
  let controlsReadyMs=null;
  if(await page.getByRole('button',{name:'Apply',exact:true}).count()){
   await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Apply'&&!button.disabled));
   controlsReadyMs=await page.evaluate(()=>performance.now());
  }
  await page.waitForTimeout(1500);
  const metrics=await page.evaluate(()=>{
   const n=performance.getEntriesByType('navigation')[0],resources=performance.getEntriesByType('resource');
   return {...window.__lab,responseStartMs:n.responseStart,responseEndMs:n.responseEnd,domContentLoadedMs:n.domContentLoadedEventEnd,loadMs:n.loadEventEnd,documentBytes:n.transferSize,resourceBytes:resources.reduce((sum,r)=>sum+r.transferSize,0),resourceCount:resources.length,scriptBytes:resources.filter(r=>r.initiatorType==='script').reduce((sum,r)=>sum+r.transferSize,0)};
  });
  const interactions=[];
  const unavailable=await page.getByRole('heading',{name:/report unavailable/i}).count();
  if(!unavailable&&await page.getByRole('link',{name:'Albums',exact:true}).count()){
   // Start in the browser click handler so automation polling is not part of the timing.
   await page.evaluate(()=>document.addEventListener('click',()=>{
    window.__labClick=performance.now();window.__labPaint=undefined;
    requestAnimationFrame(()=>requestAnimationFrame(()=>window.__labPaint=performance.now()-window.__labClick));
   },{capture:true}));
   for(const [name,heading] of [['Albums','Compare albums'],['Photos','Popular, rising, and recently active']]){
    try {
    await page.getByRole('link',{name,exact:true}).click();
    await page.getByRole('heading',{name:heading,exact:true}).waitFor();
    await page.waitForFunction(()=>window.__labPaint!==undefined);
    interactions.push({name,clickToTwoFramesMs:await page.evaluate(()=>window.__labPaint),clickToReportReadyMs:await page.evaluate(()=>performance.now()-window.__labClick)});
    } catch(error){errors.push(`${name}: ${error.message}`);break;}
   }
  }
  results.push({device,run,url:origin+path,status:response.status(),...metrics,controlsReadyMs,interactions,unavailable,errors,elapsedMs:Date.now()-started});
  await context.close();
 }
}finally{await browser.close();}
const output=process.env.ANALYTICS_MEASURE_OUTPUT ?? '.temp/analytics-performance.json';
await writeFile(output,JSON.stringify({measuredAt:new Date().toISOString(),kind:'Lab measurements; mobile simulates 150ms RTT, 1.6Mbps down, 4x CPU. Not real-user INP or field Core Web Vitals.',results},null,2));
console.log(JSON.stringify(results.map(({device,run,url,status,lcp,cls,responseEndMs,interactions,unavailable,errors})=>({device,run,url,status,lcp,cls,responseEndMs,interactions,unavailable,errors}))));
if(results.some(result=>result.status!==200||result.unavailable||result.errors.length))process.exitCode=1;
