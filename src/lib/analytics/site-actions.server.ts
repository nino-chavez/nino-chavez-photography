import type { SupabaseClient } from '@supabase/supabase-js';
import type { SitePeriod, SiteSection } from './site-traffic';
import { SITE_ACTION_METRICS, type SiteActionMetric, type SiteActionReport } from './site-actions';

const SECTIONS = new Set<SiteSection>(['profile','writing','demos','photography','other']);
const METRICS = new Set<SiteActionMetric>(SITE_ACTION_METRICS.map((metric) => metric.key));

function isRecord(value:unknown):value is Record<string,unknown> {
 return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonnegativeInteger(value:unknown):value is number {
 return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function metricCounts(value:unknown):Partial<Record<SiteActionMetric,number>>|null {
 if (!isRecord(value)) return null;
 const counts:Partial<Record<SiteActionMetric,number>>={};
 for (const [key,count] of Object.entries(value)) {
  if (!METRICS.has(key as SiteActionMetric) || !isNonnegativeInteger(count)) return null;
  counts[key as SiteActionMetric]=count;
 }
 return counts;
}

export function parseSiteActionReport(payload:unknown):SiteActionReport {
 if (!isRecord(payload)) return {available:false,reason:'Action summaries returned an invalid response. This is not a report of zero activity.'};
 if (payload.available === false && typeof payload.reason === 'string') return {available:false,reason:payload.reason};
 if (payload.available !== true || typeof payload.start !== 'string' || typeof payload.end !== 'string'
  || (payload.firstRecordedAt !== null && typeof payload.firstRecordedAt !== 'string')
  || !isNonnegativeInteger(payload.excludedEvents)
  || !isNonnegativeInteger(payload.page)
  || !isNonnegativeInteger(payload.pageCount) || payload.pageCount < 1 || payload.page >= payload.pageCount
  || !Array.isArray(payload.recordedSections) || !payload.recordedSections.every((section) => typeof section === 'string' && SECTIONS.has(section as SiteSection))
  || !Array.isArray(payload.pages) || payload.pages.length > 8
  || !isRecord(payload.freshness)) {
  return {available:false,reason:'Action summaries returned an invalid response. This is not a report of zero activity.'};
 }
 const totals=metricCounts(payload.totals);
 const todayTotals=metricCounts(payload.todayTotals);
 const previousTotals=metricCounts(payload.previousTotals);
 const freshness=payload.freshness;
 if (!totals || !todayTotals || !previousTotals
  || !['current','stale'].includes(String(freshness.status))
  || typeof freshness.todayAvailable !== 'boolean' || typeof freshness.completedThrough !== 'string'
  || typeof freshness.refreshedAt !== 'string' || typeof freshness.summaryCutoffAt !== 'string'
  || (freshness.lastFailureAt !== null && typeof freshness.lastFailureAt !== 'string')) {
  return {available:false,reason:'Action summaries returned an invalid response. This is not a report of zero activity.'};
 }
 const pages=[] as Array<{path:string;section:SiteSection;measures:Partial<Record<SiteActionMetric,number>>}>;
 for (const row of payload.pages) {
  if (!isRecord(row) || typeof row.path !== 'string' || !row.path.startsWith('/') || typeof row.section !== 'string' || !SECTIONS.has(row.section as SiteSection)) {
   return {available:false,reason:'Action summaries returned an invalid response. This is not a report of zero activity.'};
  }
  const measures=metricCounts(row.measures);
  if (!measures) return {available:false,reason:'Action summaries returned an invalid response. This is not a report of zero activity.'};
  pages.push({path:row.path,section:row.section as SiteSection,measures});
 }
 return {
  available:true,start:payload.start,end:payload.end,firstRecordedAt:payload.firstRecordedAt as string|null,
  excludedEvents:payload.excludedEvents,totals,todayTotals,previousTotals,
  recordedSections:payload.recordedSections as SiteSection[],page:payload.page,pageCount:payload.pageCount,pages,
  freshness:{status:freshness.status as 'current'|'stale',refreshedAt:freshness.refreshedAt,summaryCutoffAt:freshness.summaryCutoffAt,lastFailureAt:freshness.lastFailureAt as string|null,todayAvailable:freshness.todayAvailable,completedThrough:freshness.completedThrough}
 };
}

export async function loadSiteActions(client:SupabaseClient,period:SitePeriod,section:SiteSection|'all',page:number):Promise<SiteActionReport> {
 try {
  const {data,error}=await client.rpc('analytics_site_actions',{p_period:period,p_section:section,p_page:page});
  if(error || !data) throw new Error('unavailable');
  return parseSiteActionReport(data);
 } catch { return {available:false,reason:'Action records could not be read. This is not a report of zero activity.'}; }
}
