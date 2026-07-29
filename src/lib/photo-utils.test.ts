import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePhotoAltText, generatePhotoTitle } from './photo-utils';
import type { Photo } from '$types/photo';

/**
 * The regression these guard: `transformPhotoRow` sets `Photo.title` to `image_key`, the camera
 * filename. Both helpers used to read it, so the gallery announced every card as
 * "DSC05553. volleyball photo. candid" — verified in the rendered HTML of live album pages.
 */
const FILENAME = 'DSC05553';
const CAPTION = 'A player in a black top spikes past two blockers.';

function photo(overrides: Partial<Photo> = {}): Photo {
	return {
		id: 'pHqw25-DSC05553',
		image_key: FILENAME,
		title: FILENAME,
		caption: CAPTION,
		image_url: '',
		thumbnail_url: '',
		original_url: '',
		keywords: [],
		created_at: '2026-01-01T00:00:00',
		metadata: {
			sport_type: 'volleyball',
			photo_category: 'action',
			play_type: 'spike',
			sharpness: 8
		},
		...overrides
	} as unknown as Photo;
}

test('alt text leads with the caption, never the filename', () => {
	const alt = generatePhotoAltText(photo());
	assert.ok(!alt.includes(FILENAME), `filename leaked into alt: ${alt}`);
	assert.ok(alt.startsWith('A player in a black top spikes past two blockers'), alt);
	// The metadata terms still follow — they are what an in-page search scans for.
	assert.ok(alt.includes('volleyball photo'), alt);
	assert.ok(alt.includes('spike'), alt);
});

test('alt text drops the caption sentence period so the join does not read as a typo', () => {
	assert.ok(!generatePhotoAltText(photo()).includes('blockers.. '));
});

test('alt text falls back to metadata alone when there is no caption', () => {
	const alt = generatePhotoAltText(photo({ caption: '' }));
	assert.equal(alt, 'volleyball photo. action. spike');
	assert.ok(!alt.includes(FILENAME));
});

test('alt text with no metadata still refuses the filename', () => {
	assert.equal(generatePhotoAltText(photo({ metadata: undefined as never })), CAPTION.replace(/\.$/, ''));
	assert.equal(
		generatePhotoAltText(photo({ metadata: undefined as never, caption: '' })),
		'Sports photo'
	);
});

test('lightbox title is metadata-derived and never the filename', () => {
	const title = generatePhotoTitle(photo());
	assert.ok(!title.includes(FILENAME), title);
	assert.ok(title.toLowerCase().includes('volleyball'), title);
});

test('lightbox title with no metadata refuses the filename', () => {
	assert.equal(generatePhotoTitle(photo({ metadata: undefined as never })), CAPTION);
	assert.equal(
		generatePhotoTitle(photo({ metadata: undefined as never, caption: '' })),
		'Sports Photo'
	);
});
