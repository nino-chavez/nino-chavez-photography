import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const HOME = '/photography/';
const evidence = '.temp/ship/screens';
test.setTimeout(90_000);

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
 test.describe(`Photography home at ${viewport.width}px`, () => {
  test.use({ viewport });
  test('arrival, event discovery, selected work and return', async ({ page }) => {
   const errors: string[] = []; page.on('pageerror', e => errors.push(e.stack ?? e.message));
   await page.goto(HOME);
   await expect(page.getByRole('button', { name:'Pause Selected Works' })).toBeVisible();
   await expect(page.getByRole('heading', { name:'Find your event.',exact:true })).toBeVisible();
   await expect(page.locator('.hero-position')).toHaveText(`1 / ${viewport.width > 700 ? 6 : 12}`);
   const search = page.getByRole('searchbox', { name:'Event, team or date' });
   const bounds = await search.boundingBox(); expect(bounds!.y+bounds!.height).toBeLessThan(viewport.height);
   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
   await page.locator('.hero-track:visible img').first().evaluate((img: HTMLImageElement) => img.decode());
   await mkdir(evidence,{recursive:true}); await page.screenshot({path:`${evidence}/home-${viewport.width}.png`});
   const order = await page.locator('.hero-track:visible img').evaluateAll(imgs=>imgs.map(img=>img.getAttribute('src')));
   await page.getByRole('button',{name:'Pause Selected Works'}).click();
   await search.fill('Chicago Point Series'); await page.getByRole('button',{name:'Search',exact:true}).click();
   await expect(page).toHaveURL(/\/albums\?q=Chicago\+Point\+Series/);
   await expect(page.getByRole('heading',{name:'Browse Galleries',exact:true})).toBeVisible();
   await expect(page.locator('.events-page')).toHaveCSS('opacity','1'); await page.locator('.events-grid img').first().evaluate((img:HTMLImageElement)=>img.decode());
   await page.screenshot({path:`${evidence}/galleries-${viewport.width}.png`});
   await page.getByRole('link',{name:'Nino Chavez Photography home'}).click();
   await expect(page.getByRole('button',{name:'Play Selected Works'})).toBeVisible();
   expect(await page.locator('.hero-track:visible img').evaluateAll(imgs=>imgs.map(img=>img.getAttribute('src')))).toEqual(order);
   await page.locator('.hero-work-controls').getByRole('link',{name:'Selected Works',exact:true}).click();
   await expect(page.getByRole('heading',{name:'Selected Works',exact:true})).toBeVisible();
   await expect(page.locator('.photograph')).toHaveCount(14);
   const first = page.locator('.photograph').first(); await first.click();
   const viewer = page.locator('.portfolio-viewer'); await expect(viewer).toBeVisible();
   await page.keyboard.press('ArrowRight'); await expect(viewer.locator('[aria-live]')).toHaveText('2 / 14');
   await page.screenshot({path:`${evidence}/selected-work-${viewport.width}.png`});
   await page.keyboard.press('Escape'); await expect(first).toBeFocused();
   await page.getByRole('button',{name:'About & contact'}).click(); await expect(page.locator('.info-dialog')).toBeVisible();
   await page.keyboard.press('Escape'); await expect(page.getByRole('button',{name:'About & contact'})).toBeFocused();
   await expect(page.getByRole('link',{name:'Nino Chavez profile'})).toHaveAttribute('target','_blank');
   expect(errors).toEqual([]);
  });
 });
}

for (const viewport of [{width:1280,height:900},{width:390,height:844}]) {
 test.describe(`Automatic Selected Works ${viewport.width}`,()=>{
  test.use({viewport});
  test('advances, pauses, resumes, and restarts from a settled swipe',async({page})=>{
   await page.clock.install(); await page.goto(HOME);
   await expect(page.getByRole('button',{name:'Pause Selected Works'})).toBeVisible();
   const track=page.locator('.hero-track:visible'); const counter=page.locator('.hero-position');
   await track.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(async img=>{(img as HTMLImageElement).loading='eager';await (img as HTMLImageElement).decode();})));
   await page.clock.runFor(8100); await expect(counter).toHaveText(/^2 \/ /);
   await page.clock.runFor(1300); await expect(page.locator('.hero-outgoing')).toHaveCount(0);
   await page.getByRole('button',{name:'Pause Selected Works'}).click(); await page.clock.runFor(9000); await expect(counter).toHaveText(/^2 \/ /);
   await page.getByRole('button',{name:'Play Selected Works'}).click(); await page.clock.runFor(8100); await expect(counter).toHaveText(/^3 \/ /);
   await track.dispatchEvent('pointerdown'); await track.dispatchEvent('pointercancel');
   await track.evaluate(el=>el.scrollTo({left:el.clientWidth*4,behavior:'instant'})); await page.clock.runFor(100);
   await expect(counter).toHaveText(/^5 \/ /); await page.clock.runFor(8100); await expect(counter).toHaveText(/^6 \/ /);
   await page.getByRole('searchbox',{name:'Event, team or date'}).focus(); await page.clock.runFor(9000); await expect(counter).toHaveText(/^6 \/ /);
   await page.emulateMedia({reducedMotion:'reduce'}); await expect(page.getByRole('button',{name:'Play Selected Works'})).toBeVisible();
  });
 });
}

test('reduced motion starts paused; manual browsing and explicit playback remain available',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'}); await page.clock.install(); await page.goto(HOME);
 await expect(page.getByRole('button',{name:'Play Selected Works'})).toBeVisible();
 await page.clock.runFor(9000); await expect(page.locator('.hero-position')).toHaveText(/^1 \/ /);
 await expect(page.getByRole('button',{name:'Next selected work'})).toBeEnabled(); await page.getByRole('button',{name:'Next selected work'}).click(); await expect(page.locator('.hero-position')).toHaveText(/^2 \/ /);
 await page.getByRole('button',{name:'Play Selected Works'}).click(); await page.clock.runFor(8100);
 await expect(page.locator('.hero-position')).toHaveText(/^3 \/ /); await expect(page.locator('.hero-outgoing')).toHaveCount(0);
});

test('event search and spotlight links work without JavaScript',async({browser,baseURL})=>{
 const context=await browser.newContext({javaScriptEnabled:false,baseURL}); const page=await context.newPage();
 await page.goto(HOME); await expect(page.locator('.hero-track:visible img').first()).toBeVisible();
 await page.getByRole('searchbox',{name:'Event, team or date'}).fill('Chicago Point Series'); await page.getByRole('button',{name:'Search',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Browse Galleries',exact:true})).toBeVisible(); await context.close();
});

for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
 test.describe(`Archive journeys ${viewport.width}`,()=>{
  test.use({viewport});
  test('timeline year and month jumps, gallery entry and photo return',async({page})=>{
   const errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message));
   await page.goto('/photography/timeline');
   await expect(page.getByRole('heading',{name:'Browse Timeline',exact:true})).toBeVisible();
   await expect(page.locator('.timeline-years button')).toHaveCount(5); await expect(page.getByRole('button',{name:'Jump to 2025',exact:true})).toBeEnabled();
   await page.getByRole('button',{name:'Jump to 2025',exact:true}).click();
   await expect(page.getByRole('button',{name:'Jump to 2025',exact:true})).toHaveAttribute('aria-current','date');
   await page.getByRole('button',{name:'Jump to October 2025',exact:true}).click();
   await expect(page.getByRole('button',{name:'Jump to October 2025',exact:true})).toHaveAttribute('aria-current','date');
   await expect.poll(async()=>{
    const month=await page.locator('#month-2025-10').boundingBox();
    const rail=await page.locator('[data-timeline-nav]').boundingBox();
    return Math.abs(month!.y-(rail!.y+rail!.height+20));
   }).toBeLessThan(3);
   await page.locator('#month-2025-10 img').evaluateAll(imgs=>Promise.all(imgs.map(async img=>{(img as HTMLImageElement).loading='eager';await (img as HTMLImageElement).decode();})));
   await page.screenshot({path:`${evidence}/timeline-${viewport.width}.png`});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.getByRole('link',{name:'Browse Galleries',exact:true}).click();
   await page.getByRole('searchbox',{name:'Search albums by team or event name'}).fill('630 Picture Day');
   await page.getByRole('button',{name:'Search',exact:true}).click();
   await page.locator('.album-card').first().click();
   await expect(page.locator('.album-opening h1')).toContainText('630 Picture Day');
   await expect(page.locator('.album-photo-grid .photo-card')).toHaveCount(36);
   await page.locator('.album-photo-grid img').first().evaluate((img:HTMLImageElement)=>img.decode());
   await page.screenshot({path:`${evidence}/gallery-${viewport.width}.png`});
   const photo=page.locator('.album-photo-grid .photo-card').first();
   await photo.click(); await expect(page.getByRole('dialog')).toBeVisible();
   const image=page.getByRole('dialog').locator('img');
   await expect.poll(()=>image.evaluate((img:HTMLImageElement)=>img.complete && img.naturalWidth>0)).toBe(true);
   await expect(image).toHaveCSS('opacity','1');
   await expect(page.getByRole('dialog')).toHaveCSS('opacity','1');
   await page.screenshot({path:`${evidence}/photo-${viewport.width}.png`});
   await page.keyboard.press('Escape'); await expect(photo).toBeFocused();
   expect(errors).toEqual([]);
  });
 });
}

test('archive empty state explains recovery',async({page})=>{
 await page.goto('/photography/albums?q=zzzxxyy-no-such-event');
 await expect(page.locator('.events-grid .album-card')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Clear filters'}).first()).toBeVisible();
 await expect(page.locator('.events-page')).toHaveCSS('opacity','1');
 await page.screenshot({path:`${evidence}/empty-search.png`});
 await page.getByRole('button',{name:'Clear filters'}).first().click();
 await expect(page.locator('.album-card').first()).toBeVisible();
});

for(const viewport of [{width:1440,height:900},{width:390,height:844}]) {
 test(`record normal-speed native slideshow at ${viewport.width}`,async({browser,baseURL})=>{
  test.skip(process.env.PHOTOGRAPHY_MOTION!=='1','Opt in to normal-speed recording');
  const context=await browser.newContext({baseURL,viewport,recordVideo:{dir:'.temp/ship/motion',size:viewport}});
  const page=await context.newPage(); await page.goto(HOME);
  await expect(page.getByRole('button',{name:'Pause Selected Works'})).toBeEnabled();
  await expect(page.locator('.hero-position')).toHaveText(/^2 \/ /,{timeout:14_000});
  await page.waitForTimeout(1500);
  await page.getByRole('button',{name:'Pause Selected Works'}).click();
  const held=await page.locator('.hero-position').textContent(); await page.waitForTimeout(8500);
  await expect(page.locator('.hero-position')).toHaveText(held!);
  await page.getByRole('button',{name:'Play Selected Works'}).click();
  await expect(page.locator('.hero-position')).toHaveText(/^3 \/ /,{timeout:14_000}); await page.waitForTimeout(1500);
  await page.close(); await page.video()!.saveAs(`.temp/ship/motion/native-${viewport.width}.webm`); await context.close();
 });
}


test('short landscape keeps the photo controls and event search apart',async({page})=>{
 await page.setViewportSize({width:612,height:344}); await page.goto(HOME);
 const controls=await page.locator('.hero-work-controls').boundingBox();
 const title=await page.getByRole('heading',{name:'Find your event.',exact:true}).boundingBox();
 expect(title!.y).toBeGreaterThan(controls!.y+controls!.height+20);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 await page.locator('.hero-track:visible img').first().evaluate((img:HTMLImageElement)=>img.decode());
 await page.screenshot({path:`${evidence}/home-landscape.png`});
});
