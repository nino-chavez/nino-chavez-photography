// Audit reproduction only. Actual client and route source; synthetic DB/auth adapters.
// Does not make a network request or write to a database.
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import * as kit from '@sveltejs/kit';
import * as contract from '../../../src/lib/analytics/collection-contract.ts';
import {isBotUserAgent} from '../../../src/lib/analytics/bot-detection.ts';

function load(file, modules, extra={}) {
 const source=fs.readFileSync(file,'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 vm.runInNewContext(js,{exports,require:id=>{if(!(id in modules))throw Error('Unexpected dependency '+id);return modules[id];},Request,URL,Date,console,Buffer,...extra},{filename:file});
 return exports;
}
const captured=[];
const client=load('src/lib/analytics/client.ts',{'$app/environment':{browser:true},'$app/paths':{base:'/photography'},'$lib/analytics/share':{SHARE_SRC:{}}},{fetch:async(url,options)=>{captured.push({url,body:JSON.parse(options.body)});return new Response('{}');}});
client.trackDownloadDiagnostic({photoId:'synthetic-photo',albumKey:'synthetic-album',source:'download-button',status:'requested'});
assert.equal(captured.length,1);
let inserts=0;
const admin={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{album_key:'synthetic-album'},error:null})})}),insert:async()=>{inserts++;return {error:null};}})};
const route=load('src/routes/api/analytics/diagnostics/+server.ts',{'@sveltejs/kit':kit,'$lib/supabase/server-ssr':{createSupabaseAdminClient:()=>admin},'$lib/analytics/context.server':{resolveAnalyticsContext:async()=> 'audience'},'$lib/analytics/bot-detection':{isBotUserAgent},'$lib/analytics/collection-contract':contract});
async function diagnostic(body) {try {const r=await route.POST({request:new Request('https://example.test/photography/api/analytics/diagnostics',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'Mozilla/5.0 Chrome/141 Safari/537.36'},body:JSON.stringify(body)}),cookies:{}});return {status:r.status,body:await r.json()};}catch(e){return {status:e.status,body:e.body};}}
const actualClient=await diagnostic(captured[0].body);
assert.equal(actualClient.status,400);
assert.equal(inserts,0);
const omitted={...captured[0].body};delete omitted.error_code;
const omittedError=await diagnostic(omitted);assert.equal(omittedError.status,200);
const explicitFailure=await diagnostic({...captured[0].body,status:'failed',error_code:'client_request_failed'});assert.equal(explicitFailure.status,200);

const context=load('src/lib/analytics/context.server.ts',{'$app/environment':{dev:false},'$lib/site-url':{SITE_ORIGIN:'https://example.test'},'@sveltejs/kit':kit,'$env/dynamic/private':{env:{}},'$lib/supabase/server-ssr':{createSupabaseServerClient:()=>({auth:{getUser:async()=>({data:{user:null}})}})},'$lib/server/admin-auth':{isAllowedAdmin:()=>false},'$lib/analytics/collection-contract':contract});
const ordinaryBrowser=new Request('https://example.test/photography/api/engagement',{headers:{'User-Agent':'Mozilla/5.0 Chrome/141 Safari/537.36'}});
const anonymousContext=await context.resolveAnalyticsContext(ordinaryBrowser,{});
assert.equal(anonymousContext,'audience');assert.equal(isBotUserAgent(ordinaryBrowser.headers.get('User-Agent')),false);
const favoritesSource=fs.readFileSync('src/lib/components/favorites/FavoritesDownloadButton.svelte','utf8');
const fetchPhotoSource=favoritesSource.match(/function fetchPhoto\(photo: Photo\): Promise<Entry> \{[\s\S]*?\n\s*\}/)?.[0];
assert.ok(fetchPhotoSource);
const fetchPhotoJs=ts.transpileModule(fetchPhotoSource,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const fetchPhoto=vm.runInNewContext(fetchPhotoJs+'\nfetchPhoto',{cfImageUrl:()=> 'https://example.test/photo.jpg',base:'/photography',signal:undefined,encodeURIComponent,fetch:async()=>new Response('Synthetic upstream failure',{status:503})});
const failedPhotoEntry=await fetchPhoto({cf_image_id:'synthetic-photo',image_key:'synthetic-photo'});
assert.equal(await failedPhotoEntry.data.text(),'Synthetic upstream failure');
const evidence={checkedAt:new Date().toISOString(),synthetic:true,productionWrites:0,method:'Transpiled actual TypeScript client and handlers; mocked only browser flag, DB/auth, HTTP responses and framework environment.',diagnostics:{normalRequestHasNullError:captured[0].body.error_code===null,normalRequest:actualClient,omittedError,explicitFailure},anonymousChrome:{context:anonymousContext,recognizedBot:false},favoritesZip:{upstreamStatus:503,rejected:false,entryFilename:failedPhotoEntry.name,blobText:await failedPhotoEntry.data.text()},limits:['No live database or delivered browser event tested','Anonymous context applies to any unmarked signed-out browser; the owner or automation identity cannot be inferred','Favorites ZIP test evaluates its actual fetchPhoto function; archive creation and operating-system save were not executed']};
fs.writeFileSync(new URL('./collection-reproduction.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
