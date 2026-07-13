/**
 * Analytics Tracking Utilities
 *
 * Lightweight, privacy-focused analytics
 * - No cookies, no PII
 * - Tracks aggregate data only
 */

import { matviewClient } from '$lib/supabase/server';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { isBotUserAgent } from '$lib/analytics/bot-detection';

export interface PhotoViewEvent {
	photo_id: string;
	view_source: 'explore' | 'collection' | 'album' | 'direct' | 'search' | 'timeline' | 'favorites';
	referrer?: string; // collection slug, album key, or search query
	album_key?: string; // enables album-level popularity roll-up
	session_hash?: string; // per-visitor dedup (one view per visitor/photo/day)
	userAgent: string; // gates the write below — crawler traffic never reaches engagement_events
}

export interface SearchQueryEvent {
	query_text: string;
	filters_used?: Record<string, any>;
	results_count: number;
	userAgent: string;
}

export interface ArrivalEvent {
	albumKey?: string; // omitted for homepage arrivals (site-wide, not album-scoped)
	src: string; // channel value carried on the incoming ?src= param (see $lib/utils/share-url)
	sessionHash?: string;
	userAgent: string;
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
 * Track a photo view (server-side only)
 */
export async function trackPhotoView(event: PhotoViewEvent): Promise<void> {
	if (isBotUserAgent(event.userAgent)) return;
	try {
		// Views feed the popularity engine (engagement_events). Service-role write
		// (RLS denies anon). The per-day dedup index makes a repeat view from the
		// same visitor a no-op (23505) — intended, so refresh/re-renders don't
		// inflate counts. Server-side only.
		const { error: dbError } = await createSupabaseAdminClient()
			.from('engagement_events')
			.insert({
				event_type: 'view',
				photo_id: event.photo_id,
				album_key: event.album_key ?? null,
				source: event.view_source,
				session_hash: event.session_hash ?? null,
			});
		if (dbError && dbError.code !== '23505') {
			console.error('[Analytics] Failed to track photo view:', dbError.message);
		}
	} catch (error) {
		// Fail silently - analytics should never break the app
		console.error('[Analytics] Failed to track photo view:', error);
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
	if (isBotUserAgent(event.userAgent)) return;
	try {
		const { error: dbError } = await createSupabaseAdminClient()
			.from('engagement_events')
			.insert({
				event_type: 'view',
				photo_id: null,
				album_key: event.albumKey ?? null,
				source: event.src,
				session_hash: event.sessionHash ?? null,
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
	if (isBotUserAgent(event.userAgent)) return;
	try {
		await createSupabaseAdminClient().from('search_queries').insert({
			query_text: event.query_text,
			filters_used: event.filters_used || null,
			results_count: event.results_count,
		});
	} catch (error) {
		// Fail silently
		console.error('[Analytics] Failed to track search query:', error);
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
		return [];
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
