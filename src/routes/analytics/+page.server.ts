/**
 * Analytics Dashboard - Server Loader
 *
 * Displays popular photos, search analytics, and view statistics
 */

import { base } from '$app/paths';
import { redirect, error } from '@sveltejs/kit';
import { getPopularPhotos, getTopSearchQueries } from '$lib/analytics/tracker';
import { PHOTOS_READ } from '$lib/supabase/columns';
import { supabaseServer, matviewClient } from '$lib/supabase/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { isAllowedAdmin } from '$lib/server/admin-auth';
import { cfImageUrl } from '$lib/utils/cloudflare-images';
import type { PageServerLoad } from './$types';

// Internal dashboard: raw event reads use the service-role client because
// engagement_events is RLS-locked from anon (writes are service-role only).
const SINCE_30D = () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

export const load: PageServerLoad = async ({ cookies }) => {
	// Internal dashboard — gate behind auth (reads RLS-locked engagement data via service_role).
	const supabase = createSupabaseServerClient(cookies);
	const {
		data: { user }
	} = await supabase.auth.getUser();
	if (!user) {
		throw redirect(302, `${base}/login`);
	}
	if (!isAllowedAdmin(user.email)) {
		throw error(403, 'Admin access required');
	}

	// Get popular photos with full metadata
	const popularPhotoIds = await getPopularPhotos(20);

	// Fetch full photo data for popular photos
	const photoIds = popularPhotoIds.map((p) => p.photo_id);
	let popularPhotos: Array<{ photo_id: string; view_count: number; image_key: string; thumbnail_url: string; photo_category: string }> = [];

	if (photoIds.length > 0) {
		const { data } = await supabaseServer
			.from(PHOTOS_READ)
			.select('photo_id, image_key, cf_image_id, sport_type, photo_category')
			.in('photo_id', photoIds);

		// Merge with view counts
		popularPhotos =
			data?.map((photo) => {
				const stats = popularPhotoIds.find((p) => p.photo_id === photo.photo_id);
				return {
					photo_id: photo.photo_id,
					image_key: photo.image_key,
					thumbnail_url: cfImageUrl(photo.cf_image_id, 'thumbnail'),
					photo_category: photo.photo_category,
					view_count: stats?.views || 0,
				};
			}) || [];
	}

	// Get recent search queries
	const recentSearches = await getTopSearchQueries(20);

	// Get view source distribution
	const { data: viewSourceData } = await createSupabaseAdminClient()
		.from('engagement_events')
		.select('source')
		.eq('event_type', 'view')
		.gte('created_at', SINCE_30D());

	const viewSourceCounts = (viewSourceData || []).reduce(
		(acc, { source }) => {
			const key = source || 'direct';
			acc[key] = (acc[key] || 0) + 1;
			return acc;
		},
		{} as Record<string, number>
	);

	// Get total stats
	const { count: totalViews } = await createSupabaseAdminClient()
		.from('engagement_events')
		.select('*', { count: 'exact', head: true })
		.eq('event_type', 'view')
		.gte('created_at', SINCE_30D());

	const { count: totalSearches } = await supabaseServer
		.from('search_queries')
		.select('*', { count: 'exact', head: true })
		.gte('searched_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

	// Album reach: unique visitors + event breakdown per album, last 30 days.
	// Reads album_engagement_30d (view, service-role — see migration
	// 20260709120000_analytics_reach_views.sql) and resolves names off
	// albums_summary. Degrades to an empty array if the view read fails (e.g.
	// the migration hasn't landed yet) — this dashboard must never 500.
	let albumReach: Array<{
		album_key: string;
		album_name: string | null;
		unique_visitors: number;
		views: number;
		favorites: number;
		downloads: number;
		shares: number;
		last_event: string;
	}> = [];

	try {
		const { data: reachRows, error: reachError } = await createSupabaseAdminClient()
			.from('album_engagement_30d')
			.select('album_key, unique_visitors, views, favorites, downloads, shares, last_event')
			.order('unique_visitors', { ascending: false })
			.limit(20);
		if (reachError) throw reachError;

		const albumKeys = (reachRows || []).map((row) => row.album_key);
		let albumNames: Record<string, string> = {};

		if (albumKeys.length > 0) {
			// albums_summary is a materialized view, anon-revoked (lint 0016) —
			// read via matviewClient() (service_role), not supabaseServer.
			const { data: albumsData } = await matviewClient()
				.from('albums_summary')
				.select('album_key, album_name')
				.in('album_key', albumKeys);

			albumNames = (albumsData || []).reduce((acc, { album_key, album_name }) => {
				if (album_name) acc[album_key] = album_name;
				return acc;
			}, {} as Record<string, string>);
		}

		albumReach = (reachRows || []).map((row) => ({
			...row,
			album_name: albumNames[row.album_key] ?? null,
		}));
	} catch (err) {
		console.error('[Analytics] Failed to load album reach:', err);
	}

	// Zero-result searches: the demand signal for missing content/tagging, last 30 days.
	let zeroResultSearches: Array<{ query_text: string; searches: number; last_searched: string }> = [];

	try {
		const { data, error: zeroError } = await createSupabaseAdminClient()
			.from('zero_result_searches_30d')
			.select('query_text, searches, last_searched')
			.order('searches', { ascending: false })
			.limit(20);
		if (zeroError) throw zeroError;
		zeroResultSearches = data || [];
	} catch (err) {
		console.error('[Analytics] Failed to load zero-result searches:', err);
	}

	return {
		popularPhotos,
		recentSearches,
		albumReach,
		zeroResultSearches,
		stats: {
			totalViews: totalViews || 0,
			totalSearches: totalSearches || 0,
			viewSourceCounts,
		},
	};
};
