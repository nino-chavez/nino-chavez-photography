import { json } from '@sveltejs/kit';
import { PHOTOS_READ } from '$lib/supabase/columns';
import { supabaseServer, transformPhotoRow, PHOTO_COLUMNS } from '$lib/supabase/server';
import { getCollection, applyCollectionFilter, COLLECTION_PHOTOS_PAGE_SIZE } from '$lib/collections';
import type { RequestHandler } from './$types';

// GET /api/collection-photos?slug=...&page=N
//
// One mode only (unlike /api/album-photos, which also serves a legacy download manifest):
// a single page of a collection's photos, for a collection detail page's lightbox to fetch
// past the page it rendered server-side (`collections/[slug]/+page.server.ts`'s own load,
// same query, same PAGE_SIZE). Anon read via supabaseServer — a curated collection has no
// unlisted-album concept the way a single album does, so there's no reason for a
// service_role client here; `applyCollectionFilter`'s own `.not('sharpness', 'is', null)`
// plus the base table's RLS are the same gates the SSR load goes through.
export const GET: RequestHandler = async ({ url }) => {
	const slug = url.searchParams.get('slug');
	if (!slug || !getCollection(slug)) {
		return json({ error: 'Missing or unknown collection slug' }, { status: 400 });
	}

	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
	const offset = (page - 1) * COLLECTION_PHOTOS_PAGE_SIZE;

	const query = applyCollectionFilter(supabaseServer.from(PHOTOS_READ).select(PHOTO_COLUMNS), slug);
	const { data, error } = await query.range(offset, offset + COLLECTION_PHOTOS_PAGE_SIZE - 1);

	if (error) {
		return json({ error: 'Failed to fetch collection photos' }, { status: 500 });
	}

	const photos = (data || []).map(transformPhotoRow);
	return json(
		{ photos, page },
		{ headers: { 'cache-control': 's-maxage=300, stale-while-revalidate=600' } }
	);
};
