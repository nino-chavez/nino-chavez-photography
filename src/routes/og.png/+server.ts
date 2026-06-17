/**
 * Site OG image — /og.png
 *
 * 1200×630 branded share card for the general site (home, list pages, anything
 * without its own OG override). Charcoal + gold theme to match the live site.
 * Photo-led: pulls one high-quality hero photo when available, degrades to a
 * gradient brand card otherwise — the most-shared URL never fails to render.
 */

import { ImageResponse } from '@cf-wasm/og';
import { supabaseServer } from '$lib/supabase/server';
import { PHOTOS_READ } from '$lib/supabase/columns';
import { buildSiteCard, fetchImageDataUri, OG_WIDTH, OG_HEIGHT, OG_CACHE_CONTROL } from '$lib/server/og-card';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	let heroDataUri: string | null = null;

	try {
		// One strong, recent volleyball action frame for the hero (mirrors the
		// homepage quality gates). Best-effort — the card renders fine without it.
		const { data } = await supabaseServer
			.from(PHOTOS_READ)
			.select('cf_image_id')
			.eq('sport_type', 'volleyball')
			.gte('aspect_ratio', 1.2)
			.gte('sharpness', 8.5)
			.gte('composition_score', 8.5)
			.gte('emotional_impact', 8.5)
			.not('cf_image_id', 'is', null)
			.not('sharpness', 'is', null)
			.order('emotional_impact', { ascending: false })
			.limit(1)
			.maybeSingle();

		if (data?.cf_image_id) {
			heroDataUri = await fetchImageDataUri(data.cf_image_id as string);
		}
	} catch {
		// Ignore — fall back to the gradient brand card.
	}

	return ImageResponse.async(buildSiteCard(heroDataUri), {
		width: OG_WIDTH,
		height: OG_HEIGHT,
		headers: { 'cache-control': OG_CACHE_CONTROL }
	});
};
