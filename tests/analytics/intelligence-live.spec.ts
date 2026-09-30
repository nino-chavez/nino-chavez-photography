import {test,expect} from '@playwright/test';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
const folder='docs/implementation/analytics-intelligence-20260930/evidence';
for(const size of [{name:'desktop',width:1280,height:900},{name:'mobile',width:390,height:844}]) test(`actual owner workflow and ${size.name} layout`,async({page})=>{
 const cookiePath='.temp/analytics-parent-local-cookies.json';test.skip(!existsSync(cookiePath),'identified local owner fixture required');
 const cookies=JSON.parse(readFileSync(cookiePath,'utf8'));await page.context().addCookies(cookies.map((c:any)=>({name:c.name,value:c.value,domain:'127.0.0.1',path:'/',secure:false,httpOnly:false,sameSite:'Lax' as const})));
 await page.setViewportSize({width:size.width,height:size.height});
 await page.goto('/photography/analytics/operator');
 await expect(page.getByRole('heading',{name:'Worth your attention',exact:true})).toBeVisible();
 await expect(page.getByText('Saved intelligence is unavailable right now.',{exact:false})).toHaveCount(0);
 await page.evaluate(()=>{const b=document.createElement('p');b.id='synthetic-review';b.textContent='Synthetic local rehearsal — every displayed count and album is a fixture. Do not quote these numbers.';b.style.cssText='padding:12px;background:#fff5cf;color:#232323;font:14px sans-serif;border-bottom:1px solid #ad8d30';document.body.prepend(b);window.scrollTo({top:0,behavior:'instant'})});
 mkdirSync(folder,{recursive:true});
 await page.screenshot({path:`${folder}/owner-${size.name}-first-viewport.png`});
 await page.getByText('Reporting settings',{exact:true}).click();
 await expect(page.getByRole('radio',{name:'90 days',exact:true})).toBeChecked();
 await page.getByRole('button',{name:'Record a change',exact:true}).click();
 await expect(page.getByLabel('Actual action time',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth)).toBe(false);
 mkdirSync(folder,{recursive:true});
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
 await page.screenshot({path:`${folder}/owner-${size.name}-overview.png`,fullPage:true});
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('link',{name:'Albums',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Compare albums',exact:true})).toBeVisible();
 await expect(page.getByText('Loading report...',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:/Alpha Invitational/}).first().click();
 await expect(page.getByRole('complementary').filter({has:page.getByRole('heading',{name:'Alpha Invitational'})})).toBeVisible();
 await page.evaluate(()=>{const b=document.createElement('p');b.textContent='Synthetic local rehearsal — every number here is invented; do not quote it.';b.style.cssText='padding:12px;background:#fff5cf;color:#232323;font:14px sans-serif';document.body.prepend(b);window.scrollTo({top:0,behavior:'instant'})});
 await page.screenshot({path:`${folder}/owner-${size.name}-albums.png`,fullPage:true});
 await page.getByRole('link',{name:'Photos',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Popular, rising, and recently active',exact:true})).toBeVisible();
 await expect(page.getByText('Loading report...',{exact:true})).toHaveCount(0);
 await page.locator('.photo-inspect').first().click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.screenshot({path:`${folder}/owner-${size.name}-photo-inspector.png`});
 await page.getByRole('button',{name:/Close photo/}).click();
 for(const [section, heading] of [['Sources','Tagged arrivals'],['Measurement','Collection and provider delivery']]) {
   await page.getByRole('link',{name:section,exact:true}).click();
   await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
   await expect(page.getByText('Loading report...',{exact:true})).toHaveCount(0);
   await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
   await page.screenshot({path:`${folder}/owner-${size.name}-${section.toLowerCase()}.png`});
 }

});
