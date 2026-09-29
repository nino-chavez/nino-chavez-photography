import {test,expect} from '@playwright/test';

const route='/photography/analytics/operator';
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
