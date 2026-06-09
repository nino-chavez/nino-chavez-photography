/**
 * Collections Page - Curated Collections
 *
 * Displays curated collections driven by the keeper score (quality_score) plus kept categorical
 * fields. Definitions + criteria live in $lib/collections (single source, shared with [slug]).
 */

import { supabaseServer } from '$lib/supabase/server';
import { PHOTOS_READ } from '$lib/supabase/columns';
import { COLLECTIONS, applyCollectionFilter } from '$lib/collections';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': 's-maxage=300, stale-while-revalidate=600' });

	// One count + cover-photo query per collection, all in flight at once.
	const collectionQueries = COLLECTIONS.map(async (collection) => {
		const query = applyCollectionFilter(
			supabaseServer
				.from(PHOTOS_READ)
				.select('photo_id, image_key, ImageUrl, ThumbnailUrl, cf_image_id', { count: 'exact' }),
			collection.slug
		);

		const { data, count } = await query.limit(1);

		return {
			...collection,
			photoCount: count || 0,
			coverPhoto: data?.[0] || null
		};
	});

	const collectionsWithPhotos = await Promise.all(collectionQueries);
	const activeCollections = collectionsWithPhotos.filter((c) => c.photoCount > 0);

	return {
		collections: activeCollections,
		stats: {
			totalCollections: activeCollections.length,
			totalPhotos: activeCollections.reduce((sum, c) => sum + c.photoCount, 0)
		}
	};
};
