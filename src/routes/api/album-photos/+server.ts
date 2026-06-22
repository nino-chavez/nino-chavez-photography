import { json } from '@sveltejs/kit';
import { fetchAlbumPhotosForDownload, fetchPhotos } from '$lib/supabase/server';
import type { RequestHandler } from './$types';

const PAGE_SIZE = 48;

// Album reads are public and change only on ingest (ADR 0001), so they're edge-cacheable.
// s-maxage caches at the CF POP; stale-while-revalidate serves stale while refreshing. Ingest
// purges the zone on publish (scripts/ingest-album.ts) so freshness isn't TTL-bound in practice.
const CACHE_HEADERS = { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=86400' };

// GET /api/album-photos?albumKey=...
//
// Two modes, keyed off the `page` param:
//
// 1. No `page` (legacy): returns the full download manifest
//    (cf_image_id + image_key only) consumed by BulkDownloadButton.
//
// 2. With `page`: returns a single page of full Photo rows so the album lightbox can load
//    the next page client-side. No count is returned — the client gets totalCount once from
//    the SSR page load (albums_summary.photo_count) and only consumes `photos` here (see
//    [slug]/+page.svelte fetchPage). Sort order MUST match the album page load (sortBy:
//    'newest') so the accumulated list stays contiguous.
export const GET: RequestHandler = async ({ url, platform }) => {
	const albumKey = url.searchParams.get('albumKey');

	if (!albumKey) {
		return json({ error: 'Missing albumKey' }, { status: 400 });
	}

	// Edge cache (ADR 0001): serve repeat hits — including bot crawls — from the CF Cache API
	// so they never reach Postgres. Per-POP, and undefined in local dev → guarded; degrades to
	// a direct query. Key is the full URL, so albumKey + page (or its absence) are captured.
	const cache = platform?.caches?.default;
	const cacheKey = new Request(url.toString());
	if (cache) {
		const hit = await cache.match(cacheKey);
		if (hit) return hit;
	}

	let res: Response;
	const pageParam = url.searchParams.get('page');
	if (pageParam === null) {
		// Legacy download-manifest mode.
		const photos = await fetchAlbumPhotosForDownload(albumKey);
		res = json({ photos }, { headers: CACHE_HEADERS });
	} else {
		// Paginated mode for cross-page lightbox navigation.
		const page = Math.max(1, parseInt(pageParam || '1'));
		const photos = await fetchPhotos({
			albumKey,
			sortBy: 'newest',
			limit: PAGE_SIZE,
			offset: (page - 1) * PAGE_SIZE
		});
		res = json({ photos, page }, { headers: CACHE_HEADERS });
	}

	if (cache) {
		const waitUntil = platform?.context?.waitUntil ?? platform?.ctx?.waitUntil;
		// res.clone() — the body can only be read once; the cache keeps the clone, we return res.
		if (waitUntil) waitUntil(cache.put(cacheKey, res.clone()));
		else await cache.put(cacheKey, res.clone());
	}
	return res;
};
