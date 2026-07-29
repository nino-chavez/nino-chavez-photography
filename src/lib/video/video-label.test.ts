import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipAriaLabel, clipDownloadName, clipLabel, formatDuration } from './video-label';

test('the label is the clip position, one-based', () => {
	assert.equal(clipLabel(0), 'Clip 1');
	assert.equal(clipLabel(93), 'Clip 94');
});

test('durations render as m:ss', () => {
	assert.equal(formatDuration(14), '0:14');
	assert.equal(formatDuration(9), '0:09');
	assert.equal(formatDuration(60), '1:00');
	assert.equal(formatDuration(125), '2:05');
});

test('an unknown duration renders as nothing, not "0:00"', () => {
	// The card omits the badge entirely on a falsy result; "0:00" would assert a fact about the
	// clip that the database does not have.
	for (const v of [null, undefined, 0, -1]) {
		assert.equal(formatDuration(v as number | null), '');
	}
});

test('a fractional duration does not leak decimals into the badge', () => {
	assert.equal(formatDuration(14.7), '0:14');
});

test('the card announces the clip and its length, once', () => {
	assert.equal(clipAriaLabel(6, 14), 'Play Clip 7, 0:14');
	assert.equal(clipAriaLabel(6, null), 'Play Clip 7');
});

test('a download is named for its album and position, with no extension', () => {
	// The route appends `.mp4`. Returning one here is how every download in the gallery's
	// history became `C2154.mp4.mp4`.
	assert.equal(
		clipDownloadName('Bell Pepper Open - Video Highlights - Jul 19, 2025', 6),
		'bell-pepper-open-video-highlights-jul-19-2025-07'
	);
	assert.equal(clipDownloadName('Bell Pepper Open', 0).endsWith('.mp4'), false);
});

test('clip numbers are zero-padded so a downloaded album sorts correctly', () => {
	const names = [0, 8, 9, 99].map((i) => clipDownloadName('Raiders Open', i));
	assert.deepEqual(names, [
		'raiders-open-01',
		'raiders-open-09',
		'raiders-open-10',
		'raiders-open-100'
	]);
	// The first ten sort before the rest in any file browser, which unpadded numbering breaks.
	assert.deepEqual([...names.slice(0, 3)].sort(), names.slice(0, 3));
});

test('a missing album name still produces a usable filename', () => {
	// `fetchAlbumVideos` substitutes 'Unknown Album' for a null name, but the empty case has to
	// resolve to something a filesystem accepts rather than a bare "-07".
	assert.equal(clipDownloadName(null, 6), 'video-07');
	assert.equal(clipDownloadName('', 6), 'video-07');
	assert.equal(clipDownloadName('!!!', 6), 'video-07');
});
