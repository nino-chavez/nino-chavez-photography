import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FALLBACK_ASPECT_RATIO, createFittedPhotoLayout, getPhotoAspectRatio } from './photo-row-layout';
import type { Photo } from '$types/photo';

function photo(id: string, overrides: Partial<Photo> = {}): Photo {
	return {
		id,
		image_key: id,
		image_url: '',
		title: id,
		caption: '',
		keywords: [],
		created_at: '2026-01-01T00:00:00Z',
		metadata: {} as Photo['metadata'],
		...overrides
	};
}

function rowSum(layout: ReturnType<typeof createFittedPhotoLayout>, columns: 1 | 2 | 3 | 4, row: number) {
	return layout
		.slice(row * columns, row * columns + columns)
		.reduce((sum, item) => sum + item.shares[columns], 0);
}

function assertClose(actual: number, expected: number) {
	assert.ok(Math.abs(actual - expected) < Number.EPSILON, `${actual} is not close to ${expected}`);
}

test('uses portrait, landscape, and square source ratios for equal-height rows', () => {
	const layout = createFittedPhotoLayout([
		photo('portrait', { aspect_ratio: 2 / 3 }),
		photo('landscape', { aspect_ratio: 3 / 2 }),
		photo('square', { aspect_ratio: 1 })
	]);

	assert.deepEqual(layout.map((item) => item.aspectRatio), [2 / 3, 3 / 2, 1]);
	for (const [item, expected] of [
		[layout[0], 4 / 19],
		[layout[1], 9 / 19],
		[layout[2], 6 / 19]
	] as const) {
		assertClose(item.shares[3], expected);
	}
	assert.equal(rowSum(layout, 3, 0), 1);
});

test('falls back through EXIF dimensions before using the safe default', () => {
	assert.equal(getPhotoAspectRatio(photo('exif', { aspect_ratio: Number.NaN, exif: { width: 3, height: 2 } })), 3 / 2);
	assert.equal(getPhotoAspectRatio(photo('invalid', { aspect_ratio: 0, exif: { aspect_ratio: -1 } })), FALLBACK_ASPECT_RATIO);
});

test('pads an incomplete final row with its average ratio instead of expanding it', () => {
	const layout = createFittedPhotoLayout([
		photo('a', { aspect_ratio: 1 }),
		photo('b', { aspect_ratio: 2 }),
		photo('c', { aspect_ratio: 3 }),
		photo('d', { aspect_ratio: 4 }),
		photo('e', { aspect_ratio: 1 }),
		photo('f', { aspect_ratio: 3 })
	]);

	assert.equal(layout[4].shares[4], 1 / 8);
	assert.equal(layout[5].shares[4], 3 / 8);
	assert.equal(rowSum(layout, 4, 1), 1 / 2);
});

test('preserves source order and normalizes complete rows for every column count', () => {
	const layout = createFittedPhotoLayout([
		photo('one', { aspect_ratio: 1 }),
		photo('two', { aspect_ratio: 2 }),
		photo('three', { aspect_ratio: 3 }),
		photo('four', { aspect_ratio: 4 }),
		photo('five', { aspect_ratio: 5 }),
		photo('six', { aspect_ratio: 6 }),
		photo('seven', { aspect_ratio: 7 }),
		photo('eight', { aspect_ratio: 8 })
	]);

	assert.deepEqual(layout.map((item) => item.photo.id), ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']);
	assert.deepEqual(layout.map((item) => item.index), [0, 1, 2, 3, 4, 5, 6, 7]);

	for (const columns of [1, 2, 3, 4] as const) {
		const completeRows = Math.floor(layout.length / columns);

		for (let row = 0; row < completeRows; row += 1) {
			assert.equal(rowSum(layout, columns, row), 1);
		}
	}
});
