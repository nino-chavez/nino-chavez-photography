/**
 * Analytics Dashboard - Server Loader
 *
 * Displays popular photos, search analytics, and view statistics
 */

import { getPopularPhotos, getTopSearchQueries } from '$lib/analytics/tracker';
import { PHOTOS_READ } from '$lib/supabase/columns';
import { supabaseServer } from '$lib/supabase/server';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { cfImageUrl } from '$lib/utils/cloudflare-images';
import type { PageServerLoad } from './$types';

// Internal dashboard: raw event reads use the service-role client because
// engagement_events is RLS-locked from anon (writes are service-role only).
const SINCE_30D = () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

export const load: PageServerLoad = async () => {
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

	return {
		popularPhotos,
		recentSearches,
		stats: {
			totalViews: totalViews || 0,
			totalSearches: totalSearches || 0,
			viewSourceCounts,
		},
	};
};
