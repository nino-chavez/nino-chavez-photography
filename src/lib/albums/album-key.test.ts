import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidAlbumKey } from './album-key';

test('accepts real album keys', () => {
	// A public album, an unlisted one, and a video-only one — all six chars, mixed case + digits.
	for (const key of ['rdrsVB', 'CN9SCh', 'p4J2jk', 'QwhCK5', 'j5MfJD', '1BlKk4']) {
		assert.equal(isValidAlbumKey(key), true, key);
	}
});

test('rejects the strings that reached the query unchecked', () => {
	// Every one of these returned 200 {"photos":[]} from /api/album-photos in production, each
	// minting its own publicly-cacheable edge entry.
	assert.equal(isValidAlbumKey('../../etc/passwd'), false);
	assert.equal(isValidAlbumKey('*'), false);
	assert.equal(isValidAlbumKey('CN9SCh,album_key.neq.x'), false);
	assert.equal(isValidAlbumKey('A'.repeat(500)), false);
	assert.equal(isValidAlbumKey(' '), false);
	assert.equal(isValidAlbumKey(''), false);
	assert.equal(isValidAlbumKey(null), false);
	assert.equal(isValidAlbumKey(undefined), false);
});

test('rejects the ZIP payload delimiter', () => {
	// The signed payload is `albumKey:quality:ts`; a key carrying `:` could forge its own fields.
	assert.equal(isValidAlbumKey('A:large:9999999999'), false);
});

test('allows a longer future key format but not an unbounded one', () => {
	assert.equal(isValidAlbumKey('A'.repeat(32)), true);
	assert.equal(isValidAlbumKey('A'.repeat(33)), false);
	assert.equal(isValidAlbumKey('album_key-2027'), true);
});
