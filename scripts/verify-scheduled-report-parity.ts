/** Compare scheduled reporting against the pre-change builder on marked synthetic data. */
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildOperatorReport} from '../src/lib/analytics/operator-report.server';
import type {ReportQuery} from '../src/lib/analytics/report-contract';
const root=new URL('../',import.meta.url);
const runtime=JSON.parse(await readFile(new URL('.temp/analytics-local-rehearsal/runtime.json',root),'utf8'));
assert.equal(runtime.API_URL,'http://127.0.0.1:55491');
const candidatePath=process.env.ANALYTICS_REHEARSAL_MIGRATION;
const candidate=candidatePath?await readFile(new URL(candidatePath,root),'utf8'):null;
if(candidatePath)assert.ok(fileURLToPath(new URL(candidatePath,root)).startsWith(fileURLToPath(new URL('supabase/migrations/',root))));
function sqlValue(value:unknown):string {
 if(value===null)return 'NULL';
 if(typeof value==='boolean')return String(value);
 if(typeof value==='number'){assert.ok(Number.isFinite(value));return String(value);}
 if(Array.isArray(value))return `ARRAY[${value.map(sqlValue).join(',')}]::text[]`;
 assert.equal(typeof value,'string');return "'"+String(value).replaceAll("'","''")+"'";
}
const client=createClient(runtime.API_URL,runtime.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(candidate&&url.pathname.endsWith('/rpc/analytics_read_scheduled_gallery_report')){
  assert.equal(new URL(runtime.DB_URL).hostname,'127.0.0.1');
  const params=JSON.parse(String(init?.body));
  const args=Object.entries(params).map(([key,value])=>{assert.match(key,/^p_[a-z_]+$/);return `${key}=>${sqlValue(value)}`;}).join(',');
  const sql=candidate.replace(/^\s*(BEGIN|COMMIT|ROLLBACK);\s*$/gm,'');
  const output=execFileSync('/opt/homebrew/opt/postgresql@17/bin/psql',['-X','--no-psqlrc','-Atq','-v','ON_ERROR_STOP=1',runtime.DB_URL],{input:`BEGIN;\nSET LOCAL statement_timeout='10s';\n${sql}\nSET LOCAL ROLE service_role; SELECT 'REPORT_JSON:'||analytics_read_scheduled_gallery_report(${args})::text;\nROLLBACK;`,encoding:'utf8',timeout:15000,stdio:['pipe','pipe','pipe']});
  const json=output.split('\n').find(line=>line.startsWith('REPORT_JSON:'))?.slice(12);assert.ok(json);
  return new Response(json,{headers:{'content-type':'application/json'}});
 }
 return fetch(input,init);
}}});
const identity=await client.from('analytics_rehearsal_identity').select('identity').single();
assert.equal(identity.data?.identity,'photography-analytics-synthetic-v1');
const base:ReportQuery={start:'2026-09-27',end:'2026-09-27',measure:'photo_opens',scope:'all',albumKeys:[],traffic:'conservative',compare:'none'};
const cases:Array<{name:string;query:ReportQuery;rank?:'popular'|'rising'|'recent';page?:number}>=[
 {name:'audience',query:base},
 {name:'inclusive',query:{...base,traffic:'inclusive'}},
 {name:'action category',query:{...base,category:'action'}},
 {name:'unknown category',query:{...base,category:'unknown'}},
 {name:'source',query:{...base,source:'instagram'}},
 {name:'sport zero',query:{...base,sport:'basketball'}},
 {name:'event date',query:{...base,eventDate:'2026-09-20'}},
 {name:'unknown season',query:{...base,season:'unknown'}},
 {name:'selected album',query:{...base,scope:'album',albumKeys:['alpha']}},
 {name:'hidden album',query:{...base,scope:'album',albumKeys:['hidden']}},
 {name:'unavailable dates',query:{...base,start:'2026-01-01',end:'2026-01-02'}},
 {name:'previous',query:{...base,compare:'previous'}},
 {name:'unequal custom',query:{...base,compare:'custom',compareStart:'2026-09-25',compareEnd:'2026-09-26'}},
 {name:'publication age',query:{...base,scope:'album',albumKeys:['alpha'],compare:'publication_age'}}
];
for(const measure of ['photo_opens','album_opens','downloads','favorites','shares'] as const)cases.push({name:measure,query:{...base,measure}});
for(const rank of ['popular','rising','recent'] as const)for(const page of [0,1,999])cases.push({name:`bulk ${rank} ${page}`,query:{...base,start:'2026-09-28',end:'2026-09-28',scope:'album',albumKeys:['alpha'],compare:'previous'},rank,page});
const keys=['available','coverage','previousCoverage','total','observedTotal','previousTotal','change','daily','albums','photos','albumOnlyActions','sources','traffic','trafficImpact','publicationAge','photoPagination'];
function canonical(value:any):any {
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d\d:\d\d/.test(value))return new Date(value).toISOString();
 return value;
}
const results=[];
for(const item of cases){
 const started=performance.now();
 const report=await buildOperatorReport(client,item.query,{publicOnly:true,photoWindow:{page:item.page??0,pageSize:12,rank:item.rank??'popular'},includeToday:false,includeVisitorEstimate:false,includeDiagnostics:false});
 results.push({name:item.name,elapsedMs:performance.now()-started,report:canonical(Object.fromEntries(keys.map(k=>[k,(report as any)[k]])))});
}
const dir=new URL('docs/implementation/analytics-scheduled-reports-20260929/',root);
if(process.argv.includes('--record-original')){
 await writeFile(new URL('original-builder-parity.json',dir),JSON.stringify({synthetic:true,results},null,2)+'\n');
 console.log(JSON.stringify({synthetic:true,recordedCases:results.length,available:results.filter(x=>x.report.available).length}));
}else{
 const before=JSON.parse(await readFile(new URL('original-builder-parity.json',dir),'utf8'));
 const differences=[];
 const acceptedDifferences:string[]=[];
 for(const result of results){
  const original=before.results.find((x:any)=>x.name===result.name);
  const actual=structuredClone(result.report),expected=structuredClone(original.report);
  // Existing zero-activity albums omitted known catalogue publication dates.
  // SQL now returns those dates; verify each against the authoritative settings (first_published_at: album age counts from the first publication).
  for(let i=0;i<actual.albums.length;i++){
   if(actual.albums[i].publicationAt!==expected.albums[i].publicationAt){
    assert.equal(expected.albums[i].publicationAt,null);
    const read=await client.from('album_settings').select('first_published_at').eq('album_key',actual.albums[i].albumKey).single();assert.ifError(read.error);
    assert.equal(actual.albums[i].publicationAt,new Date(read.data!.first_published_at).toISOString());
    expected.albums[i].publicationAt=actual.albums[i].publicationAt;acceptedDifferences.push(result.name+': catalogue publication date');
   }
  }
  if(result.name.startsWith('bulk recent')){
   // Old code compared differently formatted timestamp strings. Check actual
   // chronological ordering against PostgreSQL, rather than copying that bug.
   const page=actual.photoPagination.page;
   const sql=`SELECT photo_id FROM analytics_daily_actions WHERE bucket_date BETWEEN '2026-09-27' AND '2026-09-28' AND album_key='alpha' AND event_type='view' AND photo_id<>'' AND traffic_classification IN ('audience','unclassified') GROUP BY photo_id ORDER BY max(latest_event_at) FILTER(WHERE bucket_date='2026-09-28') DESC NULLS LAST,coalesce(sum(action_count) FILTER(WHERE bucket_date='2026-09-28'),0) DESC,photo_id LIMIT 12 OFFSET ${page*12}`;
   const output=execFileSync('/opt/homebrew/opt/postgresql@17/bin/psql',['-X','--no-psqlrc','-Atq','-v','ON_ERROR_STOP=1',runtime.DB_URL],{input:sql,encoding:'utf8',timeout:10000});
   assert.deepEqual(actual.photos.map((p:any)=>p.photoId),output.trim().split('\n'));
   const originals=new Map(before.results.filter((x:any)=>x.name.startsWith('bulk ')).flatMap((x:any)=>x.report.photos).map((p:any)=>[p.photoId,p]));
   for(const photo of actual.photos){const old=originals.get(photo.photoId);if(old)assert.deepEqual(photo,old);}
   delete actual.photos;delete expected.photos;acceptedDifferences.push(result.name+': chronological recency verified');
  }
  try{assert.deepEqual(actual,expected);}catch(error){differences.push({name:result.name,error:String(error).slice(0,4000)});}
 }
 const receipt={synthetic:true,cases:results.length,passed:differences.length===0,acceptedDifferences,differences,results};
 await writeFile(new URL('scheduled-builder-parity.json',dir),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({synthetic:true,cases:results.length,passed:receipt.passed,differences:differences.map(x=>x.name)}));
 if(!receipt.passed)process.exitCode=1;
}
