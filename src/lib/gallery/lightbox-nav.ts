/**
 * Pure navigation-decision helpers for the gallery Lightbox.
 *
 * Extracted so the boundary-crossing logic — the part that broke on the share page's
 * lightbox (Next silently did nothing at the end of a loaded page) and had a latent crash
 * (advancing into an index that was never loaded made `photo` undefined and the whole
 * lightbox vanished while still `open`) — is testable without a browser, a Svelte runtime,
 * or a network mock. See Lightbox.svelte for how these are wired to `photos`/`hasMore`/
 * `onLoadMore`.
 */

/** Whether the "next" control should be shown/enabled at all. */
export function canGoNext(currentIndex: number, loadedCount: number, hasMore: boolean): boolean {
	return loadedCount > 0 && (currentIndex < loadedCount - 1 || hasMore);
}

/** Whether the "previous" control should be shown/enabled. Loading more never happens backward. */
export function canGoPrev(currentIndex: number): boolean {
	return currentIndex > 0;
}

/** Guard applied before ever calling the parent's `onNavigate` — never target an unloaded index. */
export function isValidIndex(index: number, loadedCount: number): boolean {
	return index >= 0 && index < loadedCount;
}

/**
 * Whether the lightbox is close enough to the end of what's loaded that it should start
 * fetching the next page now, in the background, rather than waiting for the visitor to hit
 * the boundary. `lookahead` is how many loaded photos from the end counts as "close" (the
 * existing adjacent-image preload effect only ever warms one photo ahead, so this needs to
 * fire earlier to give a slow page fetch + a cold CDN image fetch time to finish before the
 * visitor's Next click arrives).
 */
export function shouldPrefetchNextPage(
	currentIndex: number,
	loadedCount: number,
	hasMore: boolean,
	lookahead: number
): boolean {
	if (!hasMore || loadedCount === 0) return false;
	return currentIndex >= loadedCount - 1 - lookahead;
}

export type LoadMoreOutcome =
	| { type: 'advance'; index: number }
	| { type: 'stale' } // the visitor moved on while the fetch was in flight — do nothing
	| { type: 'failed' }; // the fetch resolved but no new, reachable photo appeared

/**
 * Decides what a boundary-crossing `onLoadMore()` call resolved to. Pure: takes a before/after
 * snapshot rather than reading Svelte state directly, so the three outcomes — advance, stale
 * (the visitor pressed Prev/Next again while the fetch was in flight), and failed (the fetch
 * resolved but nothing new became reachable, e.g. it errored or returned an empty page) — are
 * each one assertion.
 */
export function resolveLoadMoreOutcome(params: {
	/** The index Next was pressed from, before the fetch started. */
	startIndex: number;
	/** The current index at the moment the fetch resolved. */
	currentIndexNow: number;
	loadedCountBefore: number;
	loadedCountAfter: number;
}): LoadMoreOutcome {
	const { startIndex, currentIndexNow, loadedCountBefore, loadedCountAfter } = params;
	if (currentIndexNow !== startIndex) return { type: 'stale' };

	const nextIndex = startIndex + 1;
	if (loadedCountAfter > loadedCountBefore && isValidIndex(nextIndex, loadedCountAfter)) {
		return { type: 'advance', index: nextIndex };
	}
	return { type: 'failed' };
}
