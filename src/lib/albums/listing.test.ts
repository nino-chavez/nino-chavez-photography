import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	buildAlbumListing,
	listingFacets,
	videoOnlyRows,
	type AlbumSummaryRow,
	type VideoSummaryRow
} from './listing';

/** Shapes taken from production rows, trimmed to the fields the listing reads. */
const photo = (key: string, name: string, count: number, latest: string, sport = 'volleyball'): AlbumSummaryRow => ({
	album_key: key,
	album_name: name,
	photo_count: count,
	cover_image_url: null,
	cover_cf_image_id: `${key}-cover`,
	sports: [sport],
	categories: ['action'],
	portfolio_count: 0,
	avg_quality_score: 7.5,
	primary_sport: sport,
	primary_category: 'action',
	earliest_photo_date: latest,
	latest_photo_date: latest
});

const video = (key: string, name: string, count: number, latest: string): VideoSummaryRow => ({
	album_key: key,
	album_name: name,
	video_count: count,
	cover_thumbnail_url: `https://thumb/${key}`,
	earliest_video_date: latest,
	latest_video_date: latest
});

/** The four production albums that hold BOTH photos and videos, plus the two video-only ones. */
const PHOTO_ROWS = [
	photo('rdrsVB', 'Saturday Triples — The Raiders Open', 363, '2026-05-10'),
	photo('1BlKk4', 'Chicago Big Dig 2026 - North Avenue Beach', 267, '2026-07-25'),
	photo('z6uqiQ', 'KRUSH Volleyball – Suburban Slam Series #1', 211, '2026-06-14'),
	photo('TRoiyO', 'Bell Pepper Open - June 2026', 119, '2026-06-20'),
	photo('jq1Rp7', 'Jalapeño Open - July 2026', 73, '2026-07-05'),
	photo('hoop01', 'Panther Invite', 200, '2025-11-02', 'basketball')
];
const VIDEO_ROWS = [
	video('rdrsVB', 'Saturday Triples — The Raiders Open', 134, '2026-05-10'),
	video('z6uqiQ', 'KRUSH Volleyball – Suburban Slam Series #1', 41, '2026-06-14'),
	video('TRoiyO', 'Bell Pepper Open - June 2026', 82, '2026-06-20'),
	video('jq1Rp7', 'Jalapeño Open - July 2026', 116, '2026-07-05'),
	video('p4J2jk', 'Bell Pepper Open Video Highlights', 94, '2025-07-19'),
	video('QwhCK5', 'Bell Pepper Final Match Highlights', 14, '2025-07-19')
];
const NONE = new Set<string>();

test('no album appears twice — the defect, stated directly', () => {
	// Production before the fix: 311 card slots for 251 distinct albums, six albums repeated
	// on all eleven pages.
	const list = buildAlbumListing({ photoRows: PHOTO_ROWS, videoRows: VIDEO_ROWS, unlistedKeys: NONE });
	const keys = list.map((a) => a.albumKey);
	assert.equal(keys.length, new Set(keys).size, `duplicate album keys: ${keys.join(', ')}`);
	assert.equal(list.length, 8); // 6 photo albums + 2 video-only
});

test('a mixed album keeps its photo count AND gains its video count', () => {
	// This is what read "0 photos" on pages 2-11 while its own page said 363.
	const list = buildAlbumListing({ photoRows: PHOTO_ROWS, videoRows: VIDEO_ROWS, unlistedKeys: NONE });
	const raiders = list.find((a) => a.albumKey === 'rdrsVB');
	assert.deepEqual(
		{ photos: raiders?.photoCount, videos: raiders?.videoCount },
		{ photos: 363, videos: 134 }
	);
	const jalapeno = list.find((a) => a.albumKey === 'jq1Rp7');
	// More videos than photos — the album that made the missing count obvious.
	assert.deepEqual({ p: jalapeno?.photoCount, v: jalapeno?.videoCount }, { p: 73, v: 116 });
});

test('a photo-only album reports zero videos, not undefined', () => {
	const list = buildAlbumListing({ photoRows: PHOTO_ROWS, videoRows: VIDEO_ROWS, unlistedKeys: NONE });
	assert.equal(list.find((a) => a.albumKey === '1BlKk4')?.videoCount, 0);
});

test('video-only albums are included exactly once, with their cover', () => {
	const list = buildAlbumListing({ photoRows: PHOTO_ROWS, videoRows: VIDEO_ROWS, unlistedKeys: NONE });
	const only = list.filter((a) => a.photoCount === 0);
	assert.deepEqual(only.map((a) => a.albumKey).sort(), ['QwhCK5', 'p4J2jk']);
	assert.equal(only[0].coverImageUrl?.startsWith('https://thumb/'), true);
});

test('unlisted albums are excluded from both halves of the merge', () => {
	// A private album with video would otherwise slip back in through the video branch.
	const list = buildAlbumListing({
		photoRows: PHOTO_ROWS,
		videoRows: VIDEO_ROWS,
		unlistedKeys: new Set(['rdrsVB', 'p4J2jk'])
	});
	const keys = list.map((a) => a.albumKey);
	assert.ok(!keys.includes('rdrsVB'), 'unlisted mixed album leaked');
	assert.ok(!keys.includes('p4J2jk'), 'unlisted video-only album leaked');
	assert.equal(list.length, 6);
});

test('sort: Most Photos puts video-only albums last, which is what they are', () => {
	const list = buildAlbumListing({
		photoRows: PHOTO_ROWS, videoRows: VIDEO_ROWS, unlistedKeys: NONE, sortBy: 'count'
	});
	assert.deepEqual(list.map((a) => a.photoCount), [363, 267, 211, 200, 119, 73, 0, 0]);
});

test('sort: Latest Photos ranks video-only albums by their video date', () => {
	// They used to be appended AFTER the sort, so they always landed last on every page
	// regardless of date. Both video-only albums here are from 2025 and belong at the end.
	const list = buildAlbumListing({
		photoRows: PHOTO_ROWS, videoRows: VIDEO_ROWS, unlistedKeys: NONE, sortBy: 'date'
	});
	assert.deepEqual(list.map((a) => a.albumKey), [
		'1BlKk4', 'jq1Rp7', 'TRoiyO', 'z6uqiQ', 'rdrsVB', 'hoop01', 'p4J2jk', 'QwhCK5'
	]);
});

test('sort: Name is A-Z across both kinds', () => {
	const list = buildAlbumListing({
		photoRows: PHOTO_ROWS, videoRows: VIDEO_ROWS, unlistedKeys: NONE, sortBy: 'name'
	});
	const names = list.map((a) => a.albumName);
	assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
});

test('free-text search is case-insensitive and matches video-only albums too', () => {
	const list = buildAlbumListing({
		photoRows: PHOTO_ROWS, videoRows: VIDEO_ROWS, unlistedKeys: NONE, q: 'BELL PEPPER'
	});
	assert.deepEqual(list.map((a) => a.albumKey).sort(), ['QwhCK5', 'TRoiyO', 'p4J2jk']);
});

test('sport filter keeps video albums under volleyball and drops them otherwise', () => {
	const vb = buildAlbumListing({ photoRows: PHOTO_ROWS, videoRows: VIDEO_ROWS, unlistedKeys: NONE, sport: 'volleyball' });
	assert.ok(vb.some((a) => a.albumKey === 'p4J2jk'));
	assert.ok(!vb.some((a) => a.albumKey === 'hoop01'));

	const bb = buildAlbumListing({ photoRows: PHOTO_ROWS, videoRows: VIDEO_ROWS, unlistedKeys: NONE, sport: 'basketball' });
	assert.deepEqual(bb.map((a) => a.albumKey), ['hoop01']);
});

test('year filter includes an album whose last photo is late on Dec 31', () => {
	// The SQL version was `.lte('latest_photo_date', '<year>-12-31')`, and that literal casts
	// to midnight — so this album failed its own year.
	const newYearsEve = [photo('nye123', 'Holiday Classic', 40, '2025-12-31T18:00:00')];
	const list = buildAlbumListing({ photoRows: newYearsEve, videoRows: [], unlistedKeys: NONE, year: '2025' });
	assert.deepEqual(list.map((a) => a.albumKey), ['nye123']);
});

test('an album with no date survives an unfiltered listing but not a year filter', () => {
	const undated = [{ ...photo('nodate', 'Undated', 5, ''), latest_photo_date: null, earliest_photo_date: null }];
	assert.equal(buildAlbumListing({ photoRows: undated, videoRows: [], unlistedKeys: NONE }).length, 1);
	assert.equal(
		buildAlbumListing({ photoRows: undated, videoRows: [], unlistedKeys: NONE, year: '2025' }).length,
		0
	);
});

test('numeric columns arrive as strings from PostgREST and still add up', () => {
	const stringy: AlbumSummaryRow[] = [{ ...photo('str001', 'Stringy', 0, '2026-01-01'), photo_count: '42' as unknown as string }];
	const stringyVideo: VideoSummaryRow[] = [{ ...video('str001', 'Stringy', 0, '2026-01-01'), video_count: '7' as unknown as string }];
	const [card] = buildAlbumListing({ photoRows: stringy, videoRows: stringyVideo, unlistedKeys: NONE });
	assert.deepEqual({ p: card.photoCount, v: card.videoCount }, { p: 42, v: 7 });
});

test('facets come from the whole universe, not the filtered list', () => {
	// Deriving them from filtered rows would collapse the sport dropdown to the current
	// selection with no way back.
	const { sports, years } = listingFacets(PHOTO_ROWS);
	assert.deepEqual(sports, ['basketball', 'volleyball']);
	assert.deepEqual(years, ['2026', '2025']);
});

test('facets skip the unknown sport and undated albums', () => {
	const rows = [
		{ ...photo('a', 'A', 1, '2026-01-01'), primary_sport: 'unknown' },
		{ ...photo('b', 'B', 1, '2026-01-01'), latest_photo_date: null }
	];
	const { sports, years } = listingFacets(rows);
	assert.deepEqual(sports, ['volleyball']);
	assert.deepEqual(years, ['2026']);
});

// videoOnlyRows is the rule three surfaces read now — the listing, the sitemap, and the
// AI album/stats endpoints. Each of them lost two public albums by open-coding it.

/** The keys a caller derives from a photo scan: the four albums that hold both. */
const PHOTO_KEYS = new Set(PHOTO_ROWS.map((r) => r.album_key));

test('videoOnlyRows: a video album that also has photos is not video-only', () => {
	const rows = videoOnlyRows(VIDEO_ROWS, PHOTO_KEYS, NONE);
	assert.deepEqual(rows.map((r) => r.album_key), ['p4J2jk', 'QwhCK5']);
});

test('videoOnlyRows: an unlisted video-only album is excluded', () => {
	const rows = videoOnlyRows(VIDEO_ROWS, PHOTO_KEYS, new Set(['p4J2jk']));
	assert.deepEqual(rows.map((r) => r.album_key), ['QwhCK5']);
});

test('videoOnlyRows: unlisted is not redundant with the photo-key set', () => {
	// The caller's photo keys come from an RLS-gated anon read, so an unlisted album's key is
	// absent from them even though the album HAS photos. Without the unlisted set it would
	// read as video-only and get published.
	const unlistedWithPhotos = video('secret', 'Private Client Session', 3, '2026-05-01');
	const rows = videoOnlyRows([...VIDEO_ROWS, unlistedWithPhotos], PHOTO_KEYS, new Set(['secret']));
	assert.equal(rows.some((r) => r.album_key === 'secret'), false);
});

test('videoOnlyRows: no video albums yields an empty list, not the photo set', () => {
	assert.deepEqual(videoOnlyRows([], PHOTO_KEYS, NONE), []);
});
