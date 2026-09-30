/** Loopback-only functional API rehearsal. Never reads or writes production. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
const base=process.env.ANALYTICS_TEST_BASE_URL ?? 'http://127.0.0.1:57400';
if(new URL(base).hostname!=='127.0.0.1') throw Error('Loopback rehearsal required');
const runtime=JSON.parse(readFileSync('.temp/backend-rehearsal-runtime.json','utf8'));
if(new URL(runtime.API_URL).hostname!=='127.0.0.1') throw Error('Loopback database required');
const jar=JSON.parse(readFileSync('.temp/analytics-parent-local-cookies.json','utf8'));
const cookie=jar.map(c=>c.name+'='+c.value).join('; ');
const endpoint=base+'/photography/api/analytics/intelligence';
const checks=[];
async function request(path='',body,owner=true,origin=base,method=body?'POST':'GET') {
 const response=await fetch(endpoint+path,{method,headers:{...(owner?{cookie}:{}),...(body?{'content-type':'application/json',origin}: {})},body:body?JSON.stringify(body):undefined});
 let result;try{result=await response.json();}catch{result=null;} return {response,result};
}
assert.equal((await request('/preferences',undefined,false)).response.status,403);checks.push('anonymous private preferences rejected');
assert.equal((await request('/preferences',{retention:'90_days',daily:true,weekly:true},true,'https://attacker.example')).response.status,403);checks.push('cross-origin private write rejected');
assert.equal((await request('/preferences',{retention:'90_days',daily:true,weekly:true,externalEnabled:true})).response.status,400);checks.push('unknown preference fields rejected');
const scope={kind:'gallery',query:{start:'2026-08-31',end:'2026-09-29',scope:'all',albumKeys:[],measure:'photo_opens',compare:'previous',traffic:'conservative'}};
const action={scope,kind:'record',publicTarget:{kind:'gallery'},changeType:'promotion',actualAt:new Date(Date.now()-86400000).toISOString(),hypothesis:'Synthetic local check only.',primaryMeasure:'photo_opens',observationDays:7,outcome:'inquiry',outcomeCount:0};
const preferences=await request('/preferences');assert.equal(preferences.response.status,200);
if(preferences.result.retention==='undecided'){assert.equal((await request('/actions',action)).response.status,409);checks.push('undecided retention explicitly rejects action');}
assert.equal((await request('/preferences',{retention:'90_days',daily:true,weekly:true})).response.status,200);checks.push('explicit synthetic retention saved');
assert.equal((await request('/refresh',{scope})).response.status,202);
assert.equal((await request('/refresh',{scope},false)).response.status,403);checks.push('scope calculation requires authenticated owner');
async function runJobs(token){return fetch(endpoint+'/jobs',{method:'POST',headers:{'x-analytics-posthog-schedule-token':token}});}
assert.equal((await runJobs('wrong')).status,403);checks.push('wrong scheduler credential rejected');
const run=await runJobs('local-intelligence-scheduler-only-fixture-token');const job=await run.json();assert.equal(run.status,200);assert.equal(job.ok,true);assert.equal(job.jobs.providerQueries,0);checks.push('actual scheduler refreshes stored snapshots with no provider in loopback');
const report=await request('?scope='+encodeURIComponent(JSON.stringify(scope)));assert.equal(report.response.status,200);assert.equal(report.result.owner,true);checks.push('owner reads exact stored scope');
const saved=await request('/actions',action);assert.equal(saved.response.status,200);assert.equal(saved.result.action?.outcomeCount ?? saved.result.outcomeCount,0);checks.push('standalone action persists its public target and zero outcome count');
const read=await request('?scope='+encodeURIComponent(JSON.stringify(scope)));assert.equal(read.response.status,200);assert.ok(read.result.actions.length>0);
const publicRead=await request('?scope='+encodeURIComponent(JSON.stringify(scope)),undefined,false);assert.equal(publicRead.response.status,200);assert.deepEqual(publicRead.result.actions,[]);assert.deepEqual(publicRead.result.briefs,[]);checks.push('anonymous snapshot contains no private history or briefs');
const actionId=saved.result.action?.id ?? saved.result.id; assert.ok(actionId);
const outcome={actionId,outcome:'booking',outcomeCount:0,note:'Synthetic result only.'};
assert.equal((await request('/outcomes',outcome,false)).response.status,403);
assert.equal((await request('/outcomes',{...outcome,ownerId:'attacker'})).response.status,400);
assert.equal((await request('/outcomes',outcome)).response.status,200);
const updated=await request('?scope='+encodeURIComponent(JSON.stringify(scope)));
assert.equal(updated.result.actions.find(a=>a.id===actionId)?.outcome,'booking');
assert.equal(updated.result.actions.find(a=>a.id===actionId)?.outcomeCount,0);checks.push('later observed result updates the private read without rewriting its original action');
assert.equal((await request('/history',{confirm:'delete_private_history'},false,base,'DELETE')).response.status,403);
assert.equal((await request('/history',{confirm:'wrong'},true,base,'DELETE')).response.status,400);checks.push('private history deletion requires owner and explicit confirmation');
const albumScope={...scope,query:{...scope.query,scope:'album',albumKeys:['alpha']}};
const question=await request('',{scope:albumScope,question:'How is this album doing compared with similar albums?'});
assert.equal(question.response.status,202);const requestId=question.result.requestId;assert.ok(requestId);
let answer;
for(let i=0;i<15;i++){await runJobs('local-intelligence-scheduler-only-fixture-token'); answer=await request('?requestId='+requestId+'&scope='+encodeURIComponent(JSON.stringify(albumScope))); if(answer.result?.status!=='pending')break;}
assert.equal(answer.result.status,'complete');assert.ok(answer.result.answer.comparison);
assert.ok(['complete','unavailable'].includes(answer.result.answer.status));checks.push('actual album comparison request completes through the bounded background worker');

const admin=createClient(runtime.API_URL,runtime.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data,error}=await admin.auth.admin.generateLink({type:'magiclink',email:'analytics-operator@example.test'});assert.equal(error,null);
const tokenHash=data.properties?.hashed_token;assert.ok(tokenHash);
const callback=await fetch(base+'/photography/auth/callback?token_hash='+encodeURIComponent(tokenHash)+'&type=magiclink&next=%2Fphotography%2Fanalytics%2Foperator',{redirect:'manual'});
assert.equal(callback.status,303);const setCookies=callback.headers.getSetCookie();assert.ok(setCookies.length);
const freshCookie=setCookies.map(v=>v.split(';')[0]).join('; ');
const verify=await fetch(endpoint+'/preferences',{headers:{cookie:freshCookie}});assert.equal(verify.status,200);checks.push('magic link establishes a verified session in a fresh browser without PKCE cookies');
const invalid=await fetch(base+'/photography/auth/callback?token_hash=wrong-token&type=magiclink',{redirect:'manual'});assert.equal(invalid.status,303);assert.match(invalid.headers.get('location')??'',/auth_callback_failed/);checks.push('wrong magic-link token does not authenticate');
const receipt={observedAt:new Date().toISOString(),passed:true,environment:'local synthetic Supabase and actual SvelteKit routes',productionTouched:false,checks,limits:'Does not prove production mail templates, delivery, or provider collection.'};
mkdirSync('docs/implementation/analytics-intelligence-20260930/evidence',{recursive:true});writeFileSync('docs/implementation/analytics-intelligence-20260930/evidence/api-local-proof.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
