import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

test.skip(process.env.PHOTOGRAPHY_ARRIVAL !== '1', 'Opt in against the static arrival study.');
test.setTimeout(90_000);
const base = '/arrival/';
const captures = path.resolve(process.env.ARRIVAL_CAPTURES || '.temp/photography-arrival/captures');
const downloads = path.resolve('.temp/photography-arrival/downloads');
mkdirSync(captures,{recursive:true}); mkdirSync(downloads,{recursive:true});

async function capture(page:import('@playwright/test').Page,name:string){
  await page.waitForFunction(()=>[...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.width>0;}).every(i=>i.complete&&i.naturalWidth>0));
  await page.evaluate(async()=>{await Promise.all([...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.width>0;}).map(i=>i.decode()));await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:path.join(captures,`${name}.png`)});
}

for(const viewport of [{name:'desktop',width:1440,height:1000},{name:'phone',width:390,height:844}]){
  test(`${viewport.name}: homepage through complete gallery, photo and selection`,async({page})=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setViewportSize(viewport);await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
    await page.goto(`${base}?page=home`);
    await capture(page,`home-${viewport.name}`);
    await page.getByLabel('Event, team or date',{exact:true}).fill('Chicago Point');
    await page.getByRole('button',{name:'Find gallery',exact:true}).click();
    await expect(page.locator('.event-card')).toHaveCount(1);
    await page.locator('#event-1').click();
    await expect(page.locator('.photo-open')).toHaveCount(49);
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
