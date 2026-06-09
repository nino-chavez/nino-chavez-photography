/**
 * Collections Page - Curated Collections
 *
 * Displays curated collections driven by the keeper score (quality_score)
 * plus kept categorical fields (photo_category / play_type):
 * 1. Portfolio Excellence - top-tier keeper score
 * 2. Victory Celebrations - celebration moments above the keeper floor
 * 3. Aerial Artistry - aerial plays above the keeper floor
 * 4. Defensive Masterclass - defensive plays above the keeper floor
 */

import { supabaseServer } from '$lib/supabase/server';
import { PHOTOS_READ } from '$lib/supabase/columns';
import type { PageServerLoad } from './$types';

// Collection definitions (keeper score + kept categorical fields)
// Matching collections/[slug]/+page.server.ts query criteria
const COLLECTIONS = [
	{
		slug: 'portfolio-excellence',
		title: 'Portfolio Excellence',
		narrative: 'The absolute best: top-tier keeper score',
		description: 'The top tier of the catalog—photos with an overall quality score of 9/10 or higher. These represent the pinnacle of sports photography craft.',
		coverPhotoIndex: 0,
	},
	{
		slug: 'victory-celebrations',
		title: 'Victory Celebrations',
		narrative: 'Pure joy and shared triumph',
		description: 'The moments after victory—unfiltered emotion, team unity, and the sweet taste of success. These photos capture the human side of sports: the joy, the relief, the celebration.',
		coverPhotoIndex: 0,
	},
	{
		slug: 'aerial-artistry',
		title: 'Aerial Artistry',
		narrative: 'Defying gravity with grace and power',
		description: 'Athletes suspended in air, captured at the peak of their flight. These photos showcase the beauty of vertical movement—attacks, blocks, and spikes—frozen in time.',
		coverPhotoIndex: 0,
	},
	{
		slug: 'defensive-masterclass',
		title: 'Defensive Masterclass',
		narrative: 'The art of reading, reacting, and rescuing',
		description: 'Digs, blocks, and defensive saves that change momentum. These photos celebrate the unsung heroes—defenders who turn impossible plays into highlights through anticipation and athleticism.',
		coverPhotoIndex: 0,
	},
];

export const load: PageServerLoad = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': 's-maxage=300, stale-while-revalidate=600' });

	// PERFORMANCE OPTIMIZATION: Execute all collection queries in parallel
	// (one count + cover-photo query per collection, all in flight at once)

	const collectionQueries = COLLECTIONS.map(async (collection) => {
		// Build query based on collection type (keeper score + kept categorical fields)
		let query = supabaseServer
			.from(PHOTOS_READ)
			.select('photo_id, image_key, ImageUrl, ThumbnailUrl, cf_image_id', { count: 'exact' });

		if (collection.slug === 'portfolio-excellence') {
			// Top tier: overall keeper score 9/10+
			query = query
				.gte('quality_score', 9)
				.not('sharpness', 'is', null)
				.order('quality_score', { ascending: false });
		} else if (collection.slug === 'victory-celebrations') {
			// Celebration moments above the keeper floor (7/10)
			query = query
				.eq('photo_category', 'celebration')
				.gte('quality_score', 7)
				.not('sharpness', 'is', null)
				.order('quality_score', { ascending: false });
		} else if (collection.slug === 'aerial-artistry') {
			// Aerial plays (attack/block/spike) above the keeper floor (7/10)
			query = query
				.in('play_type', ['attack', 'block', 'spike'])
				.gte('quality_score', 7)
				.not('sharpness', 'is', null)
				.order('quality_score', { ascending: false });
		} else if (collection.slug === 'defensive-masterclass') {
			// Defensive plays (dig/block) above the keeper floor (7/10)
			query = query
				.in('play_type', ['dig', 'block'])
				.gte('quality_score', 7)
				.not('sharpness', 'is', null)
				.order('quality_score', { ascending: false });
		}

		const { data, count } = await query.limit(1);

		return {
			...collection,
			photoCount: count || 0,
			coverPhoto: data?.[0] || null,
		};
	});

	// Execute all queries in parallel (massive speedup)
	const collectionsWithPhotos = await Promise.all(collectionQueries);

	// Filter out empty collections
	const activeCollections = collectionsWithPhotos.filter((c) => c.photoCount > 0);

	return {
		collections: activeCollections,
		stats: {
			totalCollections: activeCollections.length,
			totalPhotos: activeCollections.reduce((sum, c) => sum + c.photoCount, 0),
		},
	};
};
