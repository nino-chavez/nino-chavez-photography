/**
 * Album OG image — /albums/[slug]/og.png
 *
 * 1200×630 branded share card for an album: the cover photo with a gold accent
 * bar, album name, photo count, and the wordmark. Falls back to a gradient brand
 * card (still named) when the album has no Cloudflare cover image.
 */

import { error } from '@sveltejs/kit';
import { ImageResponse } from '@cf-wasm/og';
import { supabaseServer, getPhotoCount } from '$lib/supabase/server';
import { extractAlbumKey } from '$lib/utils';
import { hasCFImage } from '$lib/utils/cloudflare-images';
import { buildAlbumCard, fetchImageDataUri, OG_WIDTH, OG_HEIGHT, OG_CACHE_CONTROL } from '$lib/server/og-card';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const albumKey = extractAlbumKey(params.slug);

	// album metadata + processed-photo count in parallel. Use getPhotoCount (NOT
	// albums_summary.photo_count) so the card matches the album page and its
	// og:description — the view's count includes unprocessed null-sharpness rows.
	const [{ data: album }, photoCount] = await Promise.all([
		supabaseServer
			.from('albums_summary')
			.select('album_name, cover_cf_image_id, primary_sport')
			.eq('album_key', albumKey)
			.single(),
		getPhotoCount({ albumKey })
	]);

	if (!album) throw error(404, 'Album not found');

	const photoDataUri = hasCFImage(album.cover_cf_image_id)
		? await fetchImageDataUri(album.cover_cf_image_id)
		: null;

	const card = buildAlbumCard({
		albumName: album.album_name || albumKey,
		photoDataUri,
		photoCount,
		sport: album.primary_sport
	});

	return ImageResponse.async(card, {
		width: OG_WIDTH,
		height: OG_HEIGHT,
		headers: { 'cache-control': OG_CACHE_CONTROL }
	});
};
