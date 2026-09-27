import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	rankPublicAlbums,
	selectLatestAlbum,
	toLatestApiAlbum,
	type LatestPhotoCandidateRow,
	type LatestVideoCandidateRow,
	type AlbumEventDateRow,
	type AlbumSettingsForRanking
} from './latest';

function candidate(
	key: string,
	overrides: Partial<LatestPhotoCandidateRow> = {}
): LatestPhotoCandidateRow {
	return {
		album_key: key,
		album_name: `Album ${key}`,
		cover_cf_image_id: `cover-${key}`,
		photo_count: 10,
		latest_photo_date: '2026-01-01',
		...overrides
	};
}

function videoCandidate(
	key: string,
	overrides: Partial<LatestVideoCandidateRow> = {}
): LatestVideoCandidateRow {
	return {
		album_key: key,
		album_name: `Video Album ${key}`,
		cover_thumbnail_url: `https://videodelivery.net/${key}/thumbnail.jpg`,
		video_count: 3,
		latest_video_date: '2026-01-01',
		...overrides
	};
}

function settings(
	key: string,
	overrides: Partial<AlbumSettingsForRanking> = {}
): AlbumSettingsForRanking {
	return { album_key: key, visibility: 'public', published_at: null, ...overrides };
}

test('orders by published_at descending when every candidate has one', () => {
	const result = rankPublicAlbums({
		candidates: [candidate('a'), candidate('b'), candidate('c')],
		settings: [
			settings('a', { published_at: '2026-09-26T16:00:00Z' }),
			settings('b', { published_at: '2026-09-26T19:00:00Z' }),
			settings('c', { published_at: '2026-09-20T10:00:00Z' })
		]
	});
	assert.deepEqual(
		result.map((r) => r.albumKey),
		['b', 'a', 'c']
	);
});

test('an album with a real published_at outranks one with none, even if its capture date is older', () => {
	const result = rankPublicAlbums({
		candidates: [
			candidate('old-but-published', { latest_photo_date: '2020-01-01' }),
			candidate('recent-but-unpublished', { latest_photo_date: '2026-09-25' })
		],
		settings: [settings('old-but-published', { published_at: '2026-09-26T12:00:00Z' })]
	});
	assert.equal(result[0].albumKey, 'old-but-published');
});

test('falls back to capture date, newest first, when no eligible album has a published_at', () => {
	const result = rankPublicAlbums({
		candidates: [
			candidate('a', { latest_photo_date: '2026-08-01' }),
			candidate('b', { latest_photo_date: '2026-09-26' }),
			candidate('c', { latest_photo_date: '2026-09-01' })
		],
		settings: [] // no album_settings rows at all — every album is legacy-public
	});
	assert.deepEqual(
		result.map((r) => r.albumKey),
		['b', 'c', 'a']
	);
});

test('unlisted albums are never eligible, even with the newest published_at or capture date', () => {
	const result = rankPublicAlbums({
		candidates: [
			candidate('secret', { latest_photo_date: '2026-12-31' }),
			candidate('public-one', { latest_photo_date: '2026-01-01' })
		],
		settings: [
			settings('secret', { visibility: 'unlisted', published_at: '2026-12-31T00:00:00Z' }),
			settings('public-one')
		]
	});
	assert.deepEqual(
		result.map((r) => r.albumKey),
		['public-one']
	);
	assert.equal(
		result.some((r) => r.albumKey === 'secret'),
		false
	);
});

test('an album absent from album_settings entirely (legacy-public) is still eligible, ranked by capture date', () => {
	const result = rankPublicAlbums({
		candidates: [candidate('no-row', { latest_photo_date: '2026-05-05' })],
		settings: []
	});
	assert.deepEqual(
		result.map((r) => r.albumKey),
		['no-row']
	);
	assert.equal(result[0].publishedAt, null);
});

test('selectLatestAlbum returns the top of the ranking, or null when nothing is eligible', () => {
	const winner = selectLatestAlbum({
		candidates: [candidate('a', { latest_photo_date: '2026-01-01' }), candidate('b', { latest_photo_date: '2026-06-01' })],
		settings: []
	});
	assert.equal(winner?.albumKey, 'b');

	const nothing = selectLatestAlbum({
		candidates: [candidate('only-unlisted')],
		settings: [settings('only-unlisted', { visibility: 'unlisted' })]
	});
	assert.equal(nothing, null);

	assert.equal(selectLatestAlbum({ candidates: [], settings: [] }), null);
});

test('rankPublicAlbums supports slicing for a "recent" list (e.g. the top 6)', () => {
	const candidates = Array.from({ length: 10 }, (_, i) =>
		candidate(`k${i}`, { latest_photo_date: `2026-01-${String(i + 1).padStart(2, '0')}` })
	);
	const result = rankPublicAlbums({ candidates, settings: [] }).slice(0, 6);
	assert.equal(result.length, 6);
	assert.deepEqual(
		result.map((r) => r.albumKey),
		['k9', 'k8', 'k7', 'k6', 'k5', 'k4']
	);
});

test('photo_count coerces from a stringy Postgres count, and a missing name falls back', () => {
	const result = rankPublicAlbums({
		candidates: [candidate('a', { photo_count: '42', album_name: null })],
		settings: []
	});
	assert.equal(result[0].photoCount, 42);
	assert.equal(result[0].albumName, 'Untitled Album');
});

test('toLatestApiAlbum builds the album URL from the slug and the cover from cf_image_id, never a filename guess', () => {
	const [ranked] = rankPublicAlbums({
		candidates: [
			candidate('DWdCET', {
				album_name: "College Women's VB - Millikin at North Central - 09-23-2026",
				cover_cf_image_id: 'DWdCET-DSC09484-sdr-99c86cb116',
				photo_count: '43',
				latest_photo_date: '2026-09-23'
			})
		],
		settings: [settings('DWdCET', { published_at: '2026-09-26T19:00:00Z' })]
	});
	const api = toLatestApiAlbum(ranked, { siteUrl: 'https://ninochavez.co/photography' });
	assert.deepEqual(api, {
		album_key: 'DWdCET',
		album_name: "College Women's VB - Millikin at North Central - 09-23-2026",
		url: 'https://ninochavez.co/photography/albums/college-womens-vb-millikin-at-north-central-09-23-2026-DWdCET',
		event_date: '2026-09-23',
		cover_url: 'https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/DWdCET-DSC09484-sdr-99c86cb116/medium',
		photo_count: 43
	});
});

test('eventDate keeps only the calendar-date prefix of a timestamped latest_photo_date', () => {
	const result = rankPublicAlbums({
		candidates: [candidate('a', { latest_photo_date: '2026-09-23T23:45:00+00:00' })],
		settings: []
	});
	assert.equal(result[0].eventDate, '2026-09-23');
});

test('eventDate is null when latest_photo_date is null', () => {
	const result = rankPublicAlbums({
		candidates: [candidate('a', { latest_photo_date: null })],
		settings: []
	});
	assert.equal(result[0].eventDate, null);
});

test('toLatestApiAlbum: cover_url is null when the album has no cover image, not a guessed URL', () => {
	const [ranked] = rankPublicAlbums({
		candidates: [candidate('a', { cover_cf_image_id: null })],
		settings: []
	});
	const api = toLatestApiAlbum(ranked, { siteUrl: 'https://ninochavez.co/photography' });
	assert.equal(api.cover_url, null);
});

// Finding (Codex, P2, thread 4113437859): a video-only publish has no row in `albums_summary`
// (photo-derived), so it could never become "latest" unless the video-only candidate set is
// merged in too — the same gap `$lib/albums/listing`'s `videoOnlyRows` exists to close for the
// main album listing.

test('a video-only album is eligible and can win — it has no albums_summary row at all', () => {
	const result = rankPublicAlbums({
		candidates: [candidate('photo-album', { latest_photo_date: '2026-09-01' })],
		videoCandidates: [videoCandidate('video-only', { latest_video_date: '2026-09-26' })],
		settings: []
	});
	assert.deepEqual(
		result.map((r) => r.albumKey),
		['video-only', 'photo-album']
	);
	assert.equal(result[0].photoCount, 0);
	assert.equal(result[0].coverImageUrl, 'https://videodelivery.net/video-only/thumbnail.jpg');
	assert.equal(result[0].coverCfImageId, null);
});

test('a published video-only album (the no-settings-row case) outranks an unpublished photo album', () => {
	const winner = selectLatestAlbum({
		candidates: [candidate('photo-album')],
		videoCandidates: [videoCandidate('video-only')],
		settings: [settings('video-only', { published_at: '2026-09-26T19:00:00Z' })]
	});
	assert.equal(winner?.albumKey, 'video-only');
});

test('an unlisted video-only album is excluded, same as an unlisted photo album', () => {
	const result = rankPublicAlbums({
		candidates: [],
		videoCandidates: [videoCandidate('secret-video')],
		settings: [settings('secret-video', { visibility: 'unlisted' })]
	});
	assert.deepEqual(result, []);
});

test("toLatestApiAlbum: a video-only album's cover_url uses its raw thumbnail, not a Cloudflare Images URL", () => {
	const [ranked] = rankPublicAlbums({
		candidates: [],
		videoCandidates: [videoCandidate('v1')],
		settings: []
	});
	const api = toLatestApiAlbum(ranked, { siteUrl: 'https://ninochavez.co/photography' });
	assert.equal(api.cover_url, 'https://videodelivery.net/v1/thumbnail.jpg');
	assert.equal(api.photo_count, 0);
});

// Finding (Codex, P2, thread 4113437863): `albums.event_date` is the authoritative event date —
// operator-set or filled once from MIN(photo_date) at ingest — and must win over
// MAX(photo_date)/latest_video_date, which can disagree with it (a multi-day tournament) or
// simply be a later, unrelated re-enrichment timestamp.

test('albums.event_date wins over latest_photo_date for both ranking and the API event_date', () => {
	const albumDates: AlbumEventDateRow[] = [{ album_key: 'a', event_date: '2026-09-20' }];
	const result = rankPublicAlbums({
		candidates: [candidate('a', { latest_photo_date: '2026-09-23' })], // a stray later EXIF timestamp
		settings: [],
		albumDates
	});
	assert.equal(result[0].eventDate, '2026-09-20');
});

test('a multi-day album displays its (earlier) event_date, not its final capture date', () => {
	// A three-day tournament: albums.event_date is the tournament's start; the last photo taken
	// (MAX(photo_date)) is two days later. The authoritative value must win.
	const albumDates: AlbumEventDateRow[] = [{ album_key: 'tourney', event_date: '2026-09-18' }];
	const result = rankPublicAlbums({
		candidates: [candidate('tourney', { latest_photo_date: '2026-09-20T22:00:00Z' })],
		settings: [],
		albumDates
	});
	assert.equal(result[0].eventDate, '2026-09-18');
});

test('falls back to latest_photo_date only when albums.event_date is null or the album has no albums row', () => {
	const albumDates: AlbumEventDateRow[] = [{ album_key: 'a', event_date: null }];
	const result = rankPublicAlbums({
		candidates: [
			candidate('a', { latest_photo_date: '2026-09-23' }), // has an albums row, but event_date is null
			candidate('b', { latest_photo_date: '2026-09-22' }) // no albums row at all
		],
		settings: [],
		albumDates
	});
	assert.deepEqual(
		result.map((r) => ({ key: r.albumKey, date: r.eventDate })),
		[
			{ key: 'a', date: '2026-09-23' },
			{ key: 'b', date: '2026-09-22' }
		]
	);
});

test('albums.event_date also reorders the legacy (no-published_at) ranking, not just the displayed date', () => {
	// Without the authoritative date, 'b' would rank first on latest_photo_date (09-25 > 09-20).
	// With it, 'a's REAL event (09-26) is newer, and must rank first.
	const albumDates: AlbumEventDateRow[] = [
		{ album_key: 'a', event_date: '2026-09-26' },
		{ album_key: 'b', event_date: '2026-09-20' }
	];
	const result = rankPublicAlbums({
		candidates: [
			candidate('a', { latest_photo_date: '2026-09-20' }),
			candidate('b', { latest_photo_date: '2026-09-25' })
		],
		settings: [],
		albumDates
	});
	assert.deepEqual(
		result.map((r) => r.albumKey),
		['a', 'b']
	);
});
