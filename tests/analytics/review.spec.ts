import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
for(const width of [1440,390]) test(`operator ${width}`,async({page,context,baseURL})=>{
 await page.setViewportSize({width,height:width===390?844:1000});
 const jar=JSON.parse(readFileSync('.temp/analytics-parent-local-cookies.json','utf8'));
 const cookieDomain=process.env.ANALYTICS_COOKIE_DOMAIN ?? new URL(baseURL ?? 'http://127.0.0.1').hostname;
 await context.addCookies(jar.map((x:any)=>({name:x.name,value:x.value,domain:cookieDomain,path:'/',httpOnly:false,secure:false,sameSite:'Lax'})));
 await page.route('**/static.cloudflareinsights.com/**',r=>r.abort());
 await page.route('**/cdn-cgi/rum**',r=>r.abort());
 await page.route('https://imagedelivery.net/**',r=>r.fulfill({path:'static/images/hero/hero-1-mobile.webp',contentType:'image/webp'}));
 await page.goto('/photography/analytics/operator?period=custom&start=2026-09-27&end=2026-09-27');
 await expect(page.getByRole('heading',{name:'Gallery analytics',exact:true})).toBeVisible();
 await page.evaluate(()=>{const b=document.createElement('div');b.textContent='Mock — synthetic data. Images are representative gallery photographs.';b.style.cssText='position:fixed;bottom:0;left:0;right:0;background:#ffe082;color:#111;padding:6px;z-index:99999;text-align:center;font-size:12px';document.body.append(b);});
 if(width===390){const box=await page.locator('.answer-primary strong').boundingBox();expect(box!.y+box!.height).toBeLessThan(760);}
 await page.screenshot({animations:'disabled',path:`.temp/parent-ui-review/operator-${width}-top.png`});
 if(width===1440){const albums=page.locator('#albums');await expect.poll(async()=>{const box=await albums.boundingBox();return box?.y ?? Number.MAX_SAFE_INTEGER;}).toBeLessThan(1000);}
 await page.getByRole('link',{name:'Photos',exact:true}).first().click();
 await expect(page.getByRole('heading',{name:'Popular, rising, and recently active',exact:true})).toBeInViewport();
 await page.screenshot({animations:'disabled',path:`.temp/parent-ui-review/operator-${width}-photos.png`});
 for(const [mode,label] of [['rising','Rising'],['recent','Recently active']]){await page.getByRole('button',{name:label,exact:true}).click();await expect(page.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');await page.locator('#photos').evaluate(e=>window.scrollTo({top:e.getBoundingClientRect().top+window.scrollY-72,behavior:'instant'}));await page.screenshot({animations:'disabled',path:`.temp/parent-ui-review/operator-${width}-${mode}.png`});}
 await page.getByRole('button',{name:'Table',exact:true}).click();await page.screenshot({animations:'disabled',path:`.temp/parent-ui-review/operator-${width}-photo-table.png`});
 await page.getByRole('button',{name:'Images',exact:true}).click();await page.locator('.photo-inspect').first().click();await expect(page.getByRole('dialog')).toBeInViewport();await page.screenshot({animations:'disabled',path:`.temp/parent-ui-review/operator-${width}-inspection.png`});await page.getByRole('button',{name:'Return to photos',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 if(width===390){const nav=await page.getByRole('navigation',{name:'Analytics sections'}).evaluate(e=>{const r=e.getBoundingClientRect();return [...e.querySelectorAll('a')].every(a=>{const x=a.getBoundingClientRect();return x.left>=r.left&&x.right<=r.right;});});expect(nav).toBe(true);}

 for(const id of ['overview','albums','sources','measurement']) {await page.locator('#'+id).evaluate(e=>window.scrollTo({top:e.getBoundingClientRect().top+window.scrollY-72,behavior:'instant'}));await page.screenshot({animations:'disabled',path:`.temp/parent-ui-review/operator-${width}-${id}.png`});}
 if(width===390){const table=page.getByRole('region',{name:'Album comparison table',exact:true});await table.evaluate(e=>window.scrollTo({top:e.getBoundingClientRect().top+window.scrollY-110,behavior:'instant'}));const before=await table.locator('tbody td').first().boundingBox();await table.evaluate(e=>e.scrollLeft=9999);expect(await table.evaluate(e=>e.scrollLeft)).toBeGreaterThan(0);const after=await table.locator('tbody td').first().boundingBox();expect(Math.abs(before!.x-after!.x)).toBeLessThan(2);await page.screenshot({animations:'disabled',path:'.temp/parent-ui-review/operator-390-albums-scrolled.png'});}
 for(const [name,heading] of [['notes','Add sharing context'],['saved','Repeat this analysis']]){await page.getByRole('heading',{name:heading,exact:true}).evaluate(e=>window.scrollTo({top:e.getBoundingClientRect().top+window.scrollY-90,behavior:'instant'}));await page.screenshot({animations:'disabled',path:`.temp/parent-ui-review/operator-${width}-${name}.png`});}
 const measurement=page.locator('#measurement');await measurement.evaluate(e=>window.scrollTo({top:e.getBoundingClientRect().bottom+window.scrollY-window.innerHeight+100,behavior:'instant'}));await page.screenshot({animations:'disabled',path:`.temp/parent-ui-review/operator-${width}-corrections.png`});
 const overflow=await page.evaluate(()=>{window.scrollTo({left:999,top:window.scrollY,behavior:'instant'});const moved=window.scrollX;window.scrollTo({left:0,top:window.scrollY,behavior:'instant'});return Math.max(moved,document.documentElement.scrollWidth-document.documentElement.clientWidth);});
 expect(overflow,JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:e.className,x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})).filter(e=>e.right>document.documentElement.clientWidth+3&&e.width>0&&!['TABLE','THEAD','TR','TH','TD','TBODY'].includes(e.tag)).sort((a,b)=>b.right-a.right).slice(0,30)))).toBe(0);
});
