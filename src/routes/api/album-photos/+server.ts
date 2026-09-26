import { json } from '@sveltejs/kit';
import { fetchAlbumPhotosForDownload, fetchPhotos, ALBUM_PHOTO_SORT } from '$lib/supabase/server';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { isValidAlbumKey } from '$lib/albums/album-key';
import { ALBUM_PHOTO_PAGE_SIZE } from '$lib/albums/pagination';
import type { RequestHandler } from './$types';

const PAGE_SIZE = ALBUM_PHOTO_PAGE_SIZE;

// Album reads are public and change only on ingest (ADR 0001), so they're edge-cacheable.
// These headers let the CF edge cache the response (via a Cache Rule) and let browsers cache it;
// ingest purges the zone on publish so freshness isn't TTL-bound. NOTE: a code-level Cache API
// layer was tried and reverted (it 500'd in the Pages runtime) — edge caching is to be enabled
// via a Cache Rule / a properly wrangler-dev-tested layer, not ad hoc here.
const CACHE_HEADERS = { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=86400' };

// An empty result is NOT cached. Only a real album's photos are worth an entry, and there are 262
// of those; an empty answer means the key matched no album, and caching those lets any sequence of
// well-formed guesses fill a shared cache that this project cannot purge (see
// og-cache-ttl-bounds-privacy: router subrequests cache under pages.dev). `private` also keeps the
// response out of shared caches entirely rather than merely shortening its life there.
const NO_CACHE_HEADERS = { 'cache-control': 'private, no-store' };

// GET /api/album-photos?albumKey=...
//
// Two modes, keyed off the `page` param:
//
// 1. No `page` (legacy): returns the full download manifest
//    (cf_image_id + image_key only) consumed by BulkDownloadButton — on the album page and on
//    /share/[token], and by the ZIP worker, which fetches this endpoint rather than holding a
//    database credential of its own (cloudflare-worker/album-zip/src/manifest.ts).
//
// 2. With `page`: returns a single page of full Photo rows so an album lightbox can load
//    the next page client-side without closing. No count is returned — the client gets
//    totalCount once from its own SSR page load (albums_summary.photo_count for the public
//    album page; the share loader's own count for /share/[token]) and only consumes `photos`
//    here. Both the public album page (`[slug]/+page.svelte` fetchPage) and the share page
//    (`share/[token]/+page.svelte` fetchPage) use ALBUM_PHOTO_SORT and ALBUM_PHOTO_PAGE_SIZE,
//    so the accumulated list stays contiguous across either caller.
export const GET: RequestHandler = async ({ url }) => {
	const albumKey = url.searchParams.get('albumKey');

	// Shape-check before the query, matching /api/zip-url. Both endpoints take the same field from
	// the same callers; only one of them checked it. See $lib/albums/album-key.
	if (!isValidAlbumKey(albumKey)) {
		return json({ error: 'Missing or invalid albumKey' }, { status: 400, headers: NO_CACHE_HEADERS });
	}

	// Single-album-by-key reads serve shared UNLISTED albums too: BulkDownloadButton renders on
	// /share/[token] and fetches the manifest below. photo_metadata RLS gates unlisted rows from the
	// anon client, so read with service_role — consistent with the worker zip path. Album-key
	// scoping (not visibility) is the intended boundary for single-album endpoints, and the key is
	// the capability; /api/zip-url documents the same contract.
	//
	// Mode 2 (page mode) has two callers as of the share-lightbox fix: the public album page
	// (`/albums/[slug]`) and the share page (`/share/[token]`), whose own SSR load already pages
	// through the same `fetchPhotos({ albumKey, ... })` call — its lightbox reuses this endpoint
	// for pages beyond the one it rendered server-side. Both are single-album-by-key reads, so the
	// service_role client here is exactly as scoped for one caller as the other.
	const admin = createSupabaseAdminClient();

	const pageParam = url.searchParams.get('page');
	if (pageParam === null) {
		// Legacy download-manifest mode.
		const photos = await fetchAlbumPhotosForDownload(albumKey, admin);
		return json({ photos }, { headers: photos.length ? CACHE_HEADERS : NO_CACHE_HEADERS });
	}

	// Paginated mode for cross-page lightbox navigation.
	const page = Math.max(1, parseInt(pageParam || '1'));
	const photos = await fetchPhotos(
		{
			albumKey,
			sortBy: ALBUM_PHOTO_SORT,
			limit: PAGE_SIZE,
			offset: (page - 1) * PAGE_SIZE
		},
		admin
	);

	return json({ photos, page }, { headers: photos.length ? CACHE_HEADERS : NO_CACHE_HEADERS });
};
