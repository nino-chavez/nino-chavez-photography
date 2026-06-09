/**
 * Curated collections — SINGLE SOURCE OF TRUTH for both the definitions and the query criteria.
 *
 * Both the index (`collections/+page.server.ts`, counts + covers) and the detail page
 * (`collections/[slug]/+page.server.ts`, the gallery) import from here, so adding / editing /
 * reordering a collection is a one-place change. Previously the array + the per-slug filter
 * `if`-branches were duplicated across both files and had to be kept in sync by hand.
 *
 * Curation is keeper-score driven: `quality_score` (0–10) + kept categorical fields
 * (`photo_category` / `play_type`). The deprecated aesthetic facets are intentionally not used.
 */

export interface CollectionDef {
	slug: string;
	title: string;
	narrative: string;
	description: string;
}

export const COLLECTIONS: CollectionDef[] = [
	{
		slug: 'portfolio-excellence',
		title: 'Portfolio Excellence',
		narrative: 'The absolute best: top-tier keeper score',
		description:
			'The top tier of the catalog—photos with an overall quality score of 9/10 or higher. These represent the pinnacle of sports photography craft.'
	},
	{
		slug: 'victory-celebrations',
		title: 'Victory Celebrations',
		narrative: 'Pure joy and shared triumph',
		description:
			'The moments after victory—unfiltered emotion, team unity, and the sweet taste of success. These photos capture the human side of sports: the joy, the relief, the celebration.'
	},
	{
		slug: 'aerial-artistry',
		title: 'Aerial Artistry',
		narrative: 'Defying gravity with grace and power',
		description:
			'Athletes suspended in air, captured at the peak of their flight. These photos showcase the beauty of vertical movement—attacks, blocks, and spikes—frozen in time.'
	},
	{
		slug: 'defensive-masterclass',
		title: 'Defensive Masterclass',
		narrative: 'The art of reading, reacting, and rescuing',
		description:
			'Digs, blocks, and defensive saves that change momentum. These photos celebrate the unsung heroes—defenders who turn impossible plays into highlights through anticipation and athleticism.'
	}
];

export function getCollection(slug: string): CollectionDef | undefined {
	return COLLECTIONS.find((c) => c.slug === slug);
}

/**
 * Apply a collection's curation criteria (filters + ordering) to a Supabase photo query.
 * `query` is a PostgREST filter builder; the same builder is returned for chaining `.range()` /
 * `.limit()`. This is the ONE place the criteria live — both server loaders call it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyCollectionFilter(query: any, slug: string): any {
	const q = query.not('sharpness', 'is', null);
	switch (slug) {
		case 'portfolio-excellence':
			// Top tier: overall keeper score 9/10+
			return q.gte('quality_score', 9).order('quality_score', { ascending: false });
		case 'victory-celebrations':
			// Celebration moments above the keeper floor (7/10)
			return q
				.eq('photo_category', 'celebration')
				.gte('quality_score', 7)
				.order('quality_score', { ascending: false });
		case 'aerial-artistry':
			// Aerial plays (attack/block/spike) above the keeper floor (7/10)
			return q
				.in('play_type', ['attack', 'block', 'spike'])
				.gte('quality_score', 7)
				.order('quality_score', { ascending: false });
		case 'defensive-masterclass':
			// Defensive plays (dig/block) above the keeper floor (7/10)
			return q
				.in('play_type', ['dig', 'block'])
				.gte('quality_score', 7)
				.order('quality_score', { ascending: false });
		default:
			return q;
	}
}
