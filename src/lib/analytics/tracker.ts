/**
 * Analytics Tracking Utilities
 *
 * First-party activity collection. Raw engagement uses a pseudonymous
 * browser/network fingerprint and expires after 90 days. Durable reports
 * contain action totals without that identifier; search text stays private.
 */

import { matviewClient } from '$lib/supabase/server';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { isBotUserAgent } from '$lib/analytics/bot-detection';

export interface SearchQueryEvent {
	query_text: string;
	filters_used?: Record<string, any>;
	results_count: number;
	userAgent: string;
	trafficContext?: 'audience' | 'operator' | 'test' | 'self_excluded';
}

export interface ArrivalEvent {
	albumKey?: string; // omitted for homepage arrivals (site-wide, not album-scoped)
	src: string; // channel value carried on the incoming ?src= param (see $lib/utils/share-url)
	sessionHash?: string;
	userAgent: string;
	trafficContext?: 'audience' | 'operator' | 'test' | 'self_excluded';
}

export interface CollectionDiagnosticEvent {
 userAgent?: string | null;
	type: 'search' | 'download';
	status: 'requested' | 'accepted' | 'failed' | 'completed';
	albumKey?: string;
	photoId?: string;
	source?: string;
	resultCount?: number;
	errorCode?: string;
	trafficContext?: 'audience' | 'operator' | 'test' | 'self_excluded';
}

/**
 * Keep a fire-and-forget tracking promise alive on the Workers runtime.
 *
 * On Cloudflare Pages, pending promises are cancelled when the response
 * completes unless registered via ctx.waitUntil — a floating `void promise`
 * only finishes if the isolate happens to stay warm serving other requests.
 * That silently dropped most low-traffic view tracking (~270 recorded vs ~850
 * RUM pageviews over 30 days). In local dev `platform` is undefined and the
 * promise completes normally on the Node event loop.
 */
export function keepTrackingAlive(platform: App.Platform | undefined, promise: Promise<unknown>): void {
	(platform?.context ?? platform?.ctx)?.waitUntil?.(promise);
}

/**
 * Bump the daily bot-filtered-event counter (service-role, fire-and-forget).
 * Visibility into gate volume without storing any per-request IP/UA — see
 * 20260713150000_bot_filtered_events.sql. Exported so every write path that
 * gates on isBotUserAgent (page-load tracking here, and the client-triggered
 * /api/engagement endpoint) reports to the same counter.
 */
export async function recordBotFiltered(): Promise<void> {
	try {
		const { error } = await createSupabaseAdminClient().rpc('increment_bot_filtered_count');
		if (error) console.error('[Analytics] Failed to record bot-filtered event:', error.message);
	} catch (error) {
		console.error('[Analytics] Failed to record bot-filtered event:', error);
	}
}

/**
 * Track a page arrival that carries a valid ?src= attribution param (server-side only).
 *
 * Logged as a 'view' engagement event with photo_id null, so it never competes with
 * the per-photo dedup index — it dedups instead via engagement_events_album_dedup_idx
 * (session_hash, album_key, event_type, event_day), added in the
 * 20260709121000_album_visit_dedup.sql migration. albumKey is omitted for
 * site-wide (homepage) arrivals.
 */
export async function trackArrival(event: ArrivalEvent): Promise<void> {
	if (event.trafficContext === 'self_excluded') return;
	if (isBotUserAgent(event.userAgent)) return recordBotFiltered();
	try {
		const { error: dbError } = await createSupabaseAdminClient()
			.from('engagement_events')
			.insert({
				event_type: 'view',
				photo_id: null,
			album_key: event.albumKey ?? null,
				source: event.src,
				session_hash: event.sessionHash ?? null,
				traffic_context: event.trafficContext ?? 'audience',
				source_kind: 'tagged_arrival',
			});
		if (dbError && dbError.code !== '23505') {
			console.error('[Analytics] Failed to track arrival:', dbError.message);
		}
	} catch (error) {
		// Fail silently - analytics should never break the app
		console.error('[Analytics] Failed to track arrival:', error);
	}
}

/**
 * Track a search query (server-side only)
 */
export async function trackSearchQuery(event: SearchQueryEvent): Promise<void> {
	if (event.trafficContext === 'self_excluded') return;
	if (isBotUserAgent(event.userAgent)) return recordBotFiltered();
	try {
		// The error must be read off the result, not caught: supabase-js resolves
		// rather than throws on a failed insert, so the bare `await` below used to
		// swallow every write failure. That made "no one searched" and "search
		// tracking is broken" indistinguishable from the dashboard — the panels sat
		// on July 12 data with no way to tell which. Matches trackArrival.
		const { error: dbError } = await createSupabaseAdminClient().from('search_queries').insert({
			query_text: event.query_text,
			filters_used: event.filters_used || null,
			results_count: event.results_count,
			traffic_context: event.trafficContext ?? 'audience',
		});
		if (dbError) {
			console.error('[Analytics] Failed to track search query:', dbError.message);
		}
	} catch (error) {
		// Fail silently - analytics should never break the app
		console.error('[Analytics] Failed to track search query:', error);
	}
}

/** Records report-safe collection evidence. Search text and browser identifiers never enter this table. */
export async function trackCollectionDiagnostic(event: CollectionDiagnosticEvent): Promise<void> {
	if (event.trafficContext === 'self_excluded' || isBotUserAgent(event.userAgent)) return;
	try {
		const { error: dbError } = await createSupabaseAdminClient().from('analytics_collection_diagnostics').insert({
			diagnostic_type: event.type,
			status: event.status,
			album_key: event.albumKey ?? null,
			photo_id: event.photoId ?? null,
			source: event.source ?? 'direct',
			result_count: event.resultCount ?? null,
			error_code: event.errorCode?.slice(0, 120) ?? null,
			traffic_context: event.trafficContext ?? 'audience'
		});
		if (dbError) console.error('[Analytics] Failed to record collection diagnostic:', dbError.message);
	} catch (error) {
		console.error('[Analytics] Failed to record collection diagnostic:', error);
	}
}

/**
 * Get popular photos from materialized view
 */
export async function getPopularPhotos(limit: number = 10) {
	try {
		// photo_popularity is a matview — anon grants are flaky (recreate re-grants,
		// refresh keeps the revoke), so read via matviewClient like every other
		// matview consumer (#64/#65/#66/#72). Anon reads 42501'd, which left the
		// dashboard's popular-photos panel permanently empty.
		const { data, error } = await matviewClient()
			.from('photo_popularity')
			.select('photo_id, trending_score, all_time_score, views, favorites, downloads, shares, last_event')
			.order('trending_score', { ascending: false })
			.limit(limit);

		if (error) throw error;
		return data || [];
	} catch (error) {
		console.error('[Analytics] Failed to get popular photos:', error);
		throw error;
	}
}

/**
 * Get top search queries
 */
export async function getTopSearchQueries(limit: number = 10) {
	try {
		// search_queries is written service-role and RLS-hidden from anon (reads
		// silently return zero rows) — read with the admin client to match.
		const { data, error } = await createSupabaseAdminClient()
			.from('search_queries')
			.select('query_text, filters_used, results_count, searched_at')
			.gte('searched_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Last 30 days
			.order('searched_at', { ascending: false })
			.limit(limit);

		if (error) throw error;
		return data || [];
	} catch (error) {
		console.error('[Analytics] Failed to get top search queries:', error);
		return [];
	}
}

/**
 * Get the total bot-filtered event count over the trailing N days
 */
export async function getBotFilteredCount(days: number = 30): Promise<number> {
	try {
		const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
		const { data, error } = await createSupabaseAdminClient()
			.from('bot_filtered_events')
			.select('count')
			.gte('day', since);

		if (error) throw error;
		return (data || []).reduce((sum, row) => sum + Number(row.count), 0);
	} catch (error) {
		console.error('[Analytics] Failed to get bot-filtered count:', error);
		throw error;
	}
}

/**
 * Get view count for a specific photo
 */
export async function getPhotoViewCount(photoId: string): Promise<number> {
	try {
		const { data, error } = await matviewClient()
			.from('photo_popularity')
			.select('views')
			.eq('photo_id', photoId)
			.maybeSingle();

		if (error) throw error;
		return data?.views ?? 0;
	} catch (error) {
		console.error('[Analytics] Failed to get photo view count:', error);
		return 0;
	}
}
