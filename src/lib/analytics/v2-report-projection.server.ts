import { dateOnly, type ReportQuery } from './report-contract';
import { POSTHOG_EVENT_NAMES, type PostHogEventName, type PostHogTrafficContext } from './posthog.types';
import type { SupabaseClient } from '@supabase/supabase-js';

type V2Properties = Record<string, unknown>;

/** A deliberately identifier-free input shape for the public v2 report projection. */
export interface V2ReportEvent {
	event_name: PostHogEventName;
	occurred_at: string;
	album_key: string | null;
	photo_id: string | null;
	traffic_context: PostHogTrafficContext | 'self_excluded';
	properties: V2Properties;
}

export interface V2ReportProjection {
	available: boolean;
	coverage: {
		start: string;
		end: string;
		label: string;
		observationsRead: number;
		observationsIncluded: number;
		observationsExcluded: number;
	};
	counts: Array<{ event: PostHogEventName; label: string; count: number }>;
	albumResponse: { eligibleExposures: number; laterOpens: number; laterActions: number };
	photoResponse: { eligibleExposures: number; laterActions: number };
}

export interface V2ProjectionOptions {
	/** These are resolved from album visibility before this adapter ever aggregates. */
	publicAlbumKeys: readonly string[];
	albumFacts?: Readonly<Record<string, { sport?: string | null; eventDate?: string | null; eventType?: string | null }>>;
	photoCategories?: Readonly<Record<string, string | null | undefined>>;
}

const labels: Record<PostHogEventName, string> = {
	gallery_page_viewed: 'Gallery pages viewed', album_exposed: 'Albums exposed', album_opened: 'Albums opened',
	photo_exposed: 'Photos exposed', photo_opened: 'Photos opened', photo_rendered: 'Photos rendered', photo_load_failed: 'Photo loads failed',
	favorite_added: 'Favorites added', favorite_removed: 'Favorites removed', share_action: 'Shares',
	download_requested: 'Downloads requested', download_item_requested: 'Download items requested', download_item_prepared: 'Download items prepared',
	download_prepared: 'Downloads prepared', download_handed_off: 'Downloads handed off', download_failed: 'Downloads failed', download_cancelled: 'Downloads cancelled',
	search_submitted: 'Searches submitted', search_results_shown: 'Search results shown', search_failed: 'Searches failed',
	search_result_selected: 'Search results selected', filters_applied: 'Filters applied', experiment_exposed: 'Experiment exposures'
};

function text(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

function includesTraffic(context: PostHogTrafficContext | 'self_excluded', traffic: ReportQuery['traffic']): boolean {
	if (context === 'self_excluded' || context === 'crawler' || context === 'suspected_automation') return false;
	return traffic === 'inclusive' ? context === 'audience' || context === 'operator' || context === 'test' : context === 'audience';
}

function matchesScope(row: V2ReportEvent, query: ReportQuery, options: V2ProjectionOptions, publicAlbumKeys: Set<string>): boolean {
	if (!row.album_key || !publicAlbumKeys.has(row.album_key)) return false;
	if (query.scope !== 'all' && !query.albumKeys.includes(row.album_key)) return false;
	if (!includesTraffic(row.traffic_context, query.traffic)) return false;
	if (dateOnly(new Date(row.occurred_at)) < query.start || dateOnly(new Date(row.occurred_at)) > query.end) return false;
	const album = options.albumFacts?.[row.album_key];
	if (query.sport && (album?.sport ?? text(row.properties.album_sport) ?? 'unknown') !== query.sport) return false;
	if (query.eventDate && (album?.eventDate ?? null) !== query.eventDate) return false;
	if (query.season && (album?.eventDate?.slice(0, 4) ?? 'unknown') !== query.season) return false;
	if (query.albumEventType && (album?.eventType ?? 'unknown') !== query.albumEventType) return false;
	if (query.category && (!row.photo_id || (options.photoCategories?.[row.photo_id] ?? text(row.properties.photo_category) ?? 'unknown') !== query.category)) return false;
	if (query.source && (text(row.properties.tagged_source) ?? text(row.properties.source) ?? 'direct') !== query.source) return false;
	return true;
}

/**
 * Builds a v2-only count projection. It intentionally counts each accepted
 * observation and never applies the legacy daily fingerprint deduplication.
 * No identifiers from the input shape are returned.
 */
export function buildV2ReportProjection(rows: readonly V2ReportEvent[], query: ReportQuery, options: V2ProjectionOptions): V2ReportProjection {
	const publicAlbumKeys = new Set(options.publicAlbumKeys);
	const included = rows.filter((row) => matchesScope(row, query, options, publicAlbumKeys));
	const countFor = (event: PostHogEventName) => included.filter((row) => row.event_name === event).length;
	const count = new Map(POSTHOG_EVENT_NAMES.map((event) => [event, countFor(event)]));
	const laterAlbumActions = (count.get('favorite_added') ?? 0) + (count.get('download_requested') ?? 0);
	const laterPhotoActions = (count.get('photo_opened') ?? 0) + (count.get('favorite_added') ?? 0) + (count.get('download_requested') ?? 0);

	return {
		available: true,
		coverage: {
			start: query.start, end: query.end,
			label: 'Accepted version-2 observations linked to public albums. Each accepted observation is counted; this is not legacy daily-deduplicated reach or a people count.',
			observationsRead: rows.length, observationsIncluded: included.length, observationsExcluded: rows.length - included.length
		},
		counts: POSTHOG_EVENT_NAMES.map((event) => ({ event, label: labels[event], count: count.get(event) ?? 0 })),
		albumResponse: {
			eligibleExposures: count.get('album_exposed') ?? 0,
			laterOpens: count.get('album_opened') ?? 0,
			laterActions: laterAlbumActions
		},
		photoResponse: { eligibleExposures: count.get('photo_exposed') ?? 0, laterActions: laterPhotoActions }
	};
}

export function unavailableV2ReportProjection(query: ReportQuery): V2ReportProjection {
	return {
		available: false,
		coverage: {
			start: query.start, end: query.end,
			label: 'Accepted version-2 observations could not be read. This is not a zero-result report.',
			observationsRead: 0, observationsIncluded: 0, observationsExcluded: 0
		},
		counts: POSTHOG_EVENT_NAMES.map((event) => ({ event, label: labels[event], count: 0 })),
		albumResponse: { eligibleExposures: 0, laterOpens: 0, laterActions: 0 },
		photoResponse: { eligibleExposures: 0, laterActions: 0 }
	};
}

/** Reads accepted v2 rows on the server, then applies the public projection above. */
export async function fetchV2ReportProjection(client: SupabaseClient, query: ReportQuery, options: V2ProjectionOptions): Promise<V2ReportProjection> {
	try {
		const rows: V2ReportEvent[] = [];
		const first = new Date(`${query.start}T00:00:00Z`); first.setUTCDate(first.getUTCDate() - 1);
		const last = new Date(`${query.end}T00:00:00Z`); last.setUTCDate(last.getUTCDate() + 2);
		for (let from = 0; ; from += 1000) {
			const { data, error } = await client.from('analytics_events_v2')
				.select('event_name, occurred_at, album_key, photo_id, traffic_context, properties')
				.gte('occurred_at', first.toISOString()).lt('occurred_at', last.toISOString())
				.order('occurred_at', { ascending: true }).range(from, from + 999);
			if (error) throw error;
			rows.push(...((data ?? []) as V2ReportEvent[]));
			if ((data ?? []).length < 1000) return buildV2ReportProjection(rows, query, options);
		}
	} catch (cause) {
		console.error('[analytics v2 report] unavailable:', cause);
		return unavailableV2ReportProjection(query);
	}
}
