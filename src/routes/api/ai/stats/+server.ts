/**
 * AI-Friendly Statistics API
 *
 * Provides gallery statistics for AI crawlers and answer engines.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabase/server';
import { getSportDistribution, getCategoryDistribution } from '$lib/supabase/server';

export const GET: RequestHandler = async () => {
	try {
		// Get total photo count
		const { count: totalPhotos } = await supabaseServer
			.from('photo_metadata')
			.select('*', { count: 'exact', head: true })
			.not('sharpness', 'is', null);

		// Get total album count
		const { count: totalAlbums } = await supabaseServer
			.from('albums_summary')
			.select('*', { count: 'exact', head: true });

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

		// Get date range
		const { data: dateRange } = await supabaseServer
			.from('photo_metadata')
			.select('photo_date, upload_date')
			.not('sharpness', 'is', null)
			.order('upload_date', { ascending: true })
			.limit(1);

		const { data: latestDate } = await supabaseServer
			.from('photo_metadata')
			.select('photo_date, upload_date')
			.not('sharpness', 'is', null)
			.order('upload_date', { ascending: false })
			.limit(1);

		const earliest = dateRange && dateRange.length > 0
			? (dateRange[0].photo_date || dateRange[0].upload_date)
			: null;
		const latest = latestDate && latestDate.length > 0
			? (latestDate[0].photo_date || latestDate[0].upload_date)
			: null;

		return json({
			total_photos: totalPhotos || 0,
			total_albums: totalAlbums || 0,
			sports: sports,
			categories: categories,
			date_range: {
				earliest: earliest || null,
				latest: latest || null
			},
			ai_enriched: true,
			enrichment_dimensions: 12
		});
	} catch (error) {
		console.error('[API] Error fetching stats:', error);
		return json({ error: 'Failed to fetch statistics' }, { status: 500 });
	}
};

