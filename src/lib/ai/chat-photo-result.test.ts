import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeChatPhotos, type ChatPhotoRow } from './chat-photo-result';

function row(over: Partial<ChatPhotoRow> = {}): ChatPhotoRow {
	return {
		photo_id: 'p1',
		image_key: 'DSC05553',
		cf_image_id: '1BlKk4-DSC05553',
		album_key: '1BlKk4',
		album_name: 'Chicago Big Dig 2026',
		sport_type: 'volleyball',
		play_type: 'spike',
		photo_category: 'action',
		caption: 'A player rises for a spike.',
		...over
	};
}

test('every result carries a thumbnail_url — the defect that made the grid blank', () => {
	const [out] = shapeChatPhotos([row()], new Map());
	assert.ok(out.thumbnail_url, 'thumbnail_url must be set when cf_image_id exists');
	assert.match(out.thumbnail_url!, /^https:\/\/imagedelivery\.net\/.+\/1BlKk4-DSC05553\/grid$/);
});

test('uses the grid variant, not the 150px blur placeholder', () => {
	const [out] = shapeChatPhotos([row()], new Map());
	assert.ok(out.thumbnail_url!.endsWith('/grid'));
	assert.ok(!out.thumbnail_url!.endsWith('/thumbnail'));
});

test('a row with no Cloudflare image yields null rather than a broken URL', () => {
	const [out] = shapeChatPhotos([row({ cf_image_id: null })], new Map());
	assert.equal(out.thumbnail_url, null);
});

test('the link uses the address map, so a contested image_key resolves to one photo', () => {
	// Two photos share DSC05553; the map hands each its own segment.
	const rows = [
		row({ photo_id: 'p1', image_key: 'DSC05553', cf_image_id: 'aaa-DSC05553' }),
		row({ photo_id: 'p2', image_key: 'DSC05553', cf_image_id: 'bbb-DSC05553' })
	];
	const addresses = new Map([
		['p1', 'aaa-DSC05553'],
		['p2', 'bbb-DSC05553']
	]);
	const out = shapeChatPhotos(rows, addresses);
	assert.equal(out[0].url, '/photo/aaa-DSC05553');
	assert.equal(out[1].url, '/photo/bbb-DSC05553');
	assert.notEqual(out[0].url, out[1].url, 'two photos must never share one URL');
});

test('falls back to image_key when the peer lookup gave us nothing', () => {
	const [out] = shapeChatPhotos([row()], new Map());
	assert.equal(out.url, '/photo/DSC05553');
});

test('the URL is app-relative — the component prefixes base', () => {
	const [out] = shapeChatPhotos([row()], new Map());
	assert.ok(out.url.startsWith('/photo/'));
	assert.ok(!out.url.startsWith('http'), 'an absolute URL would double the base path');
});

test('never emits /photo/null or /photo/undefined from a missing address', () => {
	const [out] = shapeChatPhotos([row()], new Map([['p1', undefined as unknown as string]]));
	assert.equal(out.url, '/photo/DSC05553');
	assert.ok(!/\/photo\/(null|undefined)$/.test(out.url));
});

test('optional facets normalise null to undefined so JSON omits them', () => {
	const [out] = shapeChatPhotos(
		[row({ play_type: null, photo_category: null, caption: null })],
		new Map()
	);
	assert.equal(out.play_type, undefined);
	assert.equal(out.photo_category, undefined);
	assert.equal(out.caption, undefined);
	assert.equal(out.sport_type, 'volleyball');
});

test('preserves input order — semantic search ranks before this runs', () => {
	const rows = [
		row({ photo_id: 'a', image_key: 'A' }),
		row({ photo_id: 'b', image_key: 'B' }),
		row({ photo_id: 'c', image_key: 'C' })
	];
	const out = shapeChatPhotos(rows, new Map());
	assert.deepEqual(
		out.map((r) => r.image_key),
		['A', 'B', 'C']
	);
});

test('an empty result set stays empty', () => {
	assert.deepEqual(shapeChatPhotos([], new Map()), []);
});
