import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
const output='docs/implementation/analytics-scheduled-reports-20260929/captures';
for(const width of [1440,390]) for(const view of ['gallery','sites'])test(`scheduled ${view} ${width}`,async({page,baseURL})=>{
 expect(new URL(baseURL!).hostname).toBe('analytics-review.localhost');
 await page.setViewportSize({width,height:width===390?844:1000});
 await page.route('https://imagedelivery.net/**',r=>r.fulfill({path:'static/images/hero/hero-1-mobile.webp',contentType:'image/webp'}));
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(view==='gallery'?'/photography/analytics/photos?period=custom&start=2026-09-28&end=2026-09-28':'/photography/analytics/sites?view=actions&section=writing&period=7');
 if(view==='gallery'){
  await expect(page.locator('ul.grid > li')).toHaveCount(12);
  await page.getByRole('link',{name:'Next',exact:true}).click();
  await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();
  await expect(page.locator('ul.grid > li')).toHaveCount(12);
 }else{
  // The site report was rebuilt in step 5: the actions section and its "today so far" line are what is left to check here.
  await expect(page.getByRole('heading',{name:'What visitors did on each page'})).toBeVisible();
  await expect(page.getByText(/Today so far, kept apart from every number above/)).toBeVisible();
 }
 await page.evaluate(()=>{const b=document.createElement('p');b.textContent='Mock — synthetic data; representative photo previews.';b.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#fff3b0;color:#172238;font-size:12px;padding:6px;margin:0';document.body.append(b);});
 const overflow=()=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
 // Show that this gate detects a known overflow, then restore the real screen.
 await page.evaluate(()=>{const b=document.createElement('div');b.id='overflow-negative';b.style.cssText=`position:absolute;left:0;top:0;width:${document.documentElement.clientWidth+20}px;height:1px`;document.body.append(b);});
 expect(await overflow()).toBeGreaterThan(0);
 await page.locator('#overflow-negative').evaluate(el=>el.remove());
 expect(await overflow()).toBeLessThanOrEqual(0);
 expect(errors).toEqual([]);
 if(view==='sites')await page.locator('.actions').evaluate(el=>el.scrollIntoView({block:'start'}));
 else await page.evaluate(()=>scrollTo(0,0));
 mkdirSync(output,{recursive:true});await page.screenshot({path:`${output}/${view}-${width}.png`,animations:'disabled'});
});
