import type { SiteSection } from './site-traffic';
export const SITE_ACTION_METRICS = [
 {key:'page_views',label:'Pages viewed',help:'Visible public pages. Separate from Cloudflare page loads.'},
 {key:'contact_clicks',label:'Contact links clicked',help:'Email or phone links opened. This is not a submitted inquiry.'},
 {key:'external_clicks',label:'Outbound links clicked',help:'Links leading to another site. No destination or contact values are stored.'},
 {key:'reading_90',label:'90% of article reached',help:'The viewport reached 90% of an article. This does not prove it was read.'},
 {key:'active_30',label:'30 seconds with article',help:'An article was on screen in a visible, focused tab for at least 30 seconds.'},
 {key:'demo_last_section',label:'Last demo section reached',help:'The last chapter appeared on screen. This does not prove every chapter was visited.'}
] as const;
export type SiteActionMetric = typeof SITE_ACTION_METRICS[number]['key'];
export type SiteActionFreshness = {
 status:'current'|'stale';
 refreshedAt:string;
 summaryCutoffAt:string;
 lastFailureAt:string|null;
 todayAvailable:boolean;
 completedThrough:string;
};
export type SiteActionReport = {available:true; start:string;end:string;firstRecordedAt:string|null;excludedEvents:number;totals:Partial<Record<SiteActionMetric,number>>;todayTotals:Partial<Record<SiteActionMetric,number>>;previousTotals:Partial<Record<SiteActionMetric,number>>;recordedSections:SiteSection[];page:number;pageCount:number;pages:Array<{path:string;section:SiteSection;measures:Partial<Record<SiteActionMetric,number>>}>;freshness:SiteActionFreshness} | {available:false;reason:string};
