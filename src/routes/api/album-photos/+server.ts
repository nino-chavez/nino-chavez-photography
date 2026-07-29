import { json } from '@sveltejs/kit';
import { fetchAlbumPhotosForDownload, fetchPhotos } from '$lib/supabase/server';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { isValidAlbumKey } from '$lib/albums/album-key';
import type { RequestHandler } from './$types';

const PAGE_SIZE = 48;

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
// 2. With `page`: returns a single page of full Photo rows so the album lightbox can load
//    the next page client-side. No count is returned — the client gets totalCount once from
//    the SSR page load (albums_summary.photo_count) and only consumes `photos` here (see
//    [slug]/+page.svelte fetchPage). Sort order MUST match the album page load (sortBy:
//    'newest') so the accumulated list stays contiguous.
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
	// The share page does NOT paginate through here — it pages server-side on its own route via
	// ?page= (share/[token]/+page.server.ts) — so mode 2's only caller is the public album page.
	// An earlier comment here claimed otherwise and was the stated reason mode 2 serves unlisted
	// albums; it was wrong. Left permissive because narrowing it buys nothing while mode 1 hands
	// the same visitor every cf_image_id by design, but do not cite the share lightbox for it.
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
			sortBy: 'newest',
			limit: PAGE_SIZE,
			offset: (page - 1) * PAGE_SIZE
		},
		admin
	);

	return json({ photos, page }, { headers: photos.length ? CACHE_HEADERS : NO_CACHE_HEADERS });
};
