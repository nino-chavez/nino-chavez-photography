import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {loadSiteActions,parseSiteActionReport} from './site-actions.server';

describe('stored site-action report contract',()=>{
 const currentReport={
  available:true,start:'2026-09-22',end:'2026-09-28',firstRecordedAt:'2026-09-22T01:00:00Z',excludedEvents:2,
  totals:{page_views:12,contact_clicks:2},todayTotals:{page_views:1},previousTotals:{page_views:9},
  recordedSections:['profile','writing'],page:1,pageCount:2,
  pages:[
   {path:'/about',section:'profile',measures:{page_views:8}},
   {path:'/blog/real-article',section:'writing',measures:{page_views:4,reading_90:2}}
  ],
  freshness:{status:'current',refreshedAt:'2026-09-29T12:07:00Z',summaryCutoffAt:'2026-09-29T12:07:00Z',lastFailureAt:null,todayAvailable:true,completedThrough:'2026-09-28'}
 };
 it('accepts stored totals, 8-row paging and refresh cutoff metadata',()=>{
  const report=parseSiteActionReport(currentReport);
  assert.equal(report.available,true);
  if (!report.available) return;
  assert.equal(report.page,1);
  assert.equal(report.pageCount,2);
  assert.equal(report.pages.length,2);
  assert.equal(report.freshness.summaryCutoffAt,'2026-09-29T12:07:00Z');
 });
 it('keeps an uninitialized summary explicitly unavailable instead of showing zeros',()=>{
  const report=parseSiteActionReport({available:false,reason:'Action summaries have not completed their first refresh. This is not a report of zero activity.'});
  assert.deepEqual(report,{available:false,reason:'Action summaries have not completed their first refresh. This is not a report of zero activity.'});
 });
 it('preserves an initialized but stale summary and its last successful cutoff',()=>{
  const report=parseSiteActionReport({...currentReport,freshness:{status:'stale',refreshedAt:'2026-09-29T11:37:00Z',summaryCutoffAt:'2026-09-29T11:37:00Z',lastFailureAt:'2026-09-29T12:07:00Z',todayAvailable:true,completedThrough:'2026-09-28'}});
  assert.equal(report.available,true);
  if (!report.available) return;
  assert.equal(report.freshness.status,'stale');
  assert.equal(report.freshness.summaryCutoffAt,'2026-09-29T11:37:00Z');
 });
 it('rejects malformed summary data rather than treating it as a measured zero',()=>{
  const report=parseSiteActionReport({...currentReport,pages:[{path:'/about',section:'profile',measures:{page_views:-1}}]});
  assert.equal(report.available,false);
  if (!report.available) assert.match(report.reason,/invalid response/);
 });
 it('keeps today unavailable when the most recent snapshot is from yesterday',()=>{
  const report=parseSiteActionReport({...currentReport,todayTotals:{},freshness:{...currentReport.freshness,todayAvailable:false}});
  assert.equal(report.available,true);
  if(report.available) assert.equal(report.freshness.todayAvailable,false);
 });
 it('returns unavailable when the RPC itself fails',async()=>{
  const client={rpc:async()=>({data:null,error:{message:'database unavailable'}})} as never;
  const report=await loadSiteActions(client,7,'profile',0);
  assert.equal(report.available,false);
  if (!report.available) assert.match(report.reason,/not a report of zero activity/);
 });
});
