import { test } from 'node:test';
import assert from 'node:assert/strict';
import { photoPageTitle, photoAltText } from './photo-title';

const ALBUM = 'Chicago Big Dig 2026 - North Avenue Beach'; // 40 chars, near the p90
const LONGEST = 'KRUSH Volleyball – Suburban Slam Series #1 - Jun 14'; // 51, the longest in the data
const CAPTION = 'A player in brown digs a volleyball on a sandy court with other players in the background.';

test('the album name leads and is never truncated', () => {
	const title = photoPageTitle(ALBUM, CAPTION);
	assert.ok(title.startsWith(`${ALBUM} — `), title);
});

test('the caption distinguishes photos that share an album', () => {
	const a = photoPageTitle(ALBUM, 'A player in brown digs a volleyball on a sandy court.');
	const b = photoPageTitle(ALBUM, 'Players jump near the net during a beach volleyball game.');
	assert.notEqual(a, b);
});

test('the longest album in the data still gets a usable caption fragment', () => {
	const title = photoPageTitle(LONGEST, CAPTION);
	const fragment = title.slice(LONGEST.length + 3);
	// The allowance is 34; word-boundary trimming gives back up to one word, so this asserts
	// what actually ships rather than the allowance.
	assert.ok(fragment.length >= 24, `fragment was ${fragment.length}: ${fragment}`);
	assert.ok(title.startsWith(LONGEST));
});

test('a typical title lands in the range real data produces', () => {
	// Measured on the live gallery: titles for this album render 73-78 characters. The band
	// is wider than the 70 target because the album is 40 characters, so the 34-character
	// caption allowance pushes the budget to 77.
	const title = photoPageTitle(ALBUM, CAPTION);
	assert.ok(title.length >= 66 && title.length <= 80, `${title.length}: ${title}`);
});

test('the exact album and caption seen in production compose sensibly', () => {
	assert.equal(
		photoPageTitle(
			'Chicago Big Dig 2026 - North Avenue Beach',
			'Two players high-five on the sand court at North Avenue Beach, one in a blue top.'
		),
		'Chicago Big Dig 2026 - North Avenue Beach — Two players high-five on the sand…'
	);
});

test('trimming happens at a word boundary, never mid-word', () => {
	const title = photoPageTitle(ALBUM, CAPTION);
	const fragment = title.slice(ALBUM.length + 3).replace(/…$/, '');
	assert.ok(CAPTION.startsWith(fragment), `"${fragment}" is not a word-aligned prefix`);
	assert.ok(!/\s$/.test(fragment), 'trailing space before the ellipsis');
});

test('the caption sentence period does not survive into the middle of a title', () => {
	assert.equal(photoPageTitle(ALBUM, 'A short caption.'), `${ALBUM} — A short caption`);
});

test('no caption falls back to the album alone', () => {
	assert.equal(photoPageTitle(ALBUM, null), ALBUM);
	assert.equal(photoPageTitle(ALBUM, '   '), ALBUM);
});

test('no album falls back to the caption', () => {
	assert.ok(photoPageTitle(null, CAPTION).startsWith('A player in brown digs'));
});

test('neither still produces something', () => {
	assert.equal(photoPageTitle(null, null), 'Untitled Photo');
});

test('the brand suffix is not appended here — og:site_name carries it', () => {
	assert.ok(!photoPageTitle(ALBUM, CAPTION).includes('Nino Chavez Photography'));
});

// --- alt text -----------------------------------------------------------------
test('alt text describes the picture, not the event', () => {
	// Was the album name, so a screen reader announced the event for all 363 frames.
	assert.equal(photoAltText(ALBUM, CAPTION), CAPTION);
});

test('alt text falls back to the album, then to something', () => {
	assert.equal(photoAltText(ALBUM, null), ALBUM);
	assert.equal(photoAltText(null, null), 'Photo');
});
