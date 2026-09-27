/**
 * GET /api/latest — JSON for the newest public gallery.
 *
 * Consumed by `/photography/links` (server-side, so no self-fetch — see CLAUDE.md) and by
 * anything external that wants "what's Nino's newest gallery" without following a redirect,
 * hence the explicit CORS allow. Same ranking as `/latest` and `/api/galleries/recent` —
 * `getRankedPublicAlbums` in `$lib/supabase/server`.
 */
import { json, error } from '@sveltejs/kit';
import { getRankedPublicAlbums } from '$lib/supabase/server';
import { SITE_URL, SITE_ORIGIN } from '$lib/site-url';
import { LATEST_GALLERY_CACHE_CONTROL, toLatestApiAlbum } from '$lib/albums/latest';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const result = await getRankedPublicAlbums();
	if (!result.ok) throw error(503, 'Could not look up the newest gallery. Try again shortly.');

	const [latest] = result.albums;
	if (!latest) throw error(404, 'No public gallery is available right now.');

	// Headers via the Response init, not event.setHeaders — this handler already constructs its
	// own Response (json()), so there is no ambiguity about what carries them.
	return json(toLatestApiAlbum(latest, { siteUrl: SITE_URL }), {
		headers: {
			'cache-control': LATEST_GALLERY_CACHE_CONTROL,
			'access-control-allow-origin': SITE_ORIGIN, // https://ninochavez.co
			'access-control-allow-methods': 'GET'
		}
	});
};
