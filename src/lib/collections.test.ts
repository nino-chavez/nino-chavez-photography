/**
 * Pins the curation criteria to the exact filters they produced before they were
 * refactored from per-slug `if`-branches into data.
 *
 * The expectations below are transcribed from the pre-refactor `applyCollectionFilter`
 * switch statement, not from the current `criteria` objects — otherwise the test would
 * only prove the code agrees with itself. And `collectionMatches` is checked against
 * the SAME expectations rather than against `applyCollectionFilter`, because the whole
 * point of the pair is that the query and the in-memory predicate cannot disagree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	COLLECTIONS,
	applyCollectionFilter,
	collectionMatches,
	type CollectionCandidate
} from './collections';

/** Exactly what the old switch produced, slug by slug. */
const EXPECTED: Record<
	string,
	{ minQuality: number; category?: string; playTypes?: string[] }
> = {
	'portfolio-excellence': { minQuality: 9 },
	'victory-celebrations': { minQuality: 7, category: 'celebration' },
	'aerial-artistry': { minQuality: 7, playTypes: ['attack', 'block', 'spike'] },
	'defensive-masterclass': { minQuality: 7, playTypes: ['dig', 'block'] }
};

type Call = [string, ...unknown[]];

/** Records the PostgREST calls a filter chain makes. */
function recorder() {
	const calls: Call[] = [];
	const builder: Record<string, (...args: unknown[]) => unknown> = {};
	for (const method of ['not', 'eq', 'in', 'gte', 'order']) {
		builder[method] = (...args: unknown[]) => {
			calls.push([method, ...args]);
			return builder;
		};
	}
	return { builder, calls };
}

test('every collection is covered by the expectations', () => {
	assert.deepEqual(
		COLLECTIONS.map((c) => c.slug).sort(),
		Object.keys(EXPECTED).sort()
	);
});

for (const [slug, expected] of Object.entries(EXPECTED)) {
	test(`applyCollectionFilter builds the documented query for ${slug}`, () => {
		const { builder, calls } = recorder();
		applyCollectionFilter(builder, slug);

		// Unprocessed photos are excluded for every collection.
		assert.deepEqual(calls[0], ['not', 'sharpness', 'is', null]);
		assert.deepEqual(
			calls.find((c) => c[0] === 'gte'),
			['gte', 'quality_score', expected.minQuality]
		);
		assert.deepEqual(
			calls.find((c) => c[0] === 'eq'),
			expected.category ? ['eq', 'photo_category', expected.category] : undefined
		);
		assert.deepEqual(
			calls.find((c) => c[0] === 'in'),
			expected.playTypes ? ['in', 'play_type', expected.playTypes] : undefined
		);
		// Ordering is part of the contract — the gallery is ranked, not arbitrary.
		assert.deepEqual(calls.at(-1), ['order', 'quality_score', { ascending: false }]);
	});

	test(`collectionMatches agrees with the documented query for ${slug}`, () => {
		const member: CollectionCandidate = {
			quality_score: expected.minQuality,
			photo_category: expected.category ?? 'action',
			play_type: expected.playTypes?.[0] ?? 'serve',
			sharpness: 42
		};
		assert.equal(collectionMatches(member, slug), true, 'exact-floor member');

		assert.equal(
			collectionMatches({ ...member, quality_score: expected.minQuality - 1 }, slug),
			false,
			'below the keeper floor'
		);
		assert.equal(collectionMatches({ ...member, quality_score: null }, slug), false, 'unscored');
		assert.equal(collectionMatches({ ...member, sharpness: null }, slug), false, 'unprocessed');

		if (expected.category) {
			assert.equal(
				collectionMatches({ ...member, photo_category: 'action' }, slug),
				false,
				'wrong category'
			);
		}
		if (expected.playTypes) {
			assert.equal(
				collectionMatches({ ...member, play_type: 'serve' }, slug),
				false,
				'play type outside the set'
			);
			for (const playType of expected.playTypes) {
				assert.equal(
					collectionMatches({ ...member, play_type: playType }, slug),
					true,
					`play type ${playType} is in the set`
				);
			}
		}
	});
}

test('an unknown slug matches nothing and filters only on sharpness', () => {
	assert.equal(collectionMatches({ quality_score: 10, photo_category: null, play_type: null }, 'nope'), false);
	const { builder, calls } = recorder();
	applyCollectionFilter(builder, 'nope');
	assert.deepEqual(calls, [['not', 'sharpness', 'is', null]]);
});

test('sharpness is optional for callers that already excluded unprocessed rows', () => {
	// The sitemap scan filters `.not('sharpness', 'is', null)` itself and does not
	// carry the column; a row without it must still be able to match.
	assert.equal(
		collectionMatches({ quality_score: 9, photo_category: null, play_type: null }, 'portfolio-excellence'),
		true
	);
});
