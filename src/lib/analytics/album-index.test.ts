import assert from 'node:assert/strict';
import test from 'node:test';
import type { Launch, LaunchAgeTotals, LaunchDay } from './launch-read-model.server';
import { buildAlbumIndex, figureText, launchRow, matchesName, parseCompare, rankText, statusText, undatedCounts, undatedReasonCode, undatedReasonShort, type AlbumActivity, type AlbumSetting } from './album-index';
import { undatedReason } from './launch-recap';

const addDays = (date: string, n: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const TODAY = '2026-10-06';

/** A launch whose day 0 is `start` and whose complete days are `opens`. `null` is a day with unavailable records. */
function launch(key: string, start: string, opens: Array<number | null>, over: Partial<Launch> = {}): Launch {
	const series: LaunchDay[] = opens.map((n, i) => ({ day: i, date: addDays(start, i), photoOpens: n, downloads: n === null ? null : Math.round(n / 10), albumOpens: n === null ? null : 1, coverage: n === null ? 'unavailable' : 'complete' }));
	const total = (n: number): LaunchAgeTotals => {
		const days = series.slice(0, n);
		const reached = series.length >= n;
		const complete = reached && days.every((d) => d.coverage === 'complete');
		return { reached, complete, photoOpens: complete ? days.reduce((a, d) => a + d.photoOpens!, 0) : null, downloads: complete ? days.reduce((a, d) => a + d.downloads!, 0) : null, albumOpens: complete ? n : null };
	};
	return {
		albumKey: key, albumName: `Album ${key}`, firstPublishedAt: `${start}T20:00:00.000Z`, basis: 'inferred', status: series.length >= 7 ? 'finished' : 'in_progress', elapsedDays: series.length, series, currentDay: null,
		totals: { day3: total(3), day7: total(7) }, rank: { day3: { rank: 1, compared: 3, tied: false }, day7: { rank: 2, compared: 3, tied: false } }, ...over
	};
}

const settings: AlbumSetting[] = [
	{ albumKey: 'A', visibility: 'public', basis: 'inferred' },
	{ albumKey: 'B', visibility: 'public', basis: 'unobserved' },
	{ albumKey: 'C', visibility: 'unlisted', basis: 'unobserved' },
	{ albumKey: 'D', visibility: 'unlisted', basis: null }
];
const zero = { photo_opens: 0, album_opens: 0, downloads: 0, favorites: 0, shares: 0 };

test('a launch past its first week states its figures and its rank at day 7 of the launches compared', () => {
	const row = launchRow(launch('A', '2026-09-20', [10, 20, 30, 5, 5, 5, 5, 1, 1]), null, 120);
	assert.equal(row.day3.state, 'ok');
	assert.equal(row.day3.value, 60);
	assert.equal(row.week1.value, 80);
	assert.deepEqual(row.rank, { state: 'ranked', rank: 2, compared: 3, tied: false });
	assert.equal(rankText(row.rank), '2nd of 3');
	assert.equal(statusText(row.status), 'Finished');
	assert.equal(row.published, '2026-09-20');
	assert.equal(row.inferred, true);
	assert.equal(row.photos, 120);
});

test('a tie is said, and the denominator is the read model\'s own count, not the number of launches listed', () => {
	const row = launchRow(launch('A', '2026-09-20', [1, 1, 1, 1, 1, 1, 1], { rank: { day3: { rank: 2, compared: 5, tied: true }, day7: { rank: 2, compared: 5, tied: true } } }), null, null);
	assert.equal(rankText(row.rank), 'Tied 2nd of 5');
});

test('a launch younger than 7 days shows partial figures labelled so far, is not ranked at day 7, and says which day it is on', () => {
	const row = launchRow(launch('A', '2026-10-01', [10, 20, 30, 5], { rank: { day3: { rank: 1, compared: 3, tied: false }, day7: { rank: null, compared: 2, tied: false } } }), null, null);
	assert.equal(statusText(row.status), 'Day 4 so far');
	assert.deepEqual(row.day3, { state: 'ok', value: 60 });
	assert.deepEqual(row.week1, { state: 'so_far', value: 65 });
	assert.equal(figureText(row.week1), '65 so far');
	assert.equal(row.rank.state, 'not_yet');
	assert.equal(rankText(row.rank), 'After day 7');
	assert.deepEqual(row.downloads, { state: 'so_far', value: 7 });
});

test('before day 3 the first-3-days figure is a so-far figure too', () => {
	const row = launchRow(launch('A', '2026-10-04', [10, 20]), null, null);
	assert.deepEqual(row.day3, { state: 'so_far', value: 30 });
	assert.equal(figureText(row.day3), '30 so far');
});

test('a launch published today has no full day: nothing is stated and nothing is zero', () => {
	const row = launchRow(launch('A', '2026-10-06', []), null, null);
	assert.equal(statusText(row.status), 'Published today');
	assert.equal(row.day3.state, 'not_yet');
	assert.equal(row.week1.state, 'not_yet');
	assert.equal(figureText(row.week1), 'Not yet');
	assert.equal(row.week1.value, null);
});

test('a gap is Incomplete, never a number, and never a rank', () => {
	const row = launchRow(launch('A', '2026-09-20', [10, null, 30, 5, 5, 5, 5, 1]), null, null);
	assert.equal(row.day3.state, 'incomplete');
	assert.equal(row.day3.value, null);
	assert.equal(figureText(row.day3), 'Incomplete');
	assert.equal(row.week1.state, 'incomplete');
	assert.equal(row.rank.state, 'incomplete');
	assert.equal(rankText(row.rank), 'Incomplete');
	// A gap inside a launch that has not reached the age also withholds the so-far figure.
	const young = launchRow(launch('A', '2026-10-03', [10, null, 30]), null, null);
	assert.equal(young.week1.state, 'incomplete');
	assert.equal(young.week1.value, null);
});

test('the overlay curve stops before the first incomplete day', () => {
	const row = launchRow(launch('A', '2026-09-20', [10, 20, null, 5]), null, null);
	assert.deepEqual(row.curve.points, [{ day: 0, total: 10 }, { day: 1, total: 30 }]);
	assert.equal(row.curve.cutByGap, true);
});

test('why an album has no launch date follows the launch function\'s precedence, and a missing settings row means public', () => {
	assert.equal(undatedReasonCode({ visibility: 'public', basis: 'unobserved' }), 'unobserved');
	assert.equal(undatedReasonCode({ visibility: 'unlisted', basis: 'unobserved' }), 'unobserved');
	assert.equal(undatedReasonCode({ visibility: 'unlisted', basis: null }), 'not_published');
	assert.equal(undatedReasonCode({ visibility: 'public', basis: null }), 'no_record');
	assert.equal(undatedReasonCode(undefined), 'no_record');
	// Every code has a short and a full reason that agree on the idea.
	for (const code of ['unobserved', 'not_published', 'no_record'] as const) {
		assert.ok(undatedReason(code).length > 0);
		assert.ok(undatedReasonShort(code).length > 0);
	}
	assert.notEqual(undatedReasonShort('unobserved'), undatedReasonShort('no_record'));
});

const catalogue = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((albumKey) => ({ albumKey, name: `Name ${albumKey}`, photos: 10 }));
const activity: AlbumActivity[] = [
	{ albumKey: 'A', count: 500, lastActivity: '2026-10-02T12:00:00Z', measures: { ...zero, photo_opens: 500 } },
	{ albumKey: 'B', count: 0, lastActivity: null, measures: zero },
	{ albumKey: 'C', count: 9, lastActivity: '2026-10-02T12:00:00Z', measures: { ...zero, photo_opens: 9 } },
	{ albumKey: 'E', count: 7, lastActivity: '2026-09-20T12:00:00Z', measures: { ...zero, photo_opens: 7 } },
	{ albumKey: 'F', count: 0, lastActivity: '2026-09-21T12:00:00Z', measures: { ...zero, album_opens: 3 } },
	{ albumKey: 'G', count: null, lastActivity: null, measures: { ...zero, photo_opens: null } }
];
const window = { start: '2026-09-06', end: '2026-10-05' };
const base = { asOf: '2026-10-06T15:00:00Z', today: TODAY, window, catalogue, settings };

test('unlisted albums are in no list, no count and no row: not launches, not undated, not in the totals', () => {
	const index = buildAlbumIndex({ ...base, launches: [launch('A', '2026-09-20', [1, 2, 3, 4, 5, 6, 7]), launch('C', '2026-09-20', [1, 2, 3, 4, 5, 6, 7])], activity });
	assert.deepEqual(index.launches.map((row) => row.albumKey), ['A']);
	assert.ok(!index.undated.some((row) => ['C', 'D'].includes(row.albumKey)));
	assert.equal(index.publicAlbums, 5);
	assert.equal(index.launches.length + index.undated.length, 5);
});

test('an album with a launch is never also listed without one', () => {
	const index = buildAlbumIndex({ ...base, launches: [launch('A', '2026-09-20', [1, 2, 3, 4, 5, 6, 7])], activity });
	assert.ok(!index.undated.some((row) => row.albumKey === 'A'));
	assert.deepEqual(index.undated.map((row) => row.albumKey).sort(), ['B', 'E', 'F', 'G']);
});

test('albums without a launch date run from most photo opens down; unknown counts go last and are not a quiet album', () => {
	const index = buildAlbumIndex({ ...base, launches: [], activity });
	assert.deepEqual(index.undated.map((row) => row.albumKey), ['A', 'E', 'F', 'B', 'G']);
	const g = index.undated.find((row) => row.albumKey === 'G')!;
	assert.equal(g.photoOpens, null);
	assert.equal(g.noActivity, false);
});

test('"no activity" means every measure is a recorded zero; zero photo opens with an album open is activity', () => {
	const index = buildAlbumIndex({ ...base, launches: [], activity });
	const quiet = index.undated.filter((row) => row.noActivity).map((row) => row.albumKey);
	assert.deepEqual(quiet, ['B']);
	assert.equal(index.undated.find((row) => row.albumKey === 'F')!.photoOpens, 0);
	assert.equal(index.undated.find((row) => row.albumKey === 'F')!.noActivity, false);
});

test('an album the report does not mention is unknown, not a recorded zero', () => {
	const index = buildAlbumIndex({ ...base, launches: [], activity: activity.filter((row) => row.albumKey !== 'B') });
	const b = index.undated.find((row) => row.albumKey === 'B')!;
	assert.equal(b.photoOpens, null);
	assert.equal(b.noActivity, false);
});

test('when the 30-day counts could not be read, no album gets a count and none is called quiet', () => {
	const index = buildAlbumIndex({ ...base, launches: [], activity: null });
	assert.equal(index.activityAvailable, false);
	assert.ok(index.undated.every((row) => row.photoOpens === null && !row.noActivity));
	assert.equal(index.undated.length, 5);
});

test('last activity is the Chicago day', () => {
	const index = buildAlbumIndex({ ...base, launches: [], activity: [{ albumKey: 'A', count: 1, lastActivity: '2026-10-03T03:30:00Z', measures: { ...zero, photo_opens: 1 } }] });
	assert.equal(index.undated.find((row) => row.albumKey === 'A')!.lastActivity, '2026-10-02');
});

test('searching by name matches every typed word in any order, ignoring case', () => {
	assert.equal(matchesName('HS Girls VB - JCA at ACC - 09-22-2026', 'jca'), true);
	assert.equal(matchesName('HS Girls VB - JCA at ACC - 09-22-2026', 'acc jca'), true);
	assert.equal(matchesName('HS Girls VB - JCA at ACC - 09-22-2026', 'jca drakes'), false);
	assert.equal(matchesName('anything', '   '), true);
});

test('the compare choice keeps only known launches, once each, at most four', () => {
	const keys = ['a', 'b', 'c', 'd', 'e'];
	assert.deepEqual(parseCompare('a,b,a,zzz,..,c', keys), ['a', 'b', 'c']);
	assert.deepEqual(parseCompare('a,b,c,d,e', keys), ['a', 'b', 'c', 'd']);
	assert.deepEqual(parseCompare(null, keys), []);
	assert.deepEqual(parseCompare('<script>,a%2Fb', keys), []);
});

test('the headline splits the albums without a launch date into the two lists beneath it, so 247 is 130 and 117', () => {
	// Production, 2026-10-07: 247 public albums have no launch date; 130 had activity in the last 30 days and 117 had none.
	assert.equal(undatedCounts(130, 117, 30), '130 had activity in the last 30 days and 117 had none');
	assert.equal(undatedCounts(0, 12, 30), 'none had activity in the last 30 days');
	assert.equal(undatedCounts(12, 0, 30), 'all had activity in the last 30 days');
	assert.equal(undatedCounts(1, 1, 30), '1 had activity in the last 30 days and 1 had none');
});
