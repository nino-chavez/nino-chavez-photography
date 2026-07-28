import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	canonicalPhotoSegment,
	isAddressableSegment,
	photoAddresses,
	type PhotoIdentity
} from './photo-address';

/**
 * The shape of the real collision, taken from production: album pHqw25 shares 113 DSC numbers
 * with five other albums, and its cf_image_id happens to equal the bare frame name while the
 * other album's is prefixed. Both facts matter — a rule that assumed cf_image_id is always
 * prefixed would look correct against half this data.
 */
const pHqw25: PhotoIdentity = {
	photo_id: 'p1',
	image_key: 'DSC05553',
	cf_image_id: 'DSC05553',
	album_key: 'pHqw25'
};
const TRoiyO: PhotoIdentity = {
	photo_id: 'p2',
	image_key: 'DSC05553',
	cf_image_id: 'TRoiyO-DSC05553',
	album_key: 'TRoiyO'
};
const unique: PhotoIdentity = {
	photo_id: 'p3',
	image_key: 'DSC09999',
	cf_image_id: 'msow-raiders-open-DSC09999',
	album_key: 'rdrsVB'
};

test('an unshared image_key stays the address', () => {
	assert.equal(canonicalPhotoSegment(unique, [unique], 'DSC09999'), 'DSC09999');
});

test('two photos sharing an image_key get two different addresses', () => {
	const both = [pHqw25, TRoiyO];
	const a = canonicalPhotoSegment(pHqw25, both, 'DSC05553');
	const b = canonicalPhotoSegment(TRoiyO, both, 'DSC05553');
	assert.notEqual(a, b, 'colliding photos must not share a canonical URL');
	assert.equal(a, 'DSC05553');
	assert.equal(b, 'TRoiyO-DSC05553');
});

test('arriving on a cf_image_id keeps that address rather than falling back to the shared key', () => {
	// The lookup by cf_image_id returns one row, so nothing in the candidate set reveals the
	// collision. Returning image_key here would hand this photo the URL the other one owns.
	assert.equal(canonicalPhotoSegment(TRoiyO, [TRoiyO], 'TRoiyO-DSC05553'), 'TRoiyO-DSC05553');
});

test('a null cf_image_id never produces an empty address', () => {
	const orphan: PhotoIdentity = { ...pHqw25, cf_image_id: null };
	assert.equal(canonicalPhotoSegment(orphan, [orphan, TRoiyO], 'DSC05553'), 'DSC05553');
});

test('photoAddresses gives every photo a distinct address', () => {
	const rows = [pHqw25, TRoiyO, unique];
	const addresses = photoAddresses(rows);
	assert.equal(addresses.size, rows.length);
	assert.equal(new Set(addresses.values()).size, rows.length, 'no two photos share a URL');
	assert.equal(addresses.get('p3'), 'DSC09999', 'uncontested keys keep their indexed URL');
});

test('photoAddresses agrees with the single-photo rule', () => {
	const rows = [pHqw25, TRoiyO, unique];
	const bulk = photoAddresses(rows);
	for (const row of rows) {
		assert.equal(bulk.get(row.photo_id), canonicalPhotoSegment(row, rows, row.image_key));
	}
});

test('stringified nulls and filter-breaking characters are not addressable', () => {
	for (const bad of ['null', 'undefined', 'NaN', '', 'a,b', 'a)b', "a'b", 'a b']) {
		assert.equal(isAddressableSegment(bad), false, `${JSON.stringify(bad)} must be rejected`);
	}
	for (const good of ['DSC05553', 'TRoiyO-DSC05553', 'msow-raiders-open-DSC06067', 'fF2fvtB']) {
		assert.equal(isAddressableSegment(good), true, `${good} must be accepted`);
	}
});
