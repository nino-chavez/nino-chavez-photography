import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
test.beforeEach(async({page,context})=>{
 const jar=JSON.parse(readFileSync('.temp/analytics-parent-local-cookies.json','utf8'));
 await context.addCookies(jar.map((x:any)=>({name:x.name,value:x.value,domain:'127.0.0.1',path:'/',httpOnly:false,secure:false,sameSite:'Lax'})));
 await page.route('**/static.cloudflareinsights.com/**',r=>r.abort());
 await page.route('**/cdn-cgi/rum**',r=>r.abort());
 await page.route('https://imagedelivery.net/**',r=>r.fulfill({path:'static/images/hero/hero-1-mobile.webp',contentType:'image/webp'}));
});
const query='period=custom&start=2026-09-27&end=2026-09-27&compare=none';
test('inspect a named album changes report scope',async({page})=>{
 await page.goto('/photography/analytics/operator?'+query);
 const row=page.locator('#albums tr').filter({hasText:'Alpha Invitational'});
 await row.getByRole('link',{name:'Inspect'}).click();
 await expect.poll(()=>new URL(page.url()).searchParams.get('scope')).toBe('album');
 await expect.poll(()=>new URL(page.url()).searchParams.get('albums')).toBe('alpha');
 await expect(page.locator('.selected-album')).toContainText('Alpha Invitational');
 await page.goBack();
 await expect.poll(()=>new URL(page.url()).searchParams.get('scope')).toBeNull();
 await expect(page.locator('.album-picker summary')).toContainText('All albums');
});
test('save and reopen preserves the chosen dates and album',async({page})=>{
 await page.goto('/photography/analytics/operator?'+query+'&scope=album&albums=alpha');
 const name='Parent acceptance '+Date.now();
 await page.getByLabel('View name').fill(name);
 await page.getByRole('button',{name:'Save view',exact:true}).click();
 const saved=page.getByRole('link',{name,exact:true});
 await expect(saved).toBeVisible();
 const href=await saved.getAttribute('href');
 const params=new URL(href!,page.url()).searchParams;
 expect(params.get('start')).toBe('2026-09-27');
 expect(params.get('end')).toBe('2026-09-27');
 expect(params.get('albums')).toBe('alpha');
 await saved.click();
 await expect(page.locator('.selected-album')).toContainText('Alpha Invitational');
 await page.getByRole('combobox',{name:'Measure',exact:true}).selectOption('downloads');
 await page.getByRole('button',{name:'Apply',exact:true}).click();
 await expect.poll(()=>new URL(page.url()).searchParams.get('measure')).toBe('downloads');
 await page.locator('li').filter({has:saved}).getByRole('button',{name:'Update',exact:true}).click();
 await expect.poll(async()=>new URL((await saved.getAttribute('href'))!,page.url()).searchParams.get('measure')).toBe('downloads');
 await saved.click();
 await expect(page.getByRole('combobox',{name:'Measure',exact:true})).toHaveValue('downloads');
 await page.locator('li').filter({has:saved}).getByRole('button',{name:'Delete',exact:true}).click();
 await expect(page.getByRole('link',{name,exact:true})).toHaveCount(0);
});
test('photo inspection supports keyboard focus and shortlist export',async({page})=>{
 await page.goto('/photography/analytics/operator?'+query);
 const trigger=page.locator('.photo-inspect').first();
 await trigger.click();
 const dialog=page.getByRole('dialog');
 await expect(dialog).toBeInViewport();
 await expect(dialog.getByRole('link',{name:'Open photo to share or download'})).toHaveAttribute('href',/^\/photography\/photo\//);
 await expect.poll(()=>dialog.evaluate(e=>e.contains(document.activeElement))).toBe(true);
 await dialog.getByRole('button',{name:'Add to shortlist',exact:true}).click();
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
 await expect(trigger).toBeFocused();
 const href=await page.getByRole('link',{name:'Shortlist CSV (1)',exact:true}).getAttribute('href');
 const response=await page.request.get(href!);
 expect(response.status()).toBe(200);
 expect((await response.text()).trim().split('\n')).toHaveLength(2);
});

test('sharing note can be created, updated and deleted in the selected report',async({page})=>{
 await page.goto('/photography/analytics/operator?'+query+'&scope=album&albums=alpha');
 const note='Synthetic sharing rehearsal '+Date.now();
 const add=page.locator('form[action*="addAnnotation"]');
 await add.getByRole('combobox',{name:'Album',exact:true}).selectOption('alpha');
 await add.getByLabel('Activity date').fill('2026-09-27');
 await add.getByLabel('Channel').fill('Instagram');
 await add.getByLabel('What happened').fill(note);
 await add.getByRole('button',{name:'Save note'}).click();
 const created=page.locator('li').filter({has:page.locator('textarea').filter({hasText:note})});
 await expect(created).toHaveCount(1);
 const id=await created.locator('input[name="id"]').first().inputValue();
 const row=page.locator('li').filter({has:page.locator(`input[name="id"][value="${id}"]`)});
 await row.getByRole('textbox',{name:'Note',exact:true}).fill(note+' updated');
 await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('updateAnnotation')),row.getByRole('button',{name:'Update',exact:true}).click()]);
 await page.waitForLoadState('networkidle');
 await page.reload();
 await expect(row.getByRole('textbox',{name:'Note',exact:true})).toHaveValue(note+' updated');
 await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('deleteAnnotation')),row.getByRole('button',{name:'Delete note'}).click()]);
 await expect(row).toHaveCount(0);
});

test('classification correction changes the report and can be reversed',async({page})=>{
 await page.goto('/photography/analytics/operator?'+query+'&scope=album&albums=alpha');
 await expect(page.locator('.answer-primary strong')).toHaveText('3');
 const form=page.locator('form[action*="correctClassification"]');
 const id=await form.locator('select[name="eventId"] option').evaluateAll(options=>(options.find(o=>o.textContent?.includes(' · view ·')&&o.textContent?.includes('gallery-grid')) as HTMLOptionElement)?.value);
 expect(id).toBeTruthy();
 await form.getByRole('combobox',{name:'Retained event',exact:true}).selectOption(id!);
 await form.getByRole('combobox',{name:'Classification',exact:true}).selectOption('test');
 const reason='Synthetic browser correction '+Date.now();
 await form.getByRole('textbox',{name:'Reason',exact:true}).fill(reason);
 await form.getByRole('button',{name:'Record',exact:true}).click();
 await expect(page.locator('.answer-primary strong')).toHaveText('2');
 const correction=page.locator('tr').filter({hasText:reason});
 await correction.getByRole('button',{name:'Reverse latest',exact:true}).click();
 await expect(page.locator('.answer-primary strong')).toHaveText('3');
});

test('an explicitly empty shortlist exports no photos',async({page})=>{
 const response=await page.request.get('/photography/analytics/operator/export.csv?'+query+'&shortlist=');
 expect(response.status()).toBe(200);
 expect((await response.text()).trim().split('\n')).toHaveLength(1);
});
