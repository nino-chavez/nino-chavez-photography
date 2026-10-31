import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

test.skip(process.env.PHOTOGRAPHY_ARRIVAL !== '1', 'Opt in against the static arrival study.');
test.setTimeout(90_000);
const base = '/arrival/';
const captures = path.resolve(process.env.ARRIVAL_CAPTURES || '.temp/photography-arrival/captures');
const downloads = path.resolve('.temp/photography-arrival/downloads');
mkdirSync(captures,{recursive:true}); mkdirSync(downloads,{recursive:true});

// Keep visual captures repeatable; the dedicated rotation check uses another seed.
test.beforeEach(async({page})=>{await page.addInitScript(()=>{Math.random=()=>0.13;});});

test('Selected Works automatically advances, pauses, and resumes without moving event actions',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.clock.install();
  await page.goto(`${base}?page=home`);
  await expect(page.locator('.hero-position')).toHaveText('1 / 6');
  const finder=await page.locator('.hero-finder').boundingBox();
  await page.clock.runFor(8100);
  await expect(page.locator('.hero-position')).toHaveText('2 / 6');
  expect(await page.locator('.hero-finder').boundingBox()).toEqual(finder);
  await page.getByRole('button',{name:'Pause Selected Works',exact:true}).click();
  await page.clock.runFor(17000);
  await expect(page.locator('.hero-position')).toHaveText('2 / 6');
  await page.getByRole('button',{name:'Play Selected Works',exact:true}).click();
  await page.clock.runFor(8100);
  await expect(page.locator('.hero-position')).toHaveText('3 / 6');
  await page.getByLabel('Event, team or date',{exact:true}).fill('Chicago');
  await page.clock.runFor(17000);
  await expect(page.locator('.hero-position')).toHaveText('3 / 6');
  await page.getByRole('button',{name:'Next selected work',exact:true}).click();
  await expect(page.locator('.hero-position')).toHaveText('4 / 6');
  await page.clock.runFor(4000);
  await expect(page.locator('.hero-position')).toHaveText('4 / 6');
  await page.clock.runFor(4100);
  await expect(page.locator('.hero-position')).toHaveText('5 / 6');
  await page.clock.runFor(8100);
  await expect(page.locator('.hero-position')).toHaveText('6 / 6');
  await page.clock.runFor(8100);
  await expect(page.locator('.hero-position')).toHaveText('1 / 6');
  await page.getByRole('button',{name:'Pause Selected Works',exact:true}).click();
  await page.getByRole('navigation',{name:'Photography',exact:true}).getByRole('link',{name:'Browse Galleries',exact:true}).click();
  await page.getByRole('link',{name:'Nino Chavez Photography',exact:true}).click();
  await page.clock.runFor(17000);
  await expect(page.locator('.hero-position')).toHaveText('1 / 6');
  await expect(page.getByRole('button',{name:'Play Selected Works',exact:true})).toBeVisible();
});

test('Selected Works stays still for reduced motion and while offscreen',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.clock.install();
  await page.goto(`${base}?page=home`);
  await page.clock.runFor(17000);
  await expect(page.locator('.hero-position')).toHaveText('1 / 12');
  await expect(page.locator('.hero-outgoing')).toHaveCount(0);
  await page.getByRole('button',{name:'Next selected work',exact:true}).click();
  await expect(page.locator('.hero-position')).toHaveText('2 / 12');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.getByRole('button',{name:'Play Selected Works',exact:true}).click();
  await page.locator('footer').scrollIntoViewIfNeeded();
  await waitForHeroIntersection(page,false);
  await page.clock.runFor(17000);
  await expect(page.locator('.hero-position')).toHaveText('2 / 12');
  await page.getByRole('button',{name:'Pause Selected Works',exact:true}).scrollIntoViewIfNeeded();
  await waitForHeroIntersection(page,true);
  await page.clock.runFor(8100);
  await expect(page.locator('.hero-position')).toHaveText('3 / 12');
});

async function waitForHeroIntersection(page:import('@playwright/test').Page,visible:boolean){
  await page.evaluate(visible=>new Promise<void>(resolve=>{
    const observer=new IntersectionObserver(([entry])=>{
      if(entry.isIntersecting===visible){observer.disconnect();resolve();}
    });
    observer.observe(document.querySelector('.home-hero')!);
  }),visible);
}

async function capture(page:import('@playwright/test').Page,name:string){
  await page.waitForFunction(()=>[...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&r.width>0;}).every(i=>i.complete&&i.naturalWidth>0));
  await page.evaluate(async()=>{await Promise.all([...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&r.width>0;}).map(i=>i.decode()));await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:path.join(captures,`${name}.png`)});
}

for(const viewport of [{name:'desktop',width:1440,height:1000},{name:'phone',width:390,height:844}]){
  test(`${viewport.name}: homepage through complete gallery, photo and selection`,async({page})=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setViewportSize(viewport);await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
    await page.goto(`${base}?page=home`);
    await capture(page,`home-${viewport.name}`);
    await expect(page.locator('.hero-track:visible img').first()).toBeVisible();
    expect((await page.locator('.home-hero').boundingBox())!.width).toEqual(viewport.width);
    await page.getByRole('button',{name:'About & contact',exact:true}).click();
    await expect(page.locator('#action')).toContainText('nino@ninochavez.co');
    await capture(page,`info-${viewport.name}`);
    await expect(page.getByRole('link',{name:'About Nino ↗',exact:true})).toHaveAttribute('target','_blank');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button',{name:'About & contact',exact:true})).toBeFocused();
    await page.getByLabel('Event, team or date',{exact:true}).fill('Chicago Point');
    await page.getByRole('button',{name:'Search',exact:true}).click();
    await expect(page.locator('.event-card')).toHaveCount(1);
    await page.locator('#event-1').click();
    await expect(page.locator('.photo-open')).toHaveCount(49);
    await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>('.fitted-grid .photo-open img')].slice(0,8).every(image=>image.complete&&image.naturalWidth>0));
    const dimensions=await page.locator('.fitted-grid .photo-open img').evaluateAll(images=>images.slice(0,8).map(image=>{const el=image as HTMLImageElement;return {display:el.clientWidth/el.clientHeight,source:el.naturalWidth/el.naturalHeight};}));
    for(const size of dimensions)expect(Math.abs(size.display-size.source)).toBeLessThan(.03);
    await page.locator('#photo-aBZN7D-DSC00124').click();
    await expect(page.locator('#viewer')).toContainText('Photo 1 of 49');
    await page.locator('#viewer').getByRole('button',{name:'Save DSC00124',exact:true}).click();
    await expect(page.locator('#viewer').getByRole('button',{name:'Remove saved DSC00124',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#viewer')).toContainText('Photo 2 of 49');
    await page.locator('#viewer').getByRole('button',{name:'Save DSC00125',exact:true}).click();
    await page.getByRole('button',{name:'Share',exact:true}).click();
    await expect(page.locator('#copy-link')).toHaveValue('https://ninochavez.co/photography/photo/DSC00125?a=aBZN7D');
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#viewer')).not.toBeVisible();
    await expect(page.locator('#photo-aBZN7D-DSC00124')).toBeFocused();
    await page.getByRole('link',{name:'← Back to galleries',exact:true}).click();
    await expect(page.getByLabel('Event, team or date',{exact:true})).toHaveValue('Chicago Point');
    await expect(page.locator('#event-1')).toBeFocused();
    await page.getByRole('navigation',{name:'Photography',exact:true}).getByRole('link',{name:'Saved 2',exact:true}).click();
    await page.reload();await expect(page.locator('.photo-open')).toHaveCount(2);
    await capture(page,`saved-${viewport.name}`);
    await page.getByRole('button',{name:'Remove saved DSC00125',exact:true}).click();
    await expect(page.locator('.photo-open')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test(`${viewport.name}: restored gallery browsing, timeline and Selected Works`,async({page})=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto(`${base}?page=home`);
    const navigation=page.getByRole('navigation',{name:'Photography',exact:true});
    for(const name of ['Browse Galleries','Browse Timeline'])await expect(navigation.getByRole('link',{name,exact:true})).toBeInViewport();
    const finderBefore=await page.locator('.hero-finder').boundingBox();
    const firstSource=await page.locator('.hero-track:visible img').first().getAttribute('src');
    await page.getByRole('button',{name:'Next selected work',exact:true}).click();
    await expect(page.locator('.hero-position')).toContainText('2 /');
    expect(await page.locator('.hero-finder').boundingBox()).toEqual(finderBefore);
    await capture(page,`hero-next-${viewport.name}`);
    await navigation.getByRole('link',{name:'Browse Galleries',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Browse Galleries',exact:true})).toBeVisible();
    await expect(page.locator('.event-card')).toHaveCount(8);
    await page.locator('#event-0').click();
    await page.getByRole('link',{name:'← Back to galleries',exact:true}).click();
    await expect(page.locator('#event-0')).toBeFocused();
    await capture(page,`browse-galleries-${viewport.name}`);
    await navigation.getByRole('link',{name:'Browse Timeline',exact:true}).click();
    await expect(page.locator('.timeline-month')).toHaveCount(49);
    await capture(page,`timeline-${viewport.name}`);
    const bar=page.getByRole('navigation',{name:'Browse by date',exact:true});
    await bar.getByRole('link',{name:'2024',exact:true}).click();
    await expect(page.locator('#heading-2024-12')).toBeFocused();
    await bar.getByRole('link',{name:'June 2024',exact:true}).click();
    await expect(page.locator('#heading-2024-06')).toBeFocused();
    await expect(bar.getByRole('link',{name:'June 2024',exact:true})).toHaveAttribute('aria-current','date');
    expect((await page.locator('#heading-2024-06').boundingBox())!.y).toBeGreaterThanOrEqual((await bar.boundingBox())!.height);
    await capture(page,`timeline-jump-${viewport.name}`);
    const photo=page.locator('#month-2024-06 [data-timeline-photo]').first();
    await photo.click();
    await expect(page.locator('#feature-viewer')).toBeVisible();
    await expect(page.locator('#feature-viewer').getByRole('link',{name:'Open photo page ↗'})).toHaveAttribute('target','_blank');
    await page.keyboard.press('Escape');
    await expect(photo).toBeFocused();
    await page.goBack();
    await expect(page).toHaveURL(/#month-2024-12$/);
    await expect(bar.getByRole('link',{name:'December 2024',exact:true})).toHaveAttribute('aria-current','date');
    await page.locator('#month-2023-10').evaluate(el=>el.scrollIntoView({block:'start'}));
    await expect(bar.getByRole('link',{name:'2023',exact:true})).toHaveAttribute('aria-current','true');
    await page.getByRole('link',{name:'Nino Chavez Photography',exact:true}).click();
    await expect(page.locator('.hero-position')).toContainText('2 /');
    expect(await page.locator('.hero-track:visible img').first().getAttribute('src')).toBe(firstSource);
    await page.locator('.hero-work-controls').getByRole('link',{name:'Selected Works',exact:true}).click();
    await expect(page.locator('.work-photo')).toHaveCount(14);
    await expect(page.getByRole('link',{name:'Nino Chavez Photography',exact:true})).toBeInViewport({ratio:1});
    await expect(page.getByRole('button',{name:'About & contact',exact:true})).toBeInViewport({ratio:1});
    await capture(page,`selected-works-entry-${viewport.name}`);
    await page.getByRole('button',{name:'Next photograph →',exact:true}).click();
    expect(await page.locator('.work-strip').evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
    await capture(page,`selected-works-${viewport.name}`);
    const work=page.locator('.work-photo').nth(1);
    await work.click();await expect(page.locator('#feature-viewer')).toBeVisible();
    await page.keyboard.press('ArrowRight');await expect(page.locator('#feature-viewer .viewer-context')).toHaveText('3 / 14');
    await capture(page,`selected-work-viewer-${viewport.name}`);
    await page.keyboard.press('Escape');await expect(work).toBeFocused();
    expect(errors).toEqual([]);
  });

  for(const model of ['sheet','beside','sequence']){
    test(`${model} ${viewport.name}: direct gallery and direct photo arrival`,async({page})=>{
      await page.setViewportSize(viewport);await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
      await page.goto(`${base}?gallery=aBZN7D&model=${model}`);
      await capture(page,`${model}-gallery-${viewport.name}`);
      await page.goto(`${base}?gallery=aBZN7D&model=${model}&photo=DSC00189`);
      await expect(page.locator('#viewer')).toContainText('Photo 35 of 49');
      await expect(page.locator('#viewer')).toContainText('THE Chicago Point Series 18s & 17s #1');
      await capture(page,`${model}-photo-${viewport.name}`);
      await page.locator('#viewer').getByRole('button',{name:'Download',exact:true}).click();
      await expect(page.locator('#action')).toContainText('1600px');
      await expect(page.locator('#action')).toContainText('personal use and recruiting');
      await page.getByRole('button',{name:'Close',exact:true}).click();
      await page.keyboard.press('Escape');
      await expect(page.locator('#viewer')).not.toBeVisible();
      if(model==='sheet')await expect(page.locator('#photo-aBZN7D-DSC00189')).toBeFocused();
      await page.goto(`${base}?gallery=WvzFwu`);
      await expect(page.locator('.photo-open')).toHaveCount(36);
    });
  }
}

test('actual JPEG and selected ZIP reach the browser with the expected files',async({page})=>{
  await page.goto(`${base}?gallery=aBZN7D&photo=DSC00124`);
  await page.locator('#viewer').getByRole('button',{name:'Download',exact:true}).click();
  const single=page.waitForEvent('download');
  await page.getByRole('button',{name:/For sharing/}).click();
  const jpg=await single;await jpg.saveAs(path.join(downloads,'single.jpg'));
  expect(readFileSync(path.join(downloads,'single.jpg')).subarray(0,3).toString('hex')).toBe('ffd8ff');
  await expect(page.locator('.download-status')).toContainText('Photo ready');
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.locator('#viewer').getByRole('button',{name:'Save DSC00124',exact:true}).click();
  await page.keyboard.press('ArrowRight');
  await page.locator('#viewer').getByRole('button',{name:'Save DSC00125',exact:true}).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Download saved (2)',exact:true}).click();
  const archive=page.waitForEvent('download');
  await page.getByRole('button',{name:/For sharing/}).click();
  const zip=await archive;await zip.saveAs(path.join(downloads,'selection.zip'));
  const bytes=readFileSync(path.join(downloads,'selection.zip'));
  expect(bytes.subarray(0,4).toString('hex')).toBe('504b0304');
  expect(bytes.includes(Buffer.from('aBZN7D-DSC00124.jpg'))).toBe(true);
  expect(bytes.includes(Buffer.from('aBZN7D-DSC00125.jpg'))).toBe(true);
  await expect(page.locator('.download-status')).toContainText('ZIP ready');
});

test('narrow screen, search recovery, unavailable storage and download failure',async({page})=>{
  await page.setViewportSize({width:320,height:568});
  await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('storage unavailable');}}));
  await page.goto(`${base}?gallery=aBZN7D`);
  await page.getByText('Search photos',{exact:true}).click();
  await page.getByLabel('Photo number or description',{exact:true}).fill('<img src=x data-injection="yes">');
  await page.getByRole('button',{name:'Find',exact:true}).click();
  await expect(page.getByRole('heading',{name:'No matching photos',exact:true})).toBeVisible();
  await expect(page.locator('[data-injection]')).toHaveCount(0);
  await page.getByRole('link',{name:'View all 49 photos',exact:true}).click();
  await page.locator('#photo-aBZN7D-DSC00124').click();
  await page.locator('#viewer').getByRole('button',{name:'Save DSC00124',exact:true}).click();
  await expect(page.locator('#notice')).toContainText('Browser storage is unavailable');
  await page.route('https://ninochavez.co/photography/api/download?**',r=>r.fulfill({status:503,body:'Unavailable'}));
  await page.locator('#viewer').getByRole('button',{name:'Download',exact:true}).click();
  await page.getByRole('button',{name:/For sharing/}).click();
  await expect(page.locator('.download-status')).toContainText('Could not prepare the download');
  await expect(page.getByRole('button',{name:/For sharing/})).toBeEnabled();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.keyboard.press('Escape');
  await page.getByRole('navigation',{name:'Photography',exact:true}).getByRole('link',{name:'Saved 1',exact:true}).click();
  await expect(page.locator('.photo-open')).toHaveCount(1);
  await expect(page.getByText('Browser storage is unavailable.',{exact:false})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>{const d=document.createElement('div');d.id='negative-control';d.style.width='2000px';d.style.height='30px';document.body.append(d);});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(false);
  await page.evaluate(()=>document.querySelector('#negative-control')?.remove());
  for(const name of ['Profile ↗','Writing ↗'])await expect(page.getByRole('link',{name,exact:true})).toHaveAttribute('target','_blank');
});


test('short phone: hero actions fit, recent events are reachable, and empty search recovers',async({page})=>{
  await page.setViewportSize({width:320,height:568});
  await page.goto(`${base}?page=home`);
  await capture(page,'home-short-phone');
  const search=await page.getByRole('button',{name:'Search',exact:true}).boundingBox();
  expect(search!.y+search!.height).toBeLessThanOrEqual(568);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('link',{name:'Browse recent galleries',exact:true}).click();
  await expect(page.locator('#recent-title')).toBeInViewport();
  await capture(page,'recent-phone');
  await page.getByLabel('Event, team or date',{exact:true}).fill('event that does not exist');
  await page.getByRole('button',{name:'Search',exact:true}).click();
  await expect(page.getByRole('heading',{name:'No matching galleries in this preview'})).toBeVisible();
  await capture(page,'home-no-results-phone');
  await page.getByRole('link',{name:'Clear search',exact:true}).click();
  await expect(page.locator('.hero-track:visible img').first()).toBeVisible();
});


test('latest-event shortcut returns to the same overlay link',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(`${base}?page=home`);
  await page.locator('#event-latest-1').click();
  await expect(page.locator('.photo-open')).toHaveCount(49);
  await page.getByRole('link',{name:'← Back to galleries',exact:true}).click();
  await expect(page.locator('#event-latest-1')).toBeFocused();
  await expect(page.locator('#event-latest-1')).toBeInViewport();
});


test('spotlight start changes between visits, with complete source pool retained',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(`${base}?page=home`);
  const first=await page.locator('.hero-track.desktop img').first().getAttribute('src');
  await expect(page.locator('.hero-track.desktop img')).toHaveCount(14);
  const track=page.locator('.hero-track.desktop');
  await track.hover({position:{x:350,y:300}});
  await page.mouse.wheel(1100,0);
  await expect.poll(()=>track.evaluate(el=>el.scrollLeft)).toBeGreaterThan(1000);
  await expect(page.locator('.hero-position')).toContainText('2 /');
  await page.addInitScript(()=>{Math.random=()=>0.82;});
  await page.reload();
  expect(await page.locator('.hero-track.desktop img').first().getAttribute('src')).not.toBe(first);
  await expect(page.locator('.hero-track.mobile img')).toHaveCount(12);
});

test('Selected Works keeps the current image on load failure and suspends in a hidden tab',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.clock.install();
  await page.route('**/triptych/t-16.webp',route=>route.abort());
  await page.goto(`${base}?page=home`);
  await page.clock.runFor(17000);
  await expect(page.locator('.hero-position')).toHaveText('1 / 6');
  await expect(page.locator('.hero-outgoing')).toHaveCount(0);
  await page.unroute('**/triptych/t-16.webp');
  await page.reload();
  // Exercise the visibility event without relying on headless window activation.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.clock.runFor(17000);
  await expect(page.locator('.hero-position')).toHaveText('1 / 6');
  await page.evaluate(()=>{delete (document as unknown as {hidden?:boolean}).hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await page.clock.runFor(8100);
  await expect(page.locator('.hero-position')).toHaveText('2 / 6');
});

for(const viewport of [{name:'desktop',width:1440,height:1000},{name:'phone',width:390,height:844}]){
  test.describe(`Selected Works motion recording ${viewport.name}`,()=>{
    test('automatic progression and interruption at normal speed',async({browser})=>{
      test.skip(process.env.PHOTOGRAPHY_MOTION!=='1','Opt in to normal-speed motion evidence.');
      const context=await browser.newContext({baseURL:process.env.PLAYWRIGHT_BASE_URL,viewport,recordVideo:{dir:captures,size:{width:viewport.width,height:viewport.height}}});
      const page=await context.newPage();
      await page.addInitScript(()=>{Math.random=()=>0.13;});
      const video=page.video()!;
      try {
      await page.emulateMedia({reducedMotion:'no-preference'});
      await page.goto(`${base}?page=home`);
      const total=viewport.name==='desktop'?6:12;
      const finder=await page.locator('.hero-finder').boundingBox();
      await capture(page,`autoplay-start-${viewport.name}`);
      await expect(page.locator('.hero-position')).toHaveText(`2 / ${total}`,{timeout:12000});
      await expect(page.locator('.hero-outgoing')).toHaveCount(0,{timeout:3000});
      await page.getByRole('button',{name:'Pause Selected Works',exact:true}).click();
      await capture(page,`autoplay-paused-${viewport.name}`);
      await page.waitForTimeout(1200);
      await page.getByRole('button',{name:'Play Selected Works',exact:true}).click();
      await expect(page.locator('.hero-position')).toHaveText(`3 / ${total}`,{timeout:12000});
      await page.waitForTimeout(350);
      await capture(page,`autoplay-fade-${viewport.name}`);
      await page.getByRole('button',{name:'Next selected work',exact:true}).click();
      await expect(page.locator('.hero-position')).toHaveText(`4 / ${total}`);
      await expect(page.locator('.hero-outgoing')).toHaveCount(0);
      await page.getByRole('button',{name:'Next selected work',exact:true}).click();
      await expect(page.locator('.hero-position')).toHaveText(`5 / ${total}`);
      await page.getByRole('button',{name:'Pause Selected Works',exact:true}).click();
      expect(await page.locator('.hero-finder').boundingBox()).toEqual(finder);
      await capture(page,`autoplay-interrupted-${viewport.name}`);
      } finally {
        await context.close();
        await video.saveAs(path.join(captures,`autoplay-${viewport.name}.webm`));
      }
    });
  });
}

test('Selected Works continues from the settled position after the browser takes over touch scrolling',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.clock.install();
  await page.goto(`${base}?page=home`);
  const track=page.locator('.hero-track:visible');
  // A touch pan cancels pointer input before the browser settles its scroll position.
  await track.dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch',isPrimary:true});
  await track.dispatchEvent('pointercancel',{pointerId:1,pointerType:'touch',isPrimary:true});
  await track.evaluate(el=>el.scrollTo({left:el.clientWidth,behavior:'instant'}));
  await expect(page.locator('.hero-position')).toHaveText('2 / 12');
  await page.clock.runFor(8100);
  await expect(page.locator('.hero-position')).toHaveText('3 / 12');
  await track.hover({position:{x:280,y:300}});
  await page.mouse.wheel(-390,0);
  await expect(page.locator('.hero-position')).toHaveText('2 / 12');
  await page.clock.runFor(8100);
  await expect(page.locator('.hero-position')).toHaveText('3 / 12');
});
