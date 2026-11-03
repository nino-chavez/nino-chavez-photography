import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const out=dirname(fileURLToPath(import.meta.url)), origin='http://photo-accent.localhost:8841';
const routes={home:'/photography/',bright:'/photography/albums/club-vb-630-picture-day-10-27-2026-WvzFwu',dark:'/photography/albums/college-womens-vb-millikin-at-north-central-09-23-2026-DWdCET',monochrome:'/photography/explore?q=volleyball&division=girls'};
const records=[];const browser=await chromium.launch({headless:true});
async function ready(page){await page.waitForFunction(()=>[...document.querySelectorAll('img')].filter(i=>{const r=i.getBoundingClientRect();return r.width&&r.top<innerHeight&&r.bottom>0&&r.left<innerWidth&&r.right>0}).every(i=>i.complete&&i.naturalWidth>0),null,{timeout:15000});}
async function pair(page,name){
 const photoIds=()=>page.locator('img').evaluateAll(xs=>[...new Set(xs.map(x=>(x.getAttribute('src')||'').replace(/https:\/\/imagedelivery.net\/[^/]+\/([^/]+)\/.*/, '$1').replace(/^\/photography\/api\/hdr\/([^/?]+).*/, '$1')))]);
 const photos=await photoIds();
 // The wrapper behavior is tested separately. Toggling the same review attribute
 // here preserves the exact photograph, scroll and saved state in each pair.
 for(const composition of ['before','refined']){
  await page.evaluate(c=>document.documentElement.dataset.photographyComposition=c,composition);
  await ready(page);
  await page.screenshot({path:join(out,`${name}-${composition}.png`),animations:'disabled'});
  const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,viewport:innerWidth,searchColor:document.querySelector('.event-search button')?getComputedStyle(document.querySelector('.event-search button')).backgroundColor:null,photoTop:document.querySelector('.photo-card')?.getBoundingClientRect().top??null,visiblePhotos:[...document.querySelectorAll('img')].filter(i=>{const r=i.getBoundingClientRect();return r.width&&r.top<innerHeight&&r.bottom>0&&r.left<innerWidth&&r.right>0}).map(i=>({src:i.getAttribute('src'),alt:i.alt}))}));
  expect(state.overflow).toBe(false);records.push({name,composition,...state});
  expect(await photoIds()).toEqual(photos);
 }
 console.log(name);
}
try{for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:width===390?844:1000},reducedMotion:'reduce'});
 const page=await context.newPage();await page.addInitScript(()=>{Math.random=()=>0.13;});
 await page.route(/(?:posthog|analytics\/collect|cdn-cgi\/rum|googletagmanager)/,r=>r.abort());
 for(const [name,path] of Object.entries(routes)){
  await page.goto(origin+path+(path.includes('?')?'&':'?')+'study-accent=gold&study-composition=refined');await page.mouse.move(0,0);
  await expect(page.locator('html')).toHaveAttribute('data-photography-accent','gold');
  if(name==='home'){
   await page.getByRole('button',{name:'Next selected work',exact:true}).waitFor();
   for(let n=1;n<=3;n++){await pair(page,`home-${width}-image-${n}`);if(n<3){await page.getByRole('button',{name:'Next selected work',exact:true}).click();await expect(page.locator('.hero-position')).toContainText(`${n+1} /`);}}
   if(width===390){
    for(let n=0;n<12;n++){
     const mono=await page.locator('.hero-track.mobile img').evaluateAll(xs=>xs.some(i=>{const r=i.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&/black and white/.test(i.alt);}));
     if(mono){await pair(page,`home-${width}-monochrome`);break;}
     const pos=await page.locator('.hero-position').textContent();await page.getByRole('button',{name:'Next selected work',exact:true}).click();await expect(page.locator('.hero-position')).not.toHaveText(pos);
     if(n===11)throw new Error('No monochrome homepage image encountered');
    }
   }

  } else {
   await page.locator('.photo-card').first().waitFor();await pair(page,`${name}-${width}`);if(name==='monochrome'){await page.locator('.photo-card').first().hover();await pair(page,`${name}-${width}-badges`);}
   const card=page.locator('.photo-card').nth(name==='bright'?3:0);await card.click();
   const viewer=page.getByRole('dialog',{name:'Photo lightbox'});await expect(viewer).toBeVisible();await expect(viewer.locator('img').first()).toHaveCSS('opacity','1',{timeout:30000});
   await pair(page,`${name}-${width}-viewer`);
   await viewer.getByRole('button',{name:'Save photograph',exact:true}).click();
   await expect(viewer.getByRole('button',{name:'Saved · Remove',exact:true})).toHaveAttribute('aria-pressed','true');
   await viewer.getByRole('button',{name:'Saved · Remove',exact:true}).click();
   await viewer.getByRole('button',{name:'Undo',exact:true}).focus();await page.keyboard.press('Enter');
   await expect(viewer.getByRole('button',{name:'Saved · Remove',exact:true})).toHaveAttribute('aria-pressed','true');
   await viewer.getByRole('button',{name:'Close lightbox',exact:true}).click();await expect(card).toBeFocused();
   records.push({name:`${name}-${width}-interaction`,saveUndoReturn:true});
  }
 }
 await context.close();
}}finally{await writeFile(join(out,'encounters.json'),JSON.stringify(records,null,2)+'\n');await browser.close();}
