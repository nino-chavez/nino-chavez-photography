import type {PostHogQueryTransport} from './posthog.types';
import {SITE_SECTIONS,type SiteSection} from './site-traffic';
import {createProviderCache,type ProviderCache} from './provider-cache.server';
export type SiteJourneyRow={section:SiteSection;views:number;contactViews:number;outboundViews:number;articleViews:number;progressViews:number;activeViews:number;demoViews:number;lastSectionViews:number};
export type SiteJourneys={available:true;rows:SiteJourneyRow[]}|{available:false;reason:string};
const siteJourneyCache=createProviderCache({ttlMs:60_000,maxEntries:32,maxInFlight:8,maxBytes:512*1024});
/** Fixed UTC query. Correlates actions only within the same opted-in page view. */
export function buildSiteJourneyQuery(start:string,end:string,section:SiteSection|'all') {
 const valid=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
 if(!valid(start)||!valid(end)||start>end||Date.parse(end)-Date.parse(start)>89*86400000||!['all',...SITE_SECTIONS.map(s=>s.key)].includes(section)) throw new Error('invalid site journey scope');
 const scope=section==='all' ? "section IN ('profile','writing','demos','photography')" : `section = '${section}'`;
 return {kind:'HogQLQuery' as const,query:`WITH corrections AS (
 SELECT toString(properties.target_event_id) AS target_id, argMax(toString(properties.classification),toIntOrZero(toString(properties.classification_version))) AS classification FROM events WHERE event='analytics_classification_changed' AND toIntOrZero(toString(properties.classification_version))>0 GROUP BY target_id
 ), candidates AS (
 SELECT toString(uuid) AS event_id,event,timestamp,toString(properties.visit_id) AS visit_id,toString(properties.view_id) AS view_id,toString(properties.site_section) AS section,toString(properties.canonical_path) AS path,toString(properties.content_kind) AS kind,toString(properties.target_kind) AS target_kind,toIntOrZero(toString(properties.threshold)) AS threshold,toIntOrZero(toString(properties.position)) AS position,toIntOrZero(toString(properties.section_count)) AS section_count
 FROM events WHERE event IN ('site_page_viewed','site_link_clicked','content_progressed','content_active_time','demo_section_viewed') AND toString(properties.schema_version)='2' AND properties.traffic_context IN ('audience','unclassified') AND properties.visit_id!='' AND properties.view_id!='' AND toDate(toTimeZone(timestamp,'UTC')) BETWEEN toDate('${start}') AND toDate('${end}')
 ), audience AS (SELECT candidates.* FROM candidates LEFT JOIN corrections ON candidates.event_id=corrections.target_id WHERE coalesce(corrections.classification,'audience') IN ('audience','unclassified')),
 views AS (SELECT section,path,visit_id,view_id,
 minOrNull(if(event='site_page_viewed',timestamp,NULL)) AS viewed_at,
 minOrNull(if(event='site_link_clicked' AND target_kind IN ('email','phone'),timestamp,NULL)) AS contact_at,
 minOrNull(if(event='site_link_clicked' AND target_kind='external',timestamp,NULL)) AS outbound_at,
 max(if(event='site_page_viewed' AND kind='article',1,0)) AS article,
 minOrNull(if(event='content_progressed' AND threshold=90,timestamp,NULL)) AS progress_at,
 minOrNull(if(event='content_active_time' AND threshold=30,timestamp,NULL)) AS active_at,
 max(if(event='site_page_viewed' AND kind='demo_story',1,0)) AS demo,
 minOrNull(if(event='demo_section_viewed' AND position=section_count AND section_count>0,timestamp,NULL)) AS last_section_at
 FROM audience WHERE ${scope} GROUP BY section,path,visit_id,view_id)
 SELECT section,countIf(viewed_at IS NOT NULL) AS views,countIf(viewed_at IS NOT NULL AND contact_at>=viewed_at) AS contact_views,countIf(viewed_at IS NOT NULL AND outbound_at>=viewed_at) AS outbound_views,countIf(viewed_at IS NOT NULL AND article=1) AS article_views,countIf(article=1 AND viewed_at IS NOT NULL AND progress_at>=viewed_at) AS progress_views,countIf(article=1 AND viewed_at IS NOT NULL AND active_at>=viewed_at) AS active_views,countIf(viewed_at IS NOT NULL AND demo=1) AS demo_views,countIf(demo=1 AND viewed_at IS NOT NULL AND last_section_at>=viewed_at) AS last_section_views FROM views GROUP BY section ORDER BY section`};
}
export async function loadSiteJourneys(transport:PostHogQueryTransport|null,start:string,end:string,section:SiteSection|'all',options:{cache?:ProviderCache|null}={}):Promise<SiteJourneys>{
 if(!transport) return {available:false,reason:'PostHog linked journeys are not configured. First-party action counts above remain available.'};
 try {
  const query=buildSiteJourneyQuery(start,end,section);
  // PostHog's cache, as the gallery reads use it. A run abandoned at the report deadline still finishes and caches,
  // so the retry collects it instead of starting over. Windows end at a completed UTC day; within one, the six-hour
  // cache only delays late events and classification corrections.
  const load=async()=>{
   const result=await transport.query({refresh:'async',query}) as {results?:unknown};
   const data=Array.isArray(result)?result:result?.results;
   if(!Array.isArray(data)||data.length>5) throw new Error('unexpected query shape');
   return data.map((row:unknown)=>{
    if(!Array.isArray(row)||row.length!==9||!SITE_SECTIONS.some(s=>s.key===row[0])||row.slice(1).some(n=>!Number.isSafeInteger(Number(n))||Number(n)<0)) throw new Error('unexpected query row');
    const [scope,views,contactViews,outboundViews,articleViews,progressViews,activeViews,demoViews,lastSectionViews]=row;
    return {section:scope as SiteSection,views:Number(views),contactViews:Number(contactViews),outboundViews:Number(outboundViews),articleViews:Number(articleViews),progressViews:Number(progressViews),activeViews:Number(activeViews),demoViews:Number(demoViews),lastSectionViews:Number(lastSectionViews)};
   });
  };
  const cache=options.cache===undefined?siteJourneyCache:options.cache;
  const rows=cache&&transport.providerCache?await cache.getOrLoad({provider:'posthog',origin:transport.providerCache.origin,account:transport.providerCache.account,credential:await transport.providerCache.credentialIdentity,operation:'site-journeys',query},load):await load();
  return {available:true,rows};
 }catch(cause){return {available:false,reason:cause instanceof Error&&cause.name==='PostHogQueryPendingError'?'PostHog linked journeys are still pending after the report deadline. This is not zero activity.':'PostHog linked journeys could not be read. This is not zero activity.'};}
}
