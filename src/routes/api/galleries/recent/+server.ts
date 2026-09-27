/**
 * GET /api/galleries/recent — the ~6 most recent public galleries.
 *
 * Same ranking as `/latest` and `/api/latest` (`getRankedPublicAlbums` — published_at
 * descending, falling back to capture date), just more than one row. `/photography/links`
 * reads the ranking directly (server-side, no self-fetch) rather than calling this route over
 * HTTP; this endpoint is the public-facing copy of the same list for anything external.
 */
import { json, error } from '@sveltejs/kit';
import { getRankedPublicAlbums } from '$lib/supabase/server';
import { SITE_URL, SITE_ORIGIN } from '$lib/site-url';
import { LATEST_GALLERY_CACHE_CONTROL, toLatestApiAlbum } from '$lib/albums/latest';
import type { RequestHandler } from './$types';

const RECENT_LIMIT = 6;

export const GET: RequestHandler = async () => {
	const result = await getRankedPublicAlbums();
	if (!result.ok) throw error(503, 'Could not look up recent galleries. Try again shortly.');

	// A bare array, not `{ albums: [...] }` — the contract /photography/links and any other
	// caller reads. Genuinely zero public albums is a valid answer here (an empty array), unlike
	// /latest and /api/latest, which have nothing to redirect to or describe.
	return json(
		result.albums.slice(0, RECENT_LIMIT).map((album) => toLatestApiAlbum(album, { siteUrl: SITE_URL })),
		{
			headers: {
				'cache-control': LATEST_GALLERY_CACHE_CONTROL,
				'access-control-allow-origin': SITE_ORIGIN,
				'access-control-allow-methods': 'GET'
			}
		}
	);
};
