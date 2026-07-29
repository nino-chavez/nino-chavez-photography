/**
 * Album OG image — /albums/[slug]/og.png
 *
 * 1200×630 branded share card for an album: the cover photo with a gold accent
 * bar, album name, photo and video counts, and the wordmark. Falls back to a
 * gradient brand card (still named) when the album has no Cloudflare cover image —
 * which is every video-only album, since covers come from processed photos.
 */

import { error } from '@sveltejs/kit';
import { ImageResponse } from '@cf-wasm/og';
import { fetchAlbumVideos, getAlbumSettings, getPhotoCount, matviewClient } from '$lib/supabase/server';
import { extractAlbumKey } from '$lib/utils';
import { hasCFImage } from '$lib/utils/cloudflare-images';
import { buildAlbumCard, fetchImageDataUri, OG_WIDTH, OG_HEIGHT, OG_CACHE_CONTROL } from '$lib/server/og-card';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const albumKey = extractAlbumKey(params.slug);

	// album metadata + processed-photo count + visibility in parallel. Use getPhotoCount
	// (NOT albums_summary.photo_count) so the card matches the album page and its
	// og:description — the view's count includes unprocessed null-sharpness rows.
	const [{ data: album }, photoCount, videos, albumSettings] = await Promise.all([
		matviewClient()
			.from('albums_summary')
			.select('album_name, cover_cf_image_id, primary_sport')
			.eq('album_key', albumKey)
			.single(),
		getPhotoCount({ albumKey }),
		fetchAlbumVideos(albumKey),
		getAlbumSettings(albumKey)
	]);

	// The SAME gate the album page applies, in the same form and with the same status.
	//
	// It was missing here, and this endpoint reads album metadata through matviewClient()
	// — service_role, which bypasses RLS. So while /albums/<key> correctly 404'd for an
	// unlisted album, /albums/<key>/og.png returned a 1200×630 card carrying that album's
	// real cover photo and name. Verified against production on 2026-07-29: two unlisted
	// client sessions answered 404 on the page and 200 with a ~1.1 MB photo card here.
	// Unlisted albums are private client work — portraits, graduations — and the share
	// route already declines to put their cover or name into an unfurl.
	//
	// 404 rather than the generic card, because the page 404s so nothing legitimately
	// links here, and a 200 would still confirm the album exists.
	//
	// Absence of a settings row means public: 242 of 262 albums have no row at all, and
	// only 'public' and 'unlisted' are in use. A FAILED read is a third case and fails
	// closed — it used to arrive as the same null this predicate reads as public, which
	// published this card for private albums in production for ~2 minutes. 404 here rather
	// than the page's 503: this endpoint's whole answer is an image, and a broken card is
	// the same non-answer as a missing one. Keep the unlisted predicate identical to the
	// page's so the two cannot drift apart.
	if (!albumSettings.ok) {
		throw error(404, 'Album not found');
	}
	if (albumSettings.settings?.visibility === 'unlisted') {
		throw error(404, 'Album not found');
	}

	// `albums_summary` only contains albums with processed photos, so a video-only album
	// has no row and this endpoint used to 404 — which meant the album page advertised an
	// og:image that did not exist and the link unfurled with no card at all. Videos carry
	// the album name, so such an album is still nameable; skip fetchAlbumVideos' own
	// 'Unknown Album' display fallback, which is not a real name.
	const videoAlbumName = videos.find(
		(v) => v.album_name && v.album_name !== 'Unknown Album'
	)?.album_name;

	if (!album && !videoAlbumName) throw error(404, 'Album not found');

	const coverId = album?.cover_cf_image_id;
	const photoDataUri = hasCFImage(coverId) ? await fetchImageDataUri(coverId) : null;

	const card = buildAlbumCard({
		albumName: album?.album_name || videoAlbumName || albumKey,
		photoDataUri,
		photoCount,
		videoCount: videos.length,
		sport: album?.primary_sport || videos[0]?.sport_type
	});

	return ImageResponse.async(card, {
		width: OG_WIDTH,
		height: OG_HEIGHT,
		headers: { 'cache-control': OG_CACHE_CONTROL }
	});
};
