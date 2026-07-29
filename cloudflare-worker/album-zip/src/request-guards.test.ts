import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	isValidAlbumKey,
	isFreshTimestamp,
	SIGNATURE_MAX_AGE_S,
	CLOCK_SKEW_ALLOWANCE_S
} from './request-guards';

const NOW = 1_785_342_070;

test('real album keys pass', () => {
	// A spread of actual keys from the database, including the video-only albums.
	for (const key of ['1BlKk4', 'rdrsVB', 'pHqw25', 'TRoiyO', 'z6uqiQ', 'p4J2jk', 'QwhCK5']) {
		assert.equal(isValidAlbumKey(key), true, key);
	}
});

test('the strings /api/zip-url happily signed are rejected', () => {
	// Each of these came back from production with a valid signature before this existed.
	assert.equal(isValidAlbumKey('../../etc/passwd'), false);
	assert.equal(isValidAlbumKey('A:large:9999999999'), false);
	assert.equal(isValidAlbumKey('x'.repeat(500)), false);
});

test('the payload delimiter cannot appear in a key', () => {
	// The signed payload is `albumKey:quality:ts`. A key containing ':' makes the field
	// boundaries ambiguous between the two services that parse it.
	assert.equal(isValidAlbumKey('abc:def'), false);
});

test('path separators are rejected', () => {
	assert.equal(isValidAlbumKey('a/b'), false);
	assert.equal(isValidAlbumKey('a\\b'), false);
	assert.equal(isValidAlbumKey('..'), false);
});

test('empty and null are rejected', () => {
	assert.equal(isValidAlbumKey(''), false);
	assert.equal(isValidAlbumKey(null), false);
});

// --- timestamp ---------------------------------------------------------------
test('a fresh timestamp passes', () => {
	assert.equal(isFreshTimestamp(String(NOW), NOW), true);
	assert.equal(isFreshTimestamp(String(NOW - 10), NOW), true);
});

test('the window boundary is inclusive', () => {
	assert.equal(isFreshTimestamp(String(NOW - SIGNATURE_MAX_AGE_S), NOW), true);
	assert.equal(isFreshTimestamp(String(NOW - SIGNATURE_MAX_AGE_S - 1), NOW), false);
});

test('a FUTURE timestamp beyond clock skew is rejected', () => {
	// The old check was `now - ts > MAX_AGE`, which is never true for a future ts — a
	// signature dated next year would have been accepted forever.
	assert.equal(isFreshTimestamp(String(NOW + 99_999_999), NOW), false);
	assert.equal(isFreshTimestamp(String(NOW + CLOCK_SKEW_ALLOWANCE_S + 1), NOW), false);
});

test('ordinary clock skew between the two services is tolerated', () => {
	assert.equal(isFreshTimestamp(String(NOW + CLOCK_SKEW_ALLOWANCE_S), NOW), true);
	assert.equal(isFreshTimestamp(String(NOW + 5), NOW), true);
});

test('non-numeric and oversized timestamps are rejected', () => {
	assert.equal(isFreshTimestamp('abc', NOW), false);
	assert.equal(isFreshTimestamp('', NOW), false);
	assert.equal(isFreshTimestamp(null, NOW), false);
	assert.equal(isFreshTimestamp('-100', NOW), false);
	assert.equal(isFreshTimestamp('1e10', NOW), false);
	assert.equal(isFreshTimestamp('9'.repeat(20), NOW), false);
});
