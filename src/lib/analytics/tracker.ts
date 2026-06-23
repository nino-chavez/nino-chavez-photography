/**
 * Analytics Tracking Utilities
 *
 * Lightweight, privacy-focused analytics
 * - No cookies, no PII
 * - Tracks aggregate data only
 */

import { supabaseServer } from '$lib/supabase/server';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';

export interface PhotoViewEvent {
	photo_id: string;
	view_source: 'explore' | 'collection' | 'album' | 'direct' | 'search' | 'timeline' | 'favorites';
	referrer?: string; // collection slug, album key, or search query
	album_key?: string; // enables album-level popularity roll-up
	session_hash?: string; // per-visitor dedup (one view per visitor/photo/day)
}

export interface SearchQueryEvent {
	query_text: string;
	filters_used?: Record<string, any>;
	results_count: number;
}

/**
 * Track a photo view (server-side only)
 */
export async function trackPhotoView(event: PhotoViewEvent): Promise<void> {
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
 * Track a search query (server-side only)
 */
export async function trackSearchQuery(event: SearchQueryEvent): Promise<void> {
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
		const { data, error } = await supabaseServer
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
		const { data, error } = await supabaseServer
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
		const { data, error } = await supabaseServer
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
