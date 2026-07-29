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

/**
 * A collection's curation criteria, expressed as DATA rather than as query calls.
 *
 * Two consumers need the same rule in two different shapes: the page loaders need
 * PostgREST filters, and the sitemap needs to decide membership for rows already
 * in memory (it will not run a fifth query per collection). Writing the rule twice
 * is how the criteria drift, so it is written once here and both shapes are derived
 * from it — `applyCollectionFilter` for the query, `collectionMatches` for a row.
 */
export interface CollectionCriteria {
	/** Keeper-score floor, inclusive. */
	minQualityScore: number;
	/** Exact `photo_category` match, when the collection is category-scoped. */
	photoCategory?: string;
	/** Any-of `play_type` match, when the collection is play-scoped. */
	playTypes?: string[];
}

export interface CollectionDef {
	slug: string;
	title: string;
	narrative: string;
	description: string;
	criteria: CollectionCriteria;
}

export const COLLECTIONS: CollectionDef[] = [
	{
		slug: 'portfolio-excellence',
		title: 'Portfolio Excellence',
		narrative: 'The absolute best: top-tier keeper score',
		description:
			'The top tier of the catalog—photos with an overall quality score of 9/10 or higher. These represent the pinnacle of sports photography craft.',
		// Top tier: overall keeper score 9/10+
		criteria: { minQualityScore: 9 }
	},
	{
		slug: 'victory-celebrations',
		title: 'Victory Celebrations',
		narrative: 'Pure joy and shared triumph',
		description:
			'The moments after victory—unfiltered emotion, team unity, and the sweet taste of success. These photos capture the human side of sports: the joy, the relief, the celebration.',
		// Celebration moments above the keeper floor (7/10)
		criteria: { minQualityScore: 7, photoCategory: 'celebration' }
	},
	{
		slug: 'aerial-artistry',
		title: 'Aerial Artistry',
		narrative: 'Defying gravity with grace and power',
		description:
			'Athletes suspended in air, captured at the peak of their flight. These photos showcase the beauty of vertical movement—attacks, blocks, and spikes—frozen in time.',
		// Aerial plays above the keeper floor (7/10). `attack` was here until 2026-07-29 and
		// is now a dead value: it was never in the taxonomy, and migration 20260729140000
		// rewrote all 3,534 of those rows to `spike`. Leaving it would be the same drift
		// this file exists to prevent.
		criteria: { minQualityScore: 7, playTypes: ['block', 'spike'] }
	},
	{
		slug: 'defensive-masterclass',
		title: 'Defensive Masterclass',
		narrative: 'The art of reading, reacting, and rescuing',
		description:
			'Digs, blocks, and defensive saves that change momentum. These photos celebrate the unsung heroes—defenders who turn impossible plays into highlights through anticipation and athleticism.',
		// Defensive plays above the keeper floor (7/10)
		criteria: { minQualityScore: 7, playTypes: ['dig', 'block'] }
	}
];

/**
 * The columns `collectionMatches` reads, as a PostgREST select fragment.
 *
 * A string const, not an array: Supabase infers the row type from the select
 * STRING LITERAL, so a runtime `.join()` collapses the result to
 * `GenericStringError[]`. Interpolating this const into a template literal keeps
 * inference intact while still naming the dependency in one place.
 */
export const COLLECTION_CRITERIA_SELECT = 'quality_score, photo_category, play_type';

export interface CollectionCandidate {
	quality_score: number | null;
	photo_category: string | null;
	play_type: string | null;
	sharpness?: number | null;
}

export function getCollection(slug: string): CollectionDef | undefined {
	return COLLECTIONS.find((c) => c.slug === slug);
}

/**
 * Apply a collection's curation criteria (filters + ordering) to a Supabase photo query.
 * `query` is a PostgREST filter builder; the same builder is returned for chaining `.range()` /
 * `.limit()`. Derived from `criteria` — see the note on `CollectionCriteria`.
 *
 * An unknown slug returns the sharpness filter alone, matching the previous behaviour.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyCollectionFilter(query: any, slug: string): any {
	let q = query.not('sharpness', 'is', null);
	const criteria = getCollection(slug)?.criteria;
	if (!criteria) return q;

	if (criteria.photoCategory) q = q.eq('photo_category', criteria.photoCategory);
	if (criteria.playTypes) q = q.in('play_type', criteria.playTypes);
	return q
		.gte('quality_score', criteria.minQualityScore)
		.order('quality_score', { ascending: false });
}

/**
 * Does an already-fetched row belong to `slug`? The in-memory twin of
 * `applyCollectionFilter`, for callers that have the rows and must not spend a query.
 *
 * `sharpness` is only checked when present: a caller that already excluded unprocessed
 * photos in its own query need not carry the column.
 */
export function collectionMatches(photo: CollectionCandidate, slug: string): boolean {
	const criteria = getCollection(slug)?.criteria;
	if (!criteria) return false;
	if (photo.sharpness === null) return false;
	if (photo.quality_score === null || photo.quality_score < criteria.minQualityScore) return false;
	if (criteria.photoCategory && photo.photo_category !== criteria.photoCategory) return false;
	if (criteria.playTypes && !criteria.playTypes.includes(photo.play_type ?? '')) return false;
	return true;
}
