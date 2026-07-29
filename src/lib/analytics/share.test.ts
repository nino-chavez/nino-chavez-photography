import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHARE_SRC, shareUrl, isValidSrcParam, type ShareChannel } from './share';

const CHANNELS = Object.keys(SHARE_SRC) as ShareChannel[];
const PHOTO = 'https://ninochavez.co/photography/photo/DSC06067';

/**
 * The defect this file exists against is silence. A share surface that forgets to
 * attribute or record does not error — it just never appears in the data, and the
 * only evidence is a table that stays empty for months. These assertions are the
 * part that can be checked without a browser.
 */

test('every channel has a distinct src value', () => {
	const values = CHANNELS.map((c) => SHARE_SRC[c]);
	assert.equal(new Set(values).size, values.length, `duplicate src value in ${values.join(', ')}`);
});

test('every src value is share-prefixed and passes the inbound param check', () => {
	for (const channel of CHANNELS) {
		const src = SHARE_SRC[channel];
		assert.ok(src.startsWith('share-'), `${channel} → ${src} is not share-prefixed`);
		// An outbound value the inbound guard would reject is attribution that
		// silently evaporates on arrival — the exact failure mode being fixed.
		assert.ok(isValidSrcParam(src), `${channel} → ${src} would be rejected on arrival`);
	}
});

test('shareUrl carries the channel on the url', () => {
	assert.equal(shareUrl(PHOTO, 'x'), `${PHOTO}?src=share-x`);
	assert.equal(shareUrl(PHOTO, 'copy'), `${PHOTO}?src=share-copy`);
	assert.equal(shareUrl(PHOTO, 'email'), `${PHOTO}?src=share-email`);
});

test('shareUrl preserves existing query params', () => {
	assert.equal(
		shareUrl(`${PHOTO}?ref=album-1BlKk4`, 'fb'),
		`${PHOTO}?ref=album-1BlKk4&src=share-fb`
	);
});

test('shareUrl overwrites a stale src rather than appending a second one', () => {
	const reshared = shareUrl(shareUrl(PHOTO, 'x'), 'linkedin');
	assert.equal(reshared, `${PHOTO}?src=share-linkedin`);
});

test('shareUrl resolves an app-relative path against the canonical site url', () => {
	assert.equal(
		shareUrl('/photo/DSC06067', 'copy'),
		'https://ninochavez.co/photo/DSC06067?src=share-copy'
	);
});

test('isValidSrcParam accepts channels minted outside the app', () => {
	// Instagram bio links and printed QR codes are real attribution and predate
	// this table; rejecting them for not being listed here would lose the arrival.
	for (const src of ['ig-bio', 'qr', 'ig-nino', 'links']) {
		assert.ok(isValidSrcParam(src), `${src} should be accepted`);
	}
});

test('isValidSrcParam rejects junk that would pollute engagement_events.source', () => {
	for (const bad of [null, '', 'Share-X', 'a'.repeat(33), 'drop table', '../etc', 'x;y']) {
		assert.equal(isValidSrcParam(bad as string | null), false, `${String(bad)} should be rejected`);
	}
});
