import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	canGoNext,
	canGoPrev,
	isValidIndex,
	shouldPrefetchNextPage,
	resolveLoadMoreOutcome
} from './lightbox-nav';

test('canGoNext: true within the loaded list, and at the boundary only when more is available', () => {
	assert.equal(canGoNext(0, 5, false), true); // more loaded photos ahead
	assert.equal(canGoNext(3, 5, false), true);
	assert.equal(canGoNext(4, 5, false), false); // last loaded photo, nothing more — hide Next
	assert.equal(canGoNext(4, 5, true), true); // last loaded photo, but a next page exists
	assert.equal(canGoNext(0, 0, true), false); // nothing loaded at all
});

test('canGoPrev: false only at the start of the loaded list', () => {
	assert.equal(canGoPrev(0), false);
	assert.equal(canGoPrev(1), true);
});

test('isValidIndex: the bounds check that must run before onNavigate is ever called', () => {
	// This is the guard for the bug that made the lightbox vanish: onNavigate(currentIndex + 1)
	// was called unconditionally after an awaited load, even when the load added nothing.
	assert.equal(isValidIndex(-1, 5), false);
	assert.equal(isValidIndex(0, 5), true);
	assert.equal(isValidIndex(4, 5), true);
	assert.equal(isValidIndex(5, 5), false);
	assert.equal(isValidIndex(0, 0), false);
});

test('shouldPrefetchNextPage: fires within the lookahead window, not before, and never with nothing more to load', () => {
	// 48-photo page, 5-photo lookahead: prefetch starts at index 42 (48 - 1 - 5 - 1 + 1 = 42).
	assert.equal(shouldPrefetchNextPage(41, 48, true, 5), false);
	assert.equal(shouldPrefetchNextPage(42, 48, true, 5), true);
	assert.equal(shouldPrefetchNextPage(47, 48, true, 5), true); // the true boundary itself
	assert.equal(shouldPrefetchNextPage(47, 48, false, 5), false); // nothing more to fetch
	assert.equal(shouldPrefetchNextPage(0, 0, true, 5), false); // nothing loaded yet
});

test('resolveLoadMoreOutcome: advances into the newly loaded photo on success', () => {
	const outcome = resolveLoadMoreOutcome({
		startIndex: 47,
		currentIndexNow: 47,
		loadedCountBefore: 48,
		loadedCountAfter: 96
	});
	assert.deepEqual(outcome, { type: 'advance', index: 48 });
});

test('resolveLoadMoreOutcome: failed when the fetch resolved but nothing new is reachable', () => {
	// e.g. the API returned an empty page, or errored and the caller swallowed it.
	const outcome = resolveLoadMoreOutcome({
		startIndex: 47,
		currentIndexNow: 47,
		loadedCountBefore: 48,
		loadedCountAfter: 48
	});
	assert.deepEqual(outcome, { type: 'failed' });
});

test('resolveLoadMoreOutcome: stale when the visitor moved to a different photo while the fetch was in flight', () => {
	// Pressed Prev (or Next again) before the boundary fetch resolved — do not jump them forward.
	const outcome = resolveLoadMoreOutcome({
		startIndex: 47,
		currentIndexNow: 46,
		loadedCountBefore: 48,
		loadedCountAfter: 96
	});
	assert.deepEqual(outcome, { type: 'stale' });
});

test('resolveLoadMoreOutcome: growth alone is not enough — the next index must actually be in range', () => {
	// Defensive: even if loadedCountAfter grew, only advance if startIndex + 1 is inside it.
	const outcome = resolveLoadMoreOutcome({
		startIndex: 47,
		currentIndexNow: 47,
		loadedCountBefore: 48,
		loadedCountAfter: 47 // pathological: shrank rather than grew — never advance
	});
	assert.deepEqual(outcome, { type: 'failed' });
});
