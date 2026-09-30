import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchScheduledGalleryReport } from './scheduled-gallery-report.server';
import { loadSiteActions } from './site-actions.server';
import type { JourneyAggregate } from './posthog.types';
import type { SiteJourneyRow } from './site-journeys.server';
import type { IntelligenceScope } from './intelligence-contract';
import type { IntelligenceRuleInput } from './intelligence-rules';

export type IntelligenceJourneyContext = { gallery?: JourneyAggregate[]; site?: SiteJourneyRow[] };
const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const totals = (journeys: JourneyAggregate[] | undefined, name: JourneyAggregate['report']): Record<string, number | null> | null => {
	const match = journeys?.find((journey) => journey.report === name && journey.available);
	return match?.totals ?? null;
};
const number = (values: Record<string, number | null> | null, name: string) => values ? count(values[name]) : null;
function allCounts(...values: Array<number | null>): boolean { return values.every((value) => value !== null); }

/**
 * Converts fixed, aggregate report payloads into rule inputs. This boundary is
 * deliberately provider-free: scheduled jobs pass validated bounded journeys and
 * this function only reads their stored report counterparts.
 */
export async function loadIntelligenceEvidence(
	client: SupabaseClient,
	scope: IntelligenceScope,
	now = new Date(),
	journeys: IntelligenceJourneyContext = {}
): Promise<IntelligenceRuleInput> {
	if (scope.kind === 'gallery') {
		const report = await fetchScheduledGalleryReport(client, scope.query, {
			publicOnly: true, includeToday: false, photoWindow: { page: 0, pageSize: 100, rank: 'popular' }
		});
		const discovery = totals(journeys.gallery, 'discovery');
		const search = totals(journeys.gallery, 'search_usefulness');
		const download = totals(journeys.gallery, 'download_reliability');
		const response = totals(journeys.gallery, 'photo_response');
		const distributionJourney = journeys.gallery?.find((journey) => journey.report === 'sources_return' && journey.available);
		const exposed = number(discovery, 'album_exposed_visits'); const opened = number(discovery, 'album_opened_after_exposure'); const direct = number(discovery, 'direct_album_open_visits');
		const searches = number(search, 'searches_shown'); const empty = number(search, 'zero_result_searches'); const selections = number(search, 'selected_searches');
		const requests = number(download, 'requests'); const failed = number(download, 'failed'); const unknownTerminal = number(download, 'unknown_terminal_outcome'); const handedOff = number(download, 'handed_off');
		const exposures = number(response, 'eligible_photo_exposures'); const responses = number(response, 'later_photo_actions');
		const sourceRows = distributionJourney?.breakdown ?? [];
		const taggedArrivals = sourceRows.reduce((total, row) => total + row.tagged_arrival_visits, 0);
		const laterActions = sourceRows.reduce((total, row) => total + row.subsequent_album_open_visits + row.subsequent_photo_open_visits + row.subsequent_download_request_visits + row.subsequent_favorite_visits, 0);
		const payload = report as unknown as { albums: Array<{ albumKey: string }>; photos: Array<{ photoId: string; albumKey: string; imageUrl?: string | null }>; publicationAge: { missingAlbumKeys: string[] } };
		return {
			scope, generatedAt: now.toISOString(), cutoff: report.dataAsOf, coverage: report.coverage, previousCoverage: report.previousCoverage,
			current: report.total, previous: report.previousTotal,
			eligibility: 'public eligible gallery actions; conservative traffic excludes known non-audience traffic',
			...(allCounts(exposed, opened, direct) ? { discovery: { exposures: exposed as number, opens: opened as number, directEntries: direct as number } } : {}),
			...(allCounts(searches, empty, selections) ? { search: { searches: searches as number, empty: empty as number, errors: 0, selections: selections as number } } : {}),
			...(allCounts(requests, failed, unknownTerminal, handedOff) ? { download: { requests: requests as number, failed: failed as number, unknownTerminal: unknownTerminal as number, handedOff: handedOff as number } } : {}),
			// The fixed query provides an aggregate denominator. It never attributes
			// that denominator to a particular photo unless a future fixed query does.
			...(allCounts(exposures, responses) ? { linkedPhotoResponse: [{ exposures: exposures as number, responses: responses as number }] } : {}),
			...(sourceRows.length > 0 ? { distribution: { taggedArrivals, laterActions, sources: sourceRows.length } } : {}),
			catalogue: { eligibleAlbums: payload.albums.length, eligiblePhotos: payload.photos.length, missingAlbumFacts: payload.publicationAge.missingAlbumKeys.length }
		};
	}
	const report = await loadSiteActions(client, scope.period, scope.section, 0);
	if (!report.available) return { scope, generatedAt: now.toISOString(), cutoff: null, coverage: 'unavailable', previousCoverage: 'unavailable', current: null, previous: null, eligibility: 'identifier-free stored site action summaries' };
	const complete = report.freshness.status === 'current' && !!report.firstRecordedAt && report.start <= report.end;
	const row = scope.section === 'all' ? undefined : journeys.site?.find((item) => item.section === scope.section);
	const siteJourney = row && (scope.section === 'profile'
		? { views: row.views, actions: row.contactViews, completed: 0, kind: 'profile' as const }
		: scope.section === 'writing'
			? { views: row.articleViews, actions: 0, completed: row.progressViews, kind: 'writing' as const }
			: scope.section === 'demos'
				? { views: row.demoViews, actions: 0, completed: row.lastSectionViews, kind: 'demos' as const }
				: undefined);
	return {
		scope, generatedAt: now.toISOString(), cutoff: report.freshness.summaryCutoffAt,
		coverage: complete ? 'complete' : 'partial', previousCoverage: complete ? 'complete' : 'partial',
		// Site metrics have different units. Momentum deliberately uses page views
		// only; it never adds clicks, progress, and demo events together.
		current: count(report.totals.page_views), previous: count(report.previousTotals.page_views),
		eligibility: 'identifier-free UTC complete-day page views; same-view journeys require opted-in linked page-view evidence',
		...(siteJourney ? { siteJourney } : {}),
		catalogue: { eligibleAlbums: 0, eligiblePhotos: 0, missingAlbumFacts: 0 }
	};
}
