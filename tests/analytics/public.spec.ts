import {test,expect} from '@playwright/test';

const route='/photography/analytics/operator';
test('the retired analytics address keeps report filters and opens the workspace',async({request})=>{
 const response=await request.get('/photography/analytics?period=7&measure=downloads',{maxRedirects:0});
 expect(response.status()).toBe(308);
 expect(response.headers().location).toBe(`${route}?period=7&measure=downloads`);
});

test('photo results use pages inside the photo view',async({page})=>{
 await page.goto(route+'?period=7#photos');
 await expect(page.getByRole('link',{name:'Next',exact:true})).toBeEnabled();
 await expect(page.locator('.photo-card')).toHaveCount(12);
 await page.getByRole('checkbox',{name:'Shortlist',exact:true}).first().check();
 let release!: ()=>void;
 const held=new Promise<void>(resolve=>{release=resolve});
 const dataRequest=(url:URL)=>url.pathname.endsWith('/__data.json');
 await page.route(dataRequest, async route=>{await held;await route.continue()});
 const change=page.getByRole('link',{name:'Next',exact:true}).click();
 try {
  await expect(page.getByRole('status').filter({hasText:'Loading report'})).toBeVisible();
  await expect(page.locator('.photo-inspect').first()).toBeDisabled();
 } finally {release();}
 await change;
 await page.unroute(dataRequest);

 await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();
 await expect.poll(()=>new URL(page.url()).searchParams.get('photo_page')).toBe('1');
 await page.goBack();
 await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
 await expect(page.getByRole('checkbox',{name:'Shortlist',exact:true}).first()).toBeChecked();
 await expect(page.getByRole('link',{name:/Shortlist CSV \(1\)/})).toBeVisible();
 await page.getByRole('link',{name:'Next',exact:true}).click();
 await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();
 await page.locator('.photo-inspect').first().click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByRole('button',{name:'Return to photos',exact:true}).click();
 await expect(page.locator('.photo-card')).toHaveCount(12);
});

test('reports, filters and CSV are available without a session',async({page})=>{
 const response=await page.goto(route+'?period=7');
 expect(response?.status()).toBe(200);
 await expect(page.getByRole('heading',{name:'Gallery analytics',exact:true})).toBeVisible();
 await expect(page.locator('form[method="POST"]')).toHaveCount(0);
 await expect(page.getByText('Private operator view',{exact:true})).toHaveCount(0);
 await page.getByRole('combobox',{name:'Measure',exact:true}).selectOption('album_opens');
 await page.getByRole('button',{name:'Apply',exact:true}).click();
 await expect.poll(()=>new URL(page.url()).searchParams.get('measure')).toBe('album_opens');
 await expect(page.getByRole('heading',{name:'Album Opens',exact:true})).toBeVisible();
 const csv=await page.request.get(route+'/export.csv?period=7');
 expect(csv.status()).toBe(200);
 expect(csv.headers()['content-type']).toContain('text/csv');
 const empty=await page.request.get(route+'/export.csv?period=7&shortlist=');
 expect(empty.status()).toBe(200);
 expect((await empty.text()).trim().split('\n')).toHaveLength(1);
});

test('all analytics write actions still require operator authentication',async({request})=>{
 for(const action of ['saveReport','updateReport','deleteReport','addAnnotation','updateAnnotation','deleteAnnotation','correctClassification','undoClassification']){
  const response=await request.post(route+'?/'+action,{headers:{accept:'application/json','x-sveltekit-action':'true'},form:{},maxRedirects:0});
  const result=await response.json();
  expect(result,action).toMatchObject({type:'redirect',status:302,location:'/photography/login'});
 }
});
