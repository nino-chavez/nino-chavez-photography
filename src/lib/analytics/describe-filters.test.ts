import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeFilters } from './describe-filters';

test('renders the shape /explore actually records', () => {
	// Verified against production: a search for "beach" narrowed to volleyball + D1.
	assert.equal(
		describeFilters({ sport: 'volleyball', division: 'D1' }),
		'sport: volleyball · division: D1'
	);
});

test('camelCase keys get a readable label', () => {
	assert.equal(describeFilters({ playType: 'spike' }), 'play type: spike');
});

test('an unrecognised key shows rather than disappears', () => {
	// Under-reporting what someone filtered by is worse than an unpolished label.
	assert.equal(describeFilters({ venue: 'North Avenue' }), 'venue: North Avenue');
});

test('no filters renders nothing, so the caller can omit the line', () => {
	assert.equal(describeFilters(null), '');
	assert.equal(describeFilters(undefined), '');
	assert.equal(describeFilters({}), '');
});

test('empty and null values are dropped, not printed as blanks', () => {
	assert.equal(describeFilters({ sport: 'volleyball', category: '' }), 'sport: volleyball');
	assert.equal(describeFilters({ sport: 'volleyball', level: null }), 'sport: volleyball');
});

test('a numeric filter renders', () => {
	assert.equal(describeFilters({ jersey: 12 }), 'jersey: 12');
	// 0 is a real jersey number and must not be dropped as falsy.
	assert.equal(describeFilters({ jersey: 0 }), 'jersey: 0');
});

test('a non-object is treated as no filters', () => {
	assert.equal(describeFilters('volleyball' as unknown as Record<string, unknown>), '');
});
