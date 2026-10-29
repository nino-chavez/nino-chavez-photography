/** Read-only production query timings. Never logs credentials, identifiers or report rows. */
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {buildOperatorReport} from '../src/lib/analytics/operator-report.server';
import {parseReportQuery} from '../src/lib/analytics/report-contract';

const read=(field:string)=>execFileSync('op',['read',`op://Developer Secrets/Supabase photography/${field}`],{encoding:'utf8'}).trim();
const url=read('url');
if(new URL(url).hostname!=='skywzpcekhntecegyjoj.supabase.co')throw Error('Refusing an unexpected project.');
const key=read('service_role_key');
const results=[];
const mode=process.env.ANALYTICS_PROFILE_MODE ?? 'full';
if(!['full','overview','photos'].includes(mode))throw Error('Use full/overview/photos mode.');
const periods=(process.env.ANALYTICS_PROFILE_PERIODS ?? '30,90').split(',').map(Number);
const runs=Number(process.env.ANALYTICS_PROFILE_RUNS ?? 1);
if(periods.some(period=>![7,30,90].includes(period))||!Number.isInteger(runs)||runs<1||runs>3)throw Error('Use 7/30/90 days and 1–3 runs.');
const output=process.env.ANALYTICS_PROFILE_OUTPUT ?? 'docs/implementation/site-actions-20260929/evidence/performance-query-profile.json';
for(const period of periods) for(let run=1;run<=runs;run++){
 const requests:Array<{resource:string;status:number;milliseconds:number;bytes:number}>=[];
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
  const requestUrl=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  const readRpcs=['/rest/v1/rpc/analytics_read_report_evidence_compact','/rest/v1/rpc/analytics_read_report_evidence','/rest/v1/rpc/analytics_count_distinct_visitors'];
  if(init?.method&&init.method!=='GET'&&!readRpcs.includes(requestUrl.pathname))throw Error('Unexpected mutation.');
  const started=performance.now();
  const response=await fetch(input,{...init,signal:AbortSignal.timeout(30000)});
  const body=await response.arrayBuffer();
  requests.push({resource:requestUrl.pathname.replace('/rest/v1/',''),status:response.status,milliseconds:performance.now()-started,bytes:body.byteLength});
  return new Response(body,{status:response.status,headers:response.headers});
 }}});
 const started=performance.now();
 const report=await buildOperatorReport(client,parseReportQuery(new URLSearchParams({period:String(period)})),{publicOnly:true, ...(mode==='full'?{}:{photoWindow:{page:0,pageSize:mode==='overview'?4:12,rank:'popular' as const}, includeDiagnostics:false,includeVisitorEstimate:mode==='overview',includeToday:mode==='overview',cacheRole:'service_role' as const})});
 results.push({mode,period,run,elapsedMs:performance.now()-started,available:report.available,total:report.total,photos:report.photos.length,albums:report.albums.length,requests});
}
await writeFile(output,JSON.stringify({measuredAt:new Date().toISOString(),kind:'Read-only production data with current local report builder, running on this Mac. Bytes are decoded response bytes. Not Cloudflare Worker CPU timing.',results},null,2));
console.log(JSON.stringify(results.map(result=>({...result,requests:Object.entries(result.requests.reduce<Record<string,{calls:number;totalMs:number;bytes:number}>>((groups,r)=>{const g=groups[r.resource]??={calls:0,totalMs:0,bytes:0};g.calls++;g.totalMs+=r.milliseconds;g.bytes+=r.bytes;return groups;},{}))}))));
