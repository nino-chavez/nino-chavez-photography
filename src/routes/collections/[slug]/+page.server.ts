/**
 * Collection Detail Page - Server Loader
 *
 * Loads full photo set for a specific curated collection.
 * Curation is keeper-score driven: quality_score (0–10) plus kept
 * categorical fields (photo_category / play_type).
 */

import { error } from '@sveltejs/kit';
import { PHOTOS_READ } from '$lib/supabase/columns';
import { supabaseServer, transformPhotoRow, PHOTO_COLUMNS } from '$lib/supabase/server';
import type { PageServerLoad } from './$types';
import type { Photo } from '$types/photo';

// Collection definitions (matching collections/+page.server.ts)
const COLLECTIONS = [
	{
		slug: 'portfolio-excellence',
		title: 'Portfolio Excellence',
		narrative: 'The absolute best: top-tier keeper score',
		description: 'The top tier of the catalog—photos with an overall quality score of 9/10 or higher. These represent the pinnacle of sports photography craft.',
	},
	{
		slug: 'victory-celebrations',
		title: 'Victory Celebrations',
		narrative: 'Pure joy and shared triumph',
		description: 'The moments after victory—unfiltered emotion, team unity, and the sweet taste of success. These photos capture the human side of sports: the joy, the relief, the celebration.',
	},
	{
		slug: 'aerial-artistry',
		title: 'Aerial Artistry',
		narrative: 'Defying gravity with grace and power',
		description: 'Athletes suspended in air, captured at the peak of their flight. These photos showcase the beauty of vertical movement—attacks, blocks, and spikes—frozen in time.',
	},
	{
		slug: 'defensive-masterclass',
		title: 'Defensive Masterclass',
		narrative: 'The art of reading, reacting, and rescuing',
		description: 'Digs, blocks, and defensive saves that change momentum. These photos celebrate the unsung heroes—defenders who turn impossible plays into highlights through anticipation and athleticism.',
	},
];

export const load: PageServerLoad = async ({ params, url, setHeaders }) => {
	setHeaders({ 'cache-control': 's-maxage=300, stale-while-revalidate=600' });

	const { slug } = params;

	// Find collection definition
	const collectionDef = COLLECTIONS.find((c) => c.slug === slug);
	if (!collectionDef) {
		throw error(404, 'Collection not found');
	}

	// Pagination params
	const page = parseInt(url.searchParams.get('page') || '1');
	const pageSize = 24;
	const offset = (page - 1) * pageSize;

	// Fetch photos based on collection type (keeper score + kept categorical fields)
	let photos: Photo[] = [];
	let totalCount = 0;

	if (slug === 'portfolio-excellence') {
		// Top tier: overall keeper score 9/10+
		const query = supabaseServer
			.from(PHOTOS_READ)
			.select(PHOTO_COLUMNS, { count: 'exact' })
			.gte('quality_score', 9)
			.not('sharpness', 'is', null)
			.order('quality_score', { ascending: false });

		const { data, count } = await query.range(offset, offset + pageSize - 1);

		photos = (data || []).map(transformPhotoRow);
		totalCount = count || 0;
	} else if (slug === 'victory-celebrations') {
		// Celebration moments above the keeper floor (7/10)
		const query = supabaseServer
			.from(PHOTOS_READ)
			.select(PHOTO_COLUMNS, { count: 'exact' })
			.eq('photo_category', 'celebration')
			.gte('quality_score', 7)
			.not('sharpness', 'is', null)
			.order('quality_score', { ascending: false });

		const { data, count } = await query.range(offset, offset + pageSize - 1);

		photos = (data || []).map(transformPhotoRow);
		totalCount = count || 0;
	} else if (slug === 'aerial-artistry') {
		// Aerial plays (attack/block/spike) above the keeper floor (7/10)
		const query = supabaseServer
			.from(PHOTOS_READ)
			.select(PHOTO_COLUMNS, { count: 'exact' })
			.in('play_type', ['attack', 'block', 'spike'])
			.gte('quality_score', 7)
			.not('sharpness', 'is', null)
			.order('quality_score', { ascending: false });

		const { data, count } = await query.range(offset, offset + pageSize - 1);

		photos = (data || []).map(transformPhotoRow);
		totalCount = count || 0;
	} else if (slug === 'defensive-masterclass') {
		// Defensive plays (dig/block) above the keeper floor (7/10)
		const query = supabaseServer
			.from(PHOTOS_READ)
			.select(PHOTO_COLUMNS, { count: 'exact' })
			.in('play_type', ['dig', 'block'])
			.gte('quality_score', 7)
			.not('sharpness', 'is', null)
			.order('quality_score', { ascending: false });

		const { data, count } = await query.range(offset, offset + pageSize - 1);

		photos = (data || []).map(transformPhotoRow);
		totalCount = count || 0;
	}

	return {
		collection: {
			...collectionDef,
			photoCount: totalCount,
		},
		photos,
		totalCount,
		currentPage: page,
		pageSize,
		hasMore: totalCount > page * pageSize,
	};
};
