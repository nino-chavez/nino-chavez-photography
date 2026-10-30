import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// Run against the static comparison server with PLAYWRIGHT_BASE_URL set.
const captures=path.resolve('docs/evidence/screen-reviews/photography-20261030-concepts');
mkdirSync(captures,{recursive:true});
test.setTimeout(90_000);
test.skip(process.env.PHOTOGRAPHY_RETHINK !== '1', 'Static concept suite; opt in against its dedicated preview server.');

test('query parameters remain text rather than HTML', async ({page})=>{
  const payload='<img src=x data-query-injection="true">';
  await page.goto(`/?c=A&page=events&month=${encodeURIComponent(payload)}`);
  await expect(page.locator('.result-count img')).toHaveCount(0);
  await expect(page.locator('.result-count')).toContainText(payload);
});

for (const c of ['A','B','C']) {
  for (const viewport of [{name:'desktop',width:1440,height:1000},{name:'phone',width:390,height:844}]) {
    test(`${c} ${viewport.name}: gallery discovery, viewer, saved and return`,async({page})=>{
      const errors:string[]=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.setViewportSize(viewport);
      await page.emulateMedia({reducedMotion:'reduce',colorScheme:'dark'});
      const capture=async(state:string)=>{
        await expect(page.locator('#notice')).toBeHidden();
        await page.waitForFunction(()=>[...document.images].filter(i=>{
          const r=i.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.width>0;
        }).every(i=>i.complete && i.naturalWidth>0));
        await page.evaluate(async()=>{await Promise.all([...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.width>0;}).map(i=>i.decode()));await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
        await page.screenshot({path:path.join(captures,`${c}-${state}-${viewport.name}.png`)});
      };
      await page.goto(`/?c=${c}`);
      await expect(page.getByRole('heading',{level:1})).toBeVisible();
      await capture('home');
      await page.getByRole('navigation',{name:'Photography',exact:true}).getByRole('link',{name:'Galleries',exact:true}).click();
      await expect(page.getByRole('heading',{name:'Event galleries',exact:true})).toBeVisible();
      await capture('archive');
      await page.getByLabel('Find a gallery',{exact:true}).fill('Chicago Point');
      await page.getByRole('button',{name:'Search',exact:true}).click();
      await expect(page.locator('#event-1')).toBeVisible();
      await expect(page.locator('main .gallery-card,main .event-row')).toHaveCount(1);
      await page.locator('#event-1').click();
      await expect(page.getByRole('heading',{level:1})).toHaveText('THE Chicago Point Series 18s & 17s #1');
      await expect(page.locator('.photo-open')).toHaveCount(12);
      await capture('gallery');
      await page.locator('#photo-1-0').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('dialog').getByRole('img')).toHaveAttribute('alt',/player/i);
      await capture('viewer');
      await expect(page.getByRole('dialog').getByRole('button',{name:'Share',exact:true})).toBeVisible();
      await page.getByRole('button',{name:'Save photograph',exact:true}).click();
      await expect(page.getByRole('button',{name:'Saved · Remove',exact:true})).toHaveAttribute('aria-pressed','true');
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('.viewer-title')).toContainText('2 of 12');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).not.toBeVisible();
      await expect(page.locator('#photo-1-0')).toBeFocused();
      await page.getByRole('link',{name:'Back to results'}).click();
      await expect(page.getByLabel('Find a gallery',{exact:true})).toHaveValue('Chicago Point');
      await expect(page.locator('#event-1')).toBeFocused();
      await page.getByRole('navigation',{name:'Photography',exact:true}).getByRole('link',{name:/Saved/}).click();
      await expect(page.locator('.photo-open')).toHaveCount(1);
      await page.reload();
      await expect(page.locator('.photo-open')).toHaveCount(1);
      await page.getByRole('button',{name:'Saved',exact:true}).click();
      await expect(page.getByRole('heading',{name:'No saved photographs yet'})).toBeVisible();
      await page.getByRole('link',{name:'Browse galleries',exact:true}).click();
      await page.getByLabel('Find a gallery',{exact:true}).fill('zzzz-no-such-event');
      await page.getByRole('button',{name:'Search',exact:true}).click();
      await expect(page.getByRole('heading',{name:'No matching galleries',exact:true})).toBeVisible();
      await capture('empty');
      const crossSite=page.getByRole('link',{name:/^(Profile|Writing) ↗$/});
      await expect(crossSite).toHaveCount(2);
      for(const link of await crossSite.all())await expect(link).toHaveAttribute('target','_blank');
      expect(errors).toEqual([]);
    });
  }
}

test('narrow viewport, filtered Back, photo search, storage failure and failed images',async({page})=>{
  await page.setViewportSize({width:320,height:568});
  await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('storage blocked');}}));
  await page.route('https://imagedelivery.net/**',route=>route.abort());
  await page.goto('/?c=C&page=events');
  await page.getByLabel('Filter galleries by month').selectOption('Sep');
  await expect(page.locator('main .gallery-card')).toHaveCount(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  // Negative control: the overflow check must detect a real offscreen element.
  await page.evaluate(()=>{const d=document.createElement('div');d.id='overflow-control';d.style.cssText='width:2000px;height:20px;background:red';document.body.append(d);});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(false);
  await page.evaluate(()=>document.querySelector('#overflow-control')?.remove());
  await page.goto('/?c=C&page=gallery&event=1');
  await page.getByLabel('Search this gallery',{exact:true}).fill('DSC00189');
  await page.getByRole('button',{name:'Search',exact:true}).click();
  await expect(page.locator('.photo-open')).toHaveCount(1);
  await page.locator('#photo-1-0').click();
  await page.getByRole('button',{name:'Save photograph',exact:true}).click();
  await page.keyboard.press('Escape');
  await page.getByRole('navigation',{name:'Photography',exact:true}).getByRole('link',{name:/Saved/}).click();
  await expect(page.getByText('Browser storage is unavailable; saves last only until this page closes.',{exact:false})).toBeVisible();
  await expect(page.locator('.photo-open')).toHaveCount(1);
  await page.goto('/?c=A&page=work');
  await expect(page.locator('.photo-open')).toHaveCount(14);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});
