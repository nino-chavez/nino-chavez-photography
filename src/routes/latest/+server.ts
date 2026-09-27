/**
 * /latest — always leads to Nino's newest public gallery.
 *
 * The route Instagram bio links and ninochavez.co/links point at, so it 302s (not 301 — the
 * target changes every time a new album publishes, and a 301 invites clients/CDNs to cache the
 * redirect itself rather than re-checking it) to that album's own page. Ranking is the one
 * function every "what's newest" surface shares — see `getRankedPublicAlbums` in
 * `$lib/supabase/server` and `rankPublicAlbums` in `$lib/albums/latest`.
 */
import { redirect, error } from '@sveltejs/kit';
import { getRankedPublicAlbums } from '$lib/supabase/server';
import { SITE_URL } from '$lib/site-url';
import { LATEST_GALLERY_CACHE_CONTROL, toLatestApiAlbum } from '$lib/albums/latest';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ setHeaders }) => {
	const result = await getRankedPublicAlbums();

	// A failed read is not "no gallery" — it's "ask again shortly". 503 (not 404, and NOT
	// cached), so nothing treats a transient DB hiccup as a permanent "there's nothing here".
	if (!result.ok) throw error(503, 'Could not look up the newest gallery. Try again shortly.');

	const [latest] = result.albums;
	// Genuinely no public album exists. Nothing to redirect to; a 302 with no Location is not a
	// real answer.
	if (!latest) throw error(404, 'No public gallery is available right now.');

	// cache-control on the REDIRECT response itself: a CDN/browser holding this for ~60s means a
	// visitor who just tapped the Instagram link a minute after a new publish still gets sent to
	// the new album, not a stale cached hop to the old one. `redirect()` carries no headers of
	// its own, so this has to go through `event.setHeaders` rather than a Response init.
	setHeaders({ 'cache-control': LATEST_GALLERY_CACHE_CONTROL });

	throw redirect(302, toLatestApiAlbum(latest, { siteUrl: SITE_URL }).url);
};
