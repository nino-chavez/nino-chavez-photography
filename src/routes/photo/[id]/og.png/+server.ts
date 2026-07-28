/**
 * Photo OG image — /photo/[id]/og.png
 *
 * 1200×630 share card for a single photo: the photo at its own aspect ratio in a
 * left panel, album name, sport/category/date, and the wordmark beside it.
 *
 * The photo page used to advertise the raw `thumbnail` Cloudflare variant as its
 * og:image. That variant is 150×224, under Facebook's documented 200×200 minimum,
 * so a shared photo unfurled with no image or a postage stamp — on a page whose
 * whole subject is a photograph. Albums have had a proper generated card since the
 * share-card work; photos were the last surface still handing out a raw image.
 */

import { error } from '@sveltejs/kit';
import { ImageResponse } from '@cf-wasm/og';
import { PHOTO_COLUMNS } from '$lib/supabase/columns';
import { resolvePhotoByImageKey } from '$lib/supabase/resolve-photo-by-key';
import { hasCFImage } from '$lib/utils/cloudflare-images';
import {
	buildPhotoCard,
	fetchImageDataUri,
	OG_WIDTH,
	OG_HEIGHT,
	OG_CACHE_CONTROL
} from '$lib/server/og-card';
import type { RequestHandler } from './$types';
import type { PhotoMetadataRow } from '$types/database';

export const GET: RequestHandler = async ({ params, url }) => {
	// Resolved through the shared resolver, NOT a fresh image_key query. 113 keys reach two
	// photos each, so a private lookup here would render one photo's card on the other photo's
	// URL — and nobody would ever see it, because a share card is only fetched by a crawler.
	// The resolver also rejects `/photo/null/og.png` before it costs a database round trip;
	// Facebook has /photo/null cached and re-requests it.
	const resolved = await resolvePhotoByImageKey<PhotoMetadataRow>(
		params.id,
		PHOTO_COLUMNS,
		url.searchParams.get('a')
	);

	if (!resolved) throw error(404, 'Photo not found');

	const photo = resolved.row;
	const photoDataUri = hasCFImage(photo.cf_image_id)
		? await fetchImageDataUri(photo.cf_image_id)
		: null;

	const card = buildPhotoCard({
		title: photo.album_name || 'Nino Chavez Photography',
		photoDataUri,
		sport: photo.sport_type,
		category: photo.photo_category,
		photoDate: photo.photo_date
	});

	return ImageResponse.async(card, {
		width: OG_WIDTH,
		height: OG_HEIGHT,
		headers: { 'cache-control': OG_CACHE_CONTROL }
	});
};
