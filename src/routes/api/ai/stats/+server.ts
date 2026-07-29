/**
 * AI-Friendly Statistics API
 *
 * Provides gallery statistics for AI crawlers and answer engines.
 */

import { json } from '@sveltejs/kit';
import { PHOTOS_READ } from '$lib/supabase/columns';
import type { RequestHandler } from './$types';
import { supabaseServer, getPublicGalleryTotals } from '$lib/supabase/server';
import { getSportDistribution, getCategoryDistribution } from '$lib/supabase/server';
import { ENRICHMENT_FIELDS } from '$lib/aeo/faq-copy';

export const GET: RequestHandler = async () => {
	try {
		// Get total photo count
		const { count: totalPhotos } = await supabaseServer
			.from(PHOTOS_READ)
			.select('*', { count: 'exact', head: true })
			.not('sharpness', 'is', null);

		// Album and video totals. Both come from getPublicGalleryTotals so that this endpoint,
		// ai.txt and the generated FAQ cannot disagree — this count was a head count over
		// albums_summary alone, which answered 249 for a gallery with 251 public albums (two hold
		// only videos and have no row in that view) and had no video figure at all for 481 clips.
		const totals = await getPublicGalleryTotals();

		// Get sport distribution
		const sportDistribution = await getSportDistribution();
		const sports: Record<string, number> = {};
		sportDistribution.forEach((sport) => {
			sports[sport.name] = sport.count;
		});

		// Get category distribution
		const categoryDistribution = await getCategoryDistribution();
		const categories: Record<string, number> = {};
		categoryDistribution.forEach((category) => {
			categories[category.name] = category.count;
		});

		// Get date range. Order and read the SAME column: the previous version ordered by
		// upload_date and then read photo_date off that row, which answers "when was the
		// first-uploaded photo taken?" — a different question that only happened to agree.
		const dateBound = async (ascending: boolean) => {
			const { data } = await supabaseServer
				.from(PHOTOS_READ)
				.select('photo_date')
				.not('sharpness', 'is', null)
				.not('photo_date', 'is', null)
				.order('photo_date', { ascending })
				.limit(1);
			return data?.[0]?.photo_date ?? null;
		};

		const [earliest, latest] = await Promise.all([dateBound(true), dateBound(false)]);

		return json({
			total_photos: totalPhotos || 0,
			total_videos: totals.videos,
			total_albums: totals.albums,
			sports: sports,
			categories: categories,
			date_range: {
				earliest: earliest || null,
				latest: latest || null
			},
			ai_enriched: true,
			// Was a hardcoded 12, which counted six categorical columns (composition, time_of_day,
			// lighting, color_temperature, emotion, action_intensity) that have been removed from
			// the read path ahead of their schema DROP. Derived from the one list the FAQ prose
			// also reads, so the two answers cannot disagree again.
			enrichment_fields: ENRICHMENT_FIELDS,
			enrichment_dimensions: ENRICHMENT_FIELDS.length
		});
	} catch (error) {
		console.error('[API] Error fetching stats:', error);
		return json({ error: 'Failed to fetch statistics' }, { status: 500 });
	}
};

