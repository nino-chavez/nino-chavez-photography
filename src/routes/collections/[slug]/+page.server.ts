/**
 * Collection Detail Page - Server Loader
 *
 * Loads the full photo set for a curated collection. Definitions + criteria live in
 * $lib/collections (single source, shared with the index page).
 */

import { error } from '@sveltejs/kit';
import { PHOTOS_READ } from '$lib/supabase/columns';
import { supabaseServer, transformPhotoRow, PHOTO_COLUMNS } from '$lib/supabase/server';
import { getCollection, applyCollectionFilter } from '$lib/collections';
import type { PageServerLoad } from './$types';
import type { Photo } from '$types/photo';

export const load: PageServerLoad = async ({ params, url, setHeaders }) => {
	setHeaders({ 'cache-control': 's-maxage=300, stale-while-revalidate=600' });

	const { slug } = params;
	const collectionDef = getCollection(slug);
	if (!collectionDef) {
		throw error(404, 'Collection not found');
	}

	const page = parseInt(url.searchParams.get('page') || '1');
	const pageSize = 24;
	const offset = (page - 1) * pageSize;

	const query = applyCollectionFilter(
		supabaseServer.from(PHOTOS_READ).select(PHOTO_COLUMNS, { count: 'exact' }),
		slug
	);

	const { data, count } = await query.range(offset, offset + pageSize - 1);
	const photos: Photo[] = (data || []).map(transformPhotoRow);
	const totalCount = count || 0;

	return {
		collection: {
			...collectionDef,
			photoCount: totalCount
		},
		photos,
		totalCount,
		currentPage: page,
		pageSize,
		hasMore: totalCount > page * pageSize
	};
};
