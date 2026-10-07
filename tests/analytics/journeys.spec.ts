import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

// Local rehearsal suite (npm run analytics:ui:local), signed in as the synthetic owner that analytics:verify:local saves.
test.beforeEach(async({page,context,baseURL})=>{
	const jar=JSON.parse(readFileSync('.temp/analytics-parent-local-cookies.json','utf8'));
	const cookieDomain=process.env.ANALYTICS_COOKIE_DOMAIN ?? new URL(baseURL ?? 'http://127.0.0.1').hostname;
	await context.addCookies(jar.map((x:any)=>({name:x.name,value:x.value,domain:cookieDomain,path:'/',httpOnly:false,secure:false,sameSite:'Lax'})));
 await page.route('**/static.cloudflareinsights.com/**',r=>r.abort());
 await page.route('**/cdn-cgi/rum**',r=>r.abort());
 await page.route('https://imagedelivery.net/**',r=>r.fulfill({path:'static/images/hero/hero-1-mobile.webp',contentType:'image/webp'}));
});
const query='period=custom&start=2026-09-27&end=2026-09-27&compare=none';
const photos='/photography/analytics/photos';
test('the album index leads to the photo explorer, and an album scope narrows it',async({page})=>{
	await page.goto('/photography/analytics/albums');
	await page.getByRole('link',{name:'Photos across all albums'}).click();
	await expect(page.getByRole('heading',{name:'Photos across the gallery'})).toBeVisible();
	await page.goto(photos+'?'+query+'&scope=album&albums=alpha');
	await expect(page.locator('.picker summary')).toContainText('Alpha Invitational');
	await expect(page.getByRole('link',{name:'Reset all filters'})).toBeVisible();
	await page.getByRole('link',{name:'Reset all filters'}).click();
	await expect.poll(()=>new URL(page.url()).searchParams.get('scope')).toBeNull();
	await expect(page.locator('.picker summary')).toContainText('All albums');
});
test('save, update and reopen a view keeps the chosen dates and album',async({page})=>{
 await page.goto(photos+'?'+query+'&scope=album&albums=alpha');
 const name='Parent acceptance '+Date.now();
 await page.getByLabel('Save the filters on this page as a new view').fill(name);
 await page.getByRole('button',{name:'Save view',exact:true}).click();
 const saved=page.getByRole('link',{name,exact:true});
 await expect(saved).toBeVisible();
 const params=new URL((await saved.getAttribute('href'))!,page.url()).searchParams;
 expect(params.get('start')).toBe('2026-09-27');
 expect(params.get('end')).toBe('2026-09-27');
 expect(params.get('albums')).toBe('alpha');
 await saved.click();
 await expect.poll(()=>new URL(page.url()).searchParams.get('albums')).toBe('alpha');
 await page.getByRole('combobox',{name:'Count',exact:true}).selectOption('downloads');
 await page.getByRole('button',{name:'Apply',exact:true}).click();
 await expect.poll(()=>new URL(page.url()).searchParams.get('measure')).toBe('downloads');
 await page.locator('li').filter({has:saved}).getByRole('button',{name:/^Update/}).click();
 await expect.poll(async()=>new URL((await saved.getAttribute('href'))!,page.url()).searchParams.get('measure')).toBe('downloads');
 await saved.click();
 await expect(page.getByRole('combobox',{name:'Count',exact:true})).toHaveValue('downloads');
 // Delete lives in Settings.
 await page.goto('/photography/analytics/settings');
 await page.locator('li').filter({hasText:name}).getByRole('button',{name:/^Delete/}).click();
 await expect(page.getByText(name,{exact:true})).toHaveCount(0);
});
test('a shortlist survives paging and going back, and is offered only to the signed-in owner',async({page})=>{
 await page.goto(photos+'?period=7');
 await expect(page.getByRole('button',{name:'Table',exact:true})).toBeEnabled();
 await page.getByRole('checkbox',{name:'Shortlist',exact:true}).first().check();
 await page.getByRole('link',{name:'Next',exact:true}).click();
 await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();
 await page.goBack();
 await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
 await expect(page.getByRole('checkbox',{name:'Shortlist',exact:true}).first()).toBeChecked();
 await expect(page.getByRole('link',{name:/Shortlist CSV \(1\)/})).toBeVisible();
 await expect(page.getByText(/Shortlisting and saved views need/)).toHaveCount(0);
});
test('photo inspection supports keyboard focus and shortlist export',async({page})=>{
 await page.goto(photos+'?'+query);
 const trigger=page.locator('ul.grid .thumb').first();
 await trigger.click();
 const dialog=page.getByRole('dialog');
 await expect(dialog).toBeInViewport();
 await expect(dialog.getByRole('link',{name:'Open photo to share or download'})).toHaveAttribute('href',/\/photography\/photo\//);
 await expect.poll(()=>dialog.evaluate(e=>e.contains(document.activeElement))).toBe(true);
 await dialog.getByRole('button',{name:'Add to shortlist',exact:true}).click();
	await dialog.getByRole('button',{name:'Close photo details'}).click();
	await expect(dialog).toHaveCount(0);
 await expect(trigger).toBeFocused();
 const href=await page.getByRole('link',{name:'Shortlist CSV (1)',exact:true}).getAttribute('href');
 const response=await page.request.get(href!);
 expect(response.status()).toBe(200);
 expect((await response.text()).trim().split('\n')).toHaveLength(2);
});

test('a sharing note can be created, updated and deleted on the album report',async({page})=>{
 await page.goto('/photography/analytics/albums/alpha');
 const note='Synthetic sharing rehearsal '+Date.now();
 const add=page.locator('form[action*="addNote"]');
 await add.getByLabel('Day').fill('2026-09-27');
 await add.getByLabel('Channel').fill('Instagram');
 await add.getByLabel('What happened').fill(note);
 await add.getByRole('button',{name:'Save note'}).click();
 const item=page.locator('#sharing li').filter({hasText:note});
 await expect(item).toHaveCount(1);
 await item.getByText('Edit',{exact:false}).first().click();
 await item.getByLabel('What happened').fill(note+' updated');
 await item.getByRole('button',{name:'Update note'}).click();
 await page.reload();
 await expect(page.locator('#sharing li').filter({hasText:note+' updated'})).toHaveCount(1);
 await page.locator('#sharing li').filter({hasText:note+' updated'}).getByRole('button',{name:/^Delete/}).click();
 await expect(page.locator('#sharing li').filter({hasText:note})).toHaveCount(0);
});

test('a classification correction on the data page is recorded and can be reversed',async({page})=>{
 await page.goto('/photography/analytics/data?period=30#corrections');
 const form=page.locator('form[action*="correctClassification"]');
 const id=await form.locator('select[name="eventId"] option').evaluateAll(options=>(options.find(o=>o.textContent?.startsWith('Photo opened')) as HTMLOptionElement)?.value);
 expect(id).toBeTruthy();
 await form.getByRole('combobox',{name:'Action to correct',exact:true}).selectOption(id!);
 await form.getByRole('combobox',{name:'New class',exact:true}).selectOption('test');
 const reason='Synthetic browser correction '+Date.now();
 await form.getByRole('textbox',{name:'Reason',exact:true}).fill(reason);
 await form.getByRole('button',{name:'Record correction',exact:true}).click();
 const correction=page.locator('.history li').filter({hasText:reason});
 await expect(correction).toHaveCount(1);
 await correction.getByRole('button',{name:/^Reverse latest/}).click();
 await expect(page.locator('.history li').filter({hasText:'Reversal requested by the operator.'}).first()).toBeVisible();
});

test('an explicitly empty shortlist exports no photos',async({page})=>{
 const response=await page.request.get(photos+'/export.csv?'+query+'&shortlist=');
 expect(response.status()).toBe(200);
 expect((await response.text()).trim().split('\n')).toHaveLength(1);
});
