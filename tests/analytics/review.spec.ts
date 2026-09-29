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
	await expect(page.getByRole('heading',{name:'Albums getting attention'})).toBeVisible();
	await expect(page.getByRole('heading',{name:'Photos drawing attention'})).toBeVisible();
 await expect(page.locator('#report-filters select[name="measure"]')).toBeEnabled();
 await expect(page.getByRole('link',{name:'View gallery'})).toBeVisible();
 await expect(page.getByRole('navigation',{name:'Photography navigation'})).toHaveCount(0);
 await page.evaluate(()=>{const b=document.createElement('div');b.textContent='Mock — synthetic data. Images are representative gallery photographs.';b.style.cssText='position:fixed;bottom:0;left:0;right:0;background:#ffe082;color:#111;padding:6px;z-index:99999;text-align:center;font-size:12px';document.body.append(b);});
 if(width===390){const box=await page.locator('.answer-primary strong').boundingBox();expect(box!.y+box!.height).toBeLessThan(760);}
	if(width===1440){
		const controls=await Promise.all(['.album-picker > summary','.report-field select[name="period"]','.report-field select[name="measure"]'].map(selector=>page.locator(selector).boundingBox()));
		expect(controls.every(Boolean)).toBe(true);
		expect(Math.max(...controls.map(box=>box!.y))-Math.min(...controls.map(box=>box!.y))).toBeLessThan(3);
	}
 if(width===390){await page.getByRole('button',{name:'Filters',exact:true}).click();await expect(page.getByRole('combobox',{name:'Measure',exact:true})).toBeVisible();await page.getByRole('button',{name:'Hide filters'}).click();}
 await page.screenshot({animations:'disabled',path:`.temp/parent-ui-review/operator-${width}-top.png`});
 const nav=page.getByRole('navigation',{name:'Analytics sections'});
 await nav.getByRole('button',{name:'Albums'}).click();
 await expect(page.getByRole('heading',{name:'Compare albums'})).toBeVisible();
 await expect(page.locator('#overview')).toHaveCount(0);
 await page.screenshot({animations:'disabled',path:`.temp/parent-ui-review/operator-${width}-albums.png`});
 if(width===390){const table=page.getByRole('region',{name:'Album comparison table',exact:true});const before=await table.locator('tbody td').first().boundingBox();await table.evaluate(e=>e.scrollLeft=9999);expect(await table.evaluate(e=>e.scrollLeft)).toBeGreaterThan(0);const after=await table.locator('tbody td').first().boundingBox();expect(Math.abs(before!.x-after!.x)).toBeLessThan(2);}
 await nav.getByRole('button',{name:'Photos'}).click();
 await expect(page.getByRole('heading',{name:'Popular, rising, and recently active'})).toBeVisible();
 await expect.poll(()=>page.locator('.photo-card').count()).toBeGreaterThan(0);
 expect(await page.locator('.photo-card').count()).toBeLessThanOrEqual(12);
 await page.screenshot({animations:'disabled',path:`.temp/parent-ui-review/operator-${width}-photos.png`});
 for(const label of ['Rising','Recently active']){await page.getByRole('button',{name:label,exact:true}).click();await expect(page.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');}
 await page.getByRole('button',{name:'Table',exact:true}).click();await page.screenshot({animations:'disabled',path:`.temp/parent-ui-review/operator-${width}-photo-table.png`});
 await page.getByRole('button',{name:'Images',exact:true}).click();await page.locator('.photo-inspect').first().click();await expect(page.getByRole('dialog')).toBeInViewport();await page.screenshot({animations:'disabled',path:`.temp/parent-ui-review/operator-${width}-inspection.png`});await page.getByRole('button',{name:'Return to photos',exact:true}).click();
 await nav.getByRole('button',{name:'Sources'}).click();await expect(page.getByRole('heading',{name:'What happened after a tagged arrival'})).toBeVisible();await page.screenshot({animations:'disabled',path:`.temp/parent-ui-review/operator-${width}-sources.png`});
 await nav.getByRole('button',{name:'Measurement'}).click();await expect(page.getByRole('heading',{name:'Collection and provider delivery'})).toBeVisible();await page.screenshot({animations:'disabled',path:`.temp/parent-ui-review/operator-${width}-measurement.png`});
 const overflow=await page.evaluate(()=>{window.scrollTo({left:999,top:window.scrollY,behavior:'instant'});const moved=window.scrollX;window.scrollTo({left:0,top:window.scrollY,behavior:'instant'});return Math.max(moved,document.documentElement.scrollWidth-document.documentElement.clientWidth);});
 expect(overflow).toBe(0);
});
