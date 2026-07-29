import { test } from 'node:test';
import assert from 'node:assert/strict';
import { humanizeTerm, listPhrase, topFacetNames, ENRICHMENT_FIELDS } from './faq-copy';

test('humanizeTerm replaces every underscore, not just the first', () => {
	assert.equal(humanizeTerm('cross_country'), 'cross country');
	assert.equal(humanizeTerm('coach_player_interaction'), 'coach player interaction');
	assert.equal(humanizeTerm('spike'), 'spike');
});

test('listPhrase reads as a sentence at every length', () => {
	assert.equal(listPhrase([]), '');
	assert.equal(listPhrase(['spike']), 'spike');
	assert.equal(listPhrase(['spike', 'block']), 'spike and block');
	assert.equal(listPhrase(['spike', 'block', 'dig']), 'spike, block, and dig');
});

test('listPhrase drops empty entries rather than emitting ", , "', () => {
	assert.equal(listPhrase(['spike', '', '  ', 'dig']), 'spike and dig');
});

// The exact production distribution on 2026-07-29. The old generator read an unordered partial
// scan of play_type and published "action, attack" — naming a value with ONE photo out of 20,655
// first, and omitting every play type the question itself promises (spikes, blocks, digs).
const LIVE_PLAY_TYPES = [
	{ name: 'attack', count: 3534 },
	{ name: 'celebration', count: 2743 },
	{ name: 'dig', count: 2266 },
	{ name: 'serve', count: 1869 },
	{ name: 'set', count: 1550 },
	{ name: 'block', count: 991 },
	{ name: 'spike', count: 474 },
	{ name: 'pass', count: 248 },
	{ name: 'transition', count: 188 },
	{ name: 'other', count: 24 },
	{ name: 'pole_vault', count: 7 },
	{ name: 'NA', count: 2 },
	{ name: 'fishing', count: 1 },
	{ name: 'action', count: 1 },
	{ name: 'coach_player_interaction', count: 1 }
];

test('topFacetNames answers the play-type question with actual play types', () => {
	const top = topFacetNames(LIVE_PLAY_TYPES, 8);
	assert.deepEqual(top, [
		'attack',
		'celebration',
		'dig',
		'serve',
		'set',
		'block',
		'spike',
		'pass'
	]);
});

test('topFacetNames excludes the pre-taxonomy stray values by rank alone', () => {
	const top = topFacetNames(LIVE_PLAY_TYPES, 8);
	for (const stray of ['fishing', 'NA', 'action', 'coach player interaction']) {
		assert.ok(!top.includes(stray), `"${stray}" must not reach a reader`);
	}
});

test('topFacetNames humanizes the values it keeps', () => {
	assert.deepEqual(topFacetNames([{ name: 'pole_vault', count: 9 }], 3), ['pole vault']);
});

test('topFacetNames drops zero counts and blank names', () => {
	const rows = [
		{ name: 'dig', count: 5 },
		{ name: 'ghost', count: 0 },
		{ name: '   ', count: 99 }
	];
	assert.deepEqual(topFacetNames(rows, 5), ['dig']);
});

test('topFacetNames tolerates an empty facet and a zero limit', () => {
	assert.deepEqual(topFacetNames([], 8), []);
	assert.deepEqual(topFacetNames(LIVE_PLAY_TYPES, 0), []);
});

test('ENRICHMENT_FIELDS names no column that was removed from the read path', () => {
	const dropped = ['composition style', 'time of day', 'lighting', 'color temperature', 'action intensity'];
	const joined = ENRICHMENT_FIELDS.join(' | ');
	for (const field of dropped) {
		assert.ok(!joined.includes(field), `"${field}" is no longer read; it must not be advertised`);
	}
});
