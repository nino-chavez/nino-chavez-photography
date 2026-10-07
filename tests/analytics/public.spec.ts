import {test,expect,type Page} from '@playwright/test';

// Local rehearsal suite (npm run analytics:ui:local). It needs the synthetic local project; see docs/ANALYTICS_BUILD.md.
const photos='/photography/analytics/photos';

test('the retired gallery report addresses go to their new homes in one hop',async({request})=>{
 const where=async(path:string)=>{
  const response=await request.get(path,{maxRedirects:0});
  expect(response.status(),path).toBe(308);
  const location=new URL(response.headers().location);
  return location.pathname+location.search+location.hash;
 };
 expect(await where('/photography/analytics?period=7&measure=downloads')).toBe('/photography/analytics/home');
 expect(await where('/photography/analytics/operator')).toBe('/photography/analytics/home');
 expect(await where('/photography/analytics/operator?section=photos&period=7&measure=downloads')).toBe('/photography/analytics/photos?period=7&measure=downloads');
 expect(await where('/photography/analytics/operator?section=measurement&period=7')).toBe('/photography/analytics/data?period=7');
 expect(await where('/photography/analytics/operator/export.csv?period=7')).toBe('/photography/analytics/photos/export.csv?period=7');
});

// The explorer's controls switch on once the page has hydrated; a choice made before then is overwritten by the page's own state.
const hydrated=(page:Page)=>expect(page.getByRole('button',{name:'Table',exact:true})).toBeEnabled();

test('photo results use pages inside the photo view, and a visitor is offered no shortlist',async({page})=>{
 await page.goto(photos+'?period=7');
 await hydrated(page);
 await expect(page.getByRole('link',{name:'Next',exact:true})).toBeEnabled();
 await expect(page.locator('ul.grid > li')).toHaveCount(12);
 await expect(page.getByRole('checkbox',{name:'Shortlist'})).toHaveCount(0);
 await expect(page.getByText(/Shortlisting and saved views need/)).toBeVisible();
 await page.getByRole('link',{name:'Next',exact:true}).click();
 await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();
 await expect.poll(()=>new URL(page.url()).searchParams.get('photo_page')).toBe('1');
 await page.goBack();
 await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
 await page.locator('ul.grid .thumb').first().click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByRole('dialog').getByRole('button',{name:/shortlist/i})).toHaveCount(0);
 await page.getByRole('button',{name:'Close photo details'}).click();
 await expect(page.locator('ul.grid > li')).toHaveCount(12);
});

test('reports, filters and CSV are available without a session',async({page})=>{
 const response=await page.goto(photos+'?period=7');
 expect(response?.status()).toBe(200);
 await hydrated(page);
 await expect(page.getByRole('heading',{name:'Photos across the gallery',exact:true})).toBeVisible();
 await expect(page.locator('form[method="POST"]')).toHaveCount(0);
 await page.getByRole('combobox',{name:'Count',exact:true}).selectOption('album_opens');
 await page.getByRole('button',{name:'Apply',exact:true}).click();
 await expect.poll(()=>new URL(page.url()).searchParams.get('measure')).toBe('album_opens');
 await expect(page.getByText(/^Album opens from /)).toBeVisible();
 const csv=await page.request.get(photos+'/export.csv?period=7');
 expect(csv.status()).toBe(200);
 expect(csv.headers()['content-type']).toContain('text/csv');
 const empty=await page.request.get(photos+'/export.csv?period=7&shortlist=');
 expect(empty.status()).toBe(200);
 expect((await empty.text()).trim().split('\n')).toHaveLength(1);
});

test('every analytics write action still requires the owner to be signed in',async({request})=>{
 for(const [route,actions] of [
  [photos,['saveView','updateView']],
  ['/photography/analytics/data',['correctClassification','undoClassification','correctV2Classification','undoV2Classification']],
  ['/photography/analytics/albums/alpha',['addNote','updateNote','deleteNote']],
  ['/photography/analytics/settings',['saveView','renameView','deleteView']]
 ] as const) for(const action of actions){
  const response=await request.post(route+'?/'+action,{headers:{accept:'application/json','x-sveltekit-action':'true'},form:{},maxRedirects:0});
  const result=await response.json();
  expect(result,`${route} ${action}`).toMatchObject({type:'redirect',status:302,location:'/photography/login'});
 }
});
