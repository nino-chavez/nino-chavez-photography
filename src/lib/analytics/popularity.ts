import type { SupabaseClient } from '@supabase/supabase-js';
import type { Photo } from '$types/photo';
import { transformPhotoRow } from '$lib/supabase/server';

export type PopularityMetric = 'trending' | 'all_time';

/**
 * Top photos by popularity, hydrated to Photo[] for PhotoCard.
 *
 * - metric: 'trending' (time-decayed) or 'all_time' (rolling retained window).
 * - albumKey: scope to one album ("popular in this album"); omit for global.
 * - Excludes unlisted-album photos (public-surface privacy gate) and photos
 *   with no cf_image_id. Over-fetches the ranking so enough survive filtering,
 *   then preserves rank order. Returns [] on empty so the rail can hide itself.
 */
export async function getTopPhotos(
	client: SupabaseClient,
	opts: { metric?: PopularityMetric; albumKey?: string; limit?: number } = {}
): Promise<Photo[]> {
	const { metric = 'trending', albumKey, limit = 12 } = opts;
	const scoreCol = metric === 'all_time' ? 'all_time_score' : 'trending_score';

	// 1. Rank photo_ids by the chosen score. Over-fetch to survive filtering.
	let albumIds: string[] | null = null;
	if (albumKey) {
		const { data: albumPhotos } = await client
			.from('photo_metadata')
			.select('photo_id')
			.eq('album_key', albumKey);
		albumIds = (albumPhotos ?? []).map((r) => r.photo_id);
		if (!albumIds.length) return [];
	}

	let rankQuery = client
		.from('photo_popularity')
		.select(`photo_id, ${scoreCol}`)
		.order(scoreCol, { ascending: false, nullsFirst: false })
		.limit(limit * 4);
	if (albumIds) rankQuery = rankQuery.in('photo_id', albumIds);

	const { data: ranked, error } = await rankQuery;
	if (error || !ranked?.length) return [];
	const orderedIds = ranked.map((r) => r.photo_id);

	// 2. Unlisted-album exclusion (don't surface private albums publicly).
	const { data: unlisted } = await client
		.from('album_settings')
		.select('album_key')
		.eq('visibility', 'unlisted');
	const unlistedKeys = new Set((unlisted ?? []).map((r) => r.album_key));

	// 3. Hydrate metadata, drop unlisted / unrenderable, preserve rank order.
	const { data: rows } = await client
		.from('photo_metadata')
		.select('*')
		.in('photo_id', orderedIds)
		.not('cf_image_id', 'is', null);
	if (!rows?.length) return [];

	const byId = new Map(rows.map((r) => [r.photo_id, r]));
	return orderedIds
		.map((id) => byId.get(id))
		.filter((row): row is NonNullable<typeof row> => !!row && !unlistedKeys.has(row.album_key))
		.slice(0, limit)
		.map((row) => transformPhotoRow(row));
}
