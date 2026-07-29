/**
 * Pure copy helpers for the answer-engine surfaces (/faq, /api/ai/faq, /ai.txt).
 *
 * These surfaces are read by crawlers and answer engines and republished as prose, so a wrong
 * sentence here becomes a wrong sentence in someone's search result. Everything in this file is
 * pure so it can be tested without a database — see faq-copy.test.ts.
 */

/**
 * Stored facet values are snake_case enum members (`cross_country`, `jump_shot`, `pole_vault`).
 * Readers get words. Replaces EVERY underscore — the old `.replace('_', ' ')` replaced only the
 * first, so `coach_player_interaction` reached readers as "coach player_interaction".
 */
export function humanizeTerm(value: string): string {
	return value.replaceAll('_', ' ').trim();
}

/** "a, b, and c" — an Oxford list that reads as a sentence. */
export function listPhrase(items: string[]): string {
	const parts = items.filter((item) => item.trim().length > 0);
	if (parts.length === 0) return '';
	if (parts.length === 1) return parts[0];
	if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
	return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

/**
 * The `limit` most-photographed values of a facet, humanized.
 *
 * Ranking by count is what keeps the answer honest. The gallery's play_type column holds 62
 * distinct values, most of them one-off strings from the pre-taxonomy pipeline ("fishing",
 * "unclear", "NA", "walk_on"). Every one of those has a single-digit count, so ordering by
 * count and taking the head excludes them without a hand-maintained denylist that would need
 * editing every time the data grows a new stray value.
 */
export function topFacetNames(
	rows: ReadonlyArray<{ name: string; count: number }>,
	limit: number
): string[] {
	return [...rows]
		.filter((row) => row.name?.trim() && row.count > 0)
		.sort((a, b) => b.count - a.count)
		.slice(0, Math.max(0, limit))
		.map((row) => humanizeTerm(row.name));
}

/**
 * What the enrichment pass actually stores per photo, in reader words.
 *
 * The single source for both the FAQ prose and /api/ai/stats, so the two cannot disagree —
 * they previously each claimed "12 semantic dimensions" and then enumerated a different set,
 * one of which listed six columns (composition, time_of_day, lighting, color_temperature,
 * emotion, action_intensity) that were removed from the read path ahead of their schema DROP.
 * See PHOTO_COLUMNS in $lib/supabase/columns and the extraction prompt in $lib/ai/ingest-extraction.
 */
export const ENRICHMENT_FIELDS = [
	'a one-sentence search caption',
	'sport',
	'photo category',
	'play type',
	'visible jersey numbers',
	'a sharpness score',
	'a composition score',
	'an exposure score',
	'an emotional-impact score'
] as const;
