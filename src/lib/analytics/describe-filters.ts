/**
 * Renders `search_queries.filters_used` as a line the gallery owner can read.
 *
 * Lives here rather than inside the analytics component because it produces reader-facing
 * text on a page that is admin-gated — it cannot be walked in a browser without credentials,
 * so the only way to hold it to the contract is a test.
 *
 * The keys are the ones `/explore` records (`visitorFilters` there). An unrecognised key
 * falls back to its raw name rather than being dropped, so adding a filter on the recording
 * side shows up here without a second edit — silently omitting it would be the worse failure,
 * since the panel would then under-report what someone had narrowed by.
 */

const FILTER_LABELS: Record<string, string> = {
	sport: 'sport',
	category: 'category',
	playType: 'play type',
	jersey: 'jersey',
	division: 'division',
	level: 'level'
};

/** `"sport: volleyball · division: D1"`, or `''` when nothing was filtered. */
export function describeFilters(filters: Record<string, unknown> | null | undefined): string {
	if (!filters || typeof filters !== 'object') return '';
	return Object.entries(filters)
		.filter(([, value]) => value !== null && value !== undefined && value !== '')
		.map(([key, value]) => `${FILTER_LABELS[key] ?? key}: ${value}`)
		.join(' · ');
}
