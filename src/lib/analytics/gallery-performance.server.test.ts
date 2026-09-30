import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateGalleryRows, rankAndWindowPhotos } from './gallery-performance.server';
import type { DailyActionRow } from './report-contract';

function row(overrides: Partial<DailyActionRow> = {}): DailyActionRow {
	return {
		bucket_date: '2026-09-20', album_key: 'album-a', photo_id: 'photo-a', event_type: 'view', source: 'direct',
		source_kind: 'internal_open_location', sport: 'volleyball', photo_category: 'action', traffic_classification: 'audience',
		action_count: 1, coverage_state: 'complete', latest_event_at: '2026-09-20T12:00:00Z', ...overrides
	};
}

test('aggregates all measures for albums and photos in one row pass', () => {
	const result = aggregateGalleryRows([
		row({ action_count: 3 }),
		row({ event_type: 'download', action_count: 2 }),
		row({ event_type: 'album_open', photo_id: '', action_count: 5 })
	], [row({ action_count: 4 })], 'photo_opens');

	assert.equal(result.currentAlbums.get('album-a')?.count, 3);
	assert.equal(result.previousAlbums.get('album-a')?.count, 4);
	assert.equal(result.currentPhotos.get('photo-a\u0000album-a')?.count, 3);
	assert.deepEqual(result.albumMeasures.get('album-a'), { photo_opens: 3, album_opens: 5, downloads: 2, favorites: 0, shares: 0 });
	assert.deepEqual(result.photoMeasures.get('photo-a\u0000album-a'), { photo_opens: 3, album_opens: 0, downloads: 2, favorites: 0, shares: 0 });
});

test('server ranking uses stable ties and clamps an out-of-range page', () => {
	const photos = [
		{ photoId: 'b', albumKey: 'album', count: 2, risingValue: 5, lastActivity: '2026-09-20T10:00:00Z' },
		{ photoId: 'a', albumKey: 'album', count: 2, risingValue: 5, lastActivity: '2026-09-20T11:00:00Z' },
		{ photoId: 'c', albumKey: 'album', count: 1, risingValue: 8, lastActivity: '2026-09-20T12:00:00Z' }
	];
	const popular = rankAndWindowPhotos(photos, { page: 9, pageSize: 2, rank: 'popular' });
	assert.deepEqual(popular.photos.map((photo) => photo.photoId), ['c']);
	assert.deepEqual(popular.pagination, { page: 1, pageSize: 2, pageCount: 2, total: 3, rank: 'popular' });
	assert.deepEqual(rankAndWindowPhotos(photos, { page: 0, pageSize: 3, rank: 'rising' }).photos.map((photo) => photo.photoId), ['c', 'a', 'b']);
	assert.deepEqual(rankAndWindowPhotos(photos, { page: 0, pageSize: 3, rank: 'recent' }).photos.map((photo) => photo.photoId), ['c', 'a', 'b']);
	const missing = photos.slice(0, 2).map((photo) => ({ ...photo, count: null, risingValue: null, lastActivity: null }));
	assert.deepEqual(rankAndWindowPhotos(missing, { page: 0, pageSize: 2, rank: 'rising' }).photos.map((photo) => photo.photoId), ['a', 'b']);
});

test('a zero-size window returns metadata without photo rows', () => {
	const result = rankAndWindowPhotos([{ photoId: 'a', albumKey: 'album', count: 1, risingValue: 1, lastActivity: null }], { page: 4, pageSize: 0, rank: 'popular' });
	assert.deepEqual(result.photos, []);
	assert.deepEqual(result.pagination, { page: 0, pageSize: 0, pageCount: 0, total: 1, rank: 'popular' });
});


test('unavailable ranks keep deterministic identifier ties', () => {
 const rows=['z','a'].map(photoId=>({photoId,albumKey:'album',count:null,risingValue:null,lastActivity:null}));
 for (const rank of ['popular','rising','recent'] as const) {
  assert.deepEqual(rankAndWindowPhotos(rows,{page:0,pageSize:12,rank}).photos.map(row=>row.photoId),['a','z']);
 }
});
