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
import { fetchAlbumVideos, getPhotoCount, matviewClient } from '$lib/supabase/server';
import { extractAlbumKey } from '$lib/utils';
import { hasCFImage } from '$lib/utils/cloudflare-images';
import { buildAlbumCard, fetchImageDataUri, OG_WIDTH, OG_HEIGHT, OG_CACHE_CONTROL } from '$lib/server/og-card';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const albumKey = extractAlbumKey(params.slug);

	// album metadata + processed-photo count in parallel. Use getPhotoCount (NOT
	// albums_summary.photo_count) so the card matches the album page and its
	// og:description — the view's count includes unprocessed null-sharpness rows.
	const [{ data: album }, photoCount, videos] = await Promise.all([
		matviewClient()
			.from('albums_summary')
			.select('album_name, cover_cf_image_id, primary_sport')
			.eq('album_key', albumKey)
			.single(),
		getPhotoCount({ albumKey }),
		fetchAlbumVideos(albumKey)
	]);

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
