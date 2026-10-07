import { unsupportedProviderScope } from './intelligence-assistant';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { JourneyAggregate } from './posthog.types';
import type { GalleryDecisionEvidence } from './posthog-queries.server';
import type { SiteJourneyRow } from './site-journeys.server';
import type { IntelligenceScope } from './intelligence-contract';
import type { IntelligenceRuleInput } from './intelligence-rules';
import { loadLaunchEvidence, type LaunchEvidenceLoaders } from './launch-evidence.server';
import { chicagoWallTimeToUtc } from './intelligence-schedule';

export type IntelligenceJourneyContext = { gallery?: JourneyAggregate[]; site?: SiteJourneyRow[]; decision?: GalleryDecisionEvidence };
type GalleryReport = { dataAsOf: string | null; coverage: IntelligenceRuleInput['coverage']; previousCoverage: IntelligenceRuleInput['coverage']; total: number | null; previousTotal: number | null; photos: unknown[]; publicationAge: { missingAlbumKeys: string[] }; albums: Array<{ albumKey: string; count: number | null; previousCount: number | null; publicationAt?: string | null }> };
type SiteReport = Awaited<ReturnType<typeof import('./site-actions.server').loadSiteActions>>;
type EvidenceLoaders = { launch?: LaunchEvidenceLoaders; diagnostics?: (client: SupabaseClient, now: Date) => Promise<IntelligenceRuleInput['diagnostics']>; galleryReport?: (client: SupabaseClient, scope: Extract<IntelligenceScope, { kind: 'gallery' }>) => Promise<GalleryReport>; siteReport?: (client: SupabaseClient, scope: Extract<IntelligenceScope, { kind: 'sites' }>) => Promise<SiteReport> };
async function scheduledGalleryReport(client: SupabaseClient, scope: Extract<IntelligenceScope, { kind: 'gallery' }>): Promise<GalleryReport> {
	const { fetchScheduledGalleryReport } = await import('./scheduled-gallery-report.server');
	return fetchScheduledGalleryReport(client, scope.query, { publicOnly: true, includeToday: false, photoWindow: { page: 0, pageSize: 100, rank: 'popular' } });
}
async function scheduledSiteReport(client: SupabaseClient, scope: Extract<IntelligenceScope, { kind: 'sites' }>): Promise<SiteReport> {
	const { loadSiteActions } = await import('./site-actions.server');
	return loadSiteActions(client, scope.period, scope.section, 0);
}

export async function collectionDiagnostics(client: SupabaseClient, now: Date): Promise<IntelligenceRuleInput['diagnostics']> {
 const {data,error} = await client.rpc('analytics_posthog_delivery_health');
 if (error || !data || typeof data !== 'object' || Array.isArray(data)) return [{type:'delivery_health_unavailable',status:'failed',count:1}];
 const row=data as Record<string,unknown>; const diagnostics: NonNullable<IntelligenceRuleInput['diagnostics']>=[];
 if(count(row.failed)===null || count(row.pending)===null) return [{type:'delivery_health_unavailable',status:'failed',count:1}];
 const failed=count(row.failed); if(failed !== null && failed > 0) diagnostics.push({type:'provider_delivery_failures',status:'failed',count:failed});
 const pending=count(row.pending); const oldest=typeof row.oldest_pending_at === 'string' ? Date.parse(row.oldest_pending_at) : NaN;
 if(pending !== null && pending > 0 && Number.isFinite(oldest) && now.getTime()-oldest > 30*60_000) diagnostics.push({type:'provider_delivery_overdue',status:'failed',count:pending});
 return diagnostics;
}
const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const totals = (journeys: JourneyAggregate[] | undefined, name: JourneyAggregate['report']): Record<string, number | null> | null => journeys?.find((journey) => journey.report === name && journey.available)?.totals ?? null;
const number = (values: Record<string, number | null> | null, name: string) => values ? count(values[name]) : null;
const date = (value: string): Date | null => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) ? new Date(`${value}T12:00:00Z`) : null;
const priorWindow = (start: string, end: string): { start: string; end: string } | null => {
	const first = date(start); const last = date(end);
	if (!first || !last || first > last) return null;
	const days = Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1;
	first.setUTCDate(first.getUTCDate() - days); last.setUTCDate(last.getUTCDate() - days);
	return { start: first.toISOString().slice(0, 10), end: last.toISOString().slice(0, 10) };
};
const siteLink = (period: number, section: string) => `/photography/analytics/sites?period=${period}&section=${encodeURIComponent(section)}`;
const albumLink = (scope: Extract<IntelligenceScope, { kind: 'gallery' }>, albumKey: string) => {
	const query = scope.query;
	const params = new URLSearchParams({ period: 'custom', start: query.start, end: query.end, measure: query.measure, scope: 'album', albums: albumKey, compare: query.compare, traffic: query.traffic });
	if (query.compareStart) params.set('compare_start', query.compareStart);
	if (query.compareEnd) params.set('compare_end', query.compareEnd);
	if (query.sport) params.set('sport', query.sport);
	if (query.category) params.set('category', query.category);
	if (query.source) params.set('source', query.source);
	if (query.eventDate) params.set('event_date', query.eventDate);
	if (query.season) params.set('season', query.season);
	if (query.albumEventType) params.set('event_type', query.albumEventType);
	return `/analytics/operator?${params.toString()}`;
};

/** Converts stored reports and fixed provider aggregates into decision-rule inputs. */
export async function loadIntelligenceEvidence(client: SupabaseClient, scope: IntelligenceScope, now = new Date(), journeys: IntelligenceJourneyContext = {}, loaders: EvidenceLoaders = {}): Promise<IntelligenceRuleInput> {
	if (scope.kind === 'launch') {
		const base = { scope, diagnostics: [], generatedAt: now.toISOString(), previousCoverage: null, current: null, previous: null, eligibility: 'public albums; conservative traffic counts audience and unclassified actions on complete Chicago days' };
		// A failed launch read throws, as a failed gallery report does: the job retries and the last good snapshot
		// stays current, with its own check time. Writing an empty snapshot instead would make an outage look quiet.
		const launch = await loadLaunchEvidence(client, scope.albumKey, now, loaders.launch);
		// Complete days only: the evidence is cut off at the start of the as-of Chicago day.
		return { ...base, cutoff: chicagoWallTimeToUtc(launch.today, 0, 0), coverage: 'complete', launch };
	}
	const diagnostics = await (loaders.diagnostics ?? collectionDiagnostics)(client, now);
	if (scope.kind === 'gallery') {
		const providerLimitation = unsupportedProviderScope(scope);
		if (providerLimitation) journeys = {};
		const report = await (loaders.galleryReport ?? scheduledGalleryReport)(client, scope);
		const parts=Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
		const today=`${parts.find(p=>p.type==='year')!.value}-${parts.find(p=>p.type==='month')!.value}-${parts.find(p=>p.type==='day')!.value}`;
		const yesterday=new Date(`${today}T12:00:00Z`); yesterday.setUTCDate(yesterday.getUTCDate()-1);
		if(scope.query.end===yesterday.toISOString().slice(0,10) && report.dataAsOf && now.getTime()-Date.parse(report.dataAsOf)>75*60_000) diagnostics?.push({type:'gallery_summary_overdue',status:'failed',count:1});
		const searchJourney = totals(journeys.gallery, 'search_usefulness');
		const downloadJourney = totals(journeys.gallery, 'download_reliability');
		const distributionJourney = totals(journeys.gallery, 'sources_return');
		const decision = journeys.decision?.available ? journeys.decision : undefined;
		const submitted = decision?.search ? count(decision.search.submitted) : null;
		const failures = decision?.search ? count(decision.search.failed) : null;
		const shown = number(searchJourney, 'searches_shown');
		const empty = number(searchJourney, 'zero_result_searches');
		const selections = number(searchJourney, 'selected_searches');
		const requests = number(downloadJourney, 'requests');
		const failed = number(downloadJourney, 'failed');
		const unknownTerminal = number(downloadJourney, 'unknown_terminal_outcome');
		const handedOff = number(downloadJourney, 'handed_off');
		const taggedArrivals = number(distributionJourney, 'tagged_arrival_visits');
		const favoriteVisits = number(distributionJourney, 'subsequent_favorite_visits');
		return {
			scope, diagnostics, generatedAt: now.toISOString(), cutoff: report.dataAsOf, coverage: report.coverage, previousCoverage: report.previousCoverage,
			current: report.total, previous: report.previousTotal,
			eligibility: scope.query.traffic === 'conservative' ? 'public eligible gallery actions; conservative traffic excludes known non-audience traffic' : 'public eligible gallery actions; inclusive traffic retains unclassified and suspected automation as requested',
			...(providerLimitation ? { providerLimitation } : {}),
			...(decision?.albumDiscovery.length ? { albumDiscovery: decision.albumDiscovery.map((row) => ({ ...row, evidenceLinks: [albumLink(scope, row.albumKey)] })) } : {}),
			...(decision?.photoResponses.length ? { linkedPhotoResponse: decision.photoResponses.map((row) => ({ photoId: row.photoId, albumKey: row.albumKey, exposures: row.exposures, responses: row.responses, evidenceLinks: [`/photo/${encodeURIComponent(row.photoId)}`] })) } : {}),
			...(decision?.rendering ? { rendering: { rendered: decision.rendering.rendered, failed: decision.rendering.failed, observedTerminal: decision.rendering.observedTerminal } } : {}),
			...(submitted !== null || shown !== null ? { search: { submitted, resultsShown: shown, emptyResults: empty, failures, selections } } : {}),
			...(requests !== null && failed !== null && unknownTerminal !== null && handedOff !== null ? { download: { requests, failed, unknownTerminal, handedOff } } : {}),
			...(taggedArrivals !== null && favoriteVisits !== null ? { distribution: { taggedArrivals, laterNamedAction: favoriteVisits, actionName: 'favorite-added' } } : {}),
			catalogue: { eligibleAlbums: report.albums.length, eligiblePhotos: report.photos.length, missingAlbumFacts: report.publicationAge.missingAlbumKeys.length }
		};
	}

	const report = await (loaders.siteReport ?? scheduledSiteReport)(client, scope);
	if (!report.available) return { scope, diagnostics, generatedAt: now.toISOString(), cutoff: null, coverage: 'unavailable', previousCoverage: 'unavailable', current: null, previous: null, eligibility: 'identifier-free stored site action summaries' };
	if(report.freshness.status==='stale') diagnostics?.push({type:'site_summary_overdue',status:'failed',count:1});
	const previous = priorWindow(report.start, report.end);
	const firstRecordedDate = report.firstRecordedAt?.slice(0, 10) ?? null;
	const cutoffDate = report.freshness.summaryCutoffAt.slice(0, 10);
	const currentComplete = report.freshness.status === 'current' && report.freshness.completedThrough >= report.end && cutoffDate > report.end && !!firstRecordedDate && firstRecordedDate <= report.start;
	const previousComplete = !!previous && report.freshness.status === 'current' && report.freshness.completedThrough >= report.end && cutoffDate > report.end && !!firstRecordedDate && firstRecordedDate <= previous.start;
	const rows = (scope.section === 'all' ? ['profile', 'writing', 'demos'] as const : [scope.section]).flatMap((section) => {
		const row = journeys.site?.find((item) => item.section === section);
		if (!row || (section !== 'profile' && section !== 'writing' && section !== 'demos')) return [];
		return [{ kind: section, views: section === 'profile' ? row.views : section === 'writing' ? row.articleViews : row.demoViews, actions: section === 'profile' ? row.contactViews : 0, completed: section === 'profile' ? 0 : section === 'writing' ? row.progressViews : row.lastSectionViews, evidenceLinks: [siteLink(scope.period, section)] }];
	});
	return {
		scope, diagnostics, generatedAt: now.toISOString(), cutoff: report.freshness.summaryCutoffAt,
		coverage: currentComplete ? 'complete' : 'partial', previousCoverage: previousComplete ? 'complete' : 'partial',
		current: count(report.totals.page_views), previous: count(report.previousTotals.page_views),
		eligibility: 'identifier-free UTC complete-day page views; same-view journeys require opted-in linked page-view evidence',
		...(rows.length ? { siteJourneys: rows } : {}),
		...(previous ? { siteWindows: { current: { start: report.start, end: report.end }, previous } } : {}),
		catalogue: { eligibleAlbums: 0, eligiblePhotos: 0, missingAlbumFacts: 0 }
	};
}
