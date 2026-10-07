import assert from 'node:assert/strict';
import test from 'node:test';
import { changeLabel, countLabel, csvRowCount, measureLabel, periodFor, filterParams, photoParams } from './photo-view';
import { parseReportQuery } from './report-contract';
import { savedQueryState } from './saved-views';

const NOW = new Date('2026-10-06T15:00:00Z');

test('every filter the view reads comes back from its own address', () => {
	const asked = parseReportQuery(new URLSearchParams({
		period: 'custom', start: '2026-09-25', end: '2026-10-02', measure: 'downloads', scope: 'selected', albums: 'Re7kho,fJKdsB', traffic: 'inclusive',
		sport: 'volleyball', category: 'action', source: 'profile', event_date: '2026-09-25', season: '2026', event_type: 'tournament', compare: 'custom', compare_start: '2026-09-10', compare_end: '2026-09-17'
	}), NOW);
	for (const rank of ['popular', 'rising', 'recent'] as const) {
		const params = photoParams(asked, rank, 3);
		assert.deepEqual(parseReportQuery(params, NOW), asked, rank);
		assert.equal(params.get('photo_rank'), rank);
		assert.equal(params.get('photo_page'), '3');
	}
});

test('a query with no filters does not invent any', () => {
	const plain = parseReportQuery(new URLSearchParams({ period: '30' }), NOW);
	const params = photoParams(plain, 'popular', 0);
	assert.deepEqual([...params.keys()].sort(), ['albums', 'compare', 'end', 'measure', 'period', 'photo_page', 'photo_rank', 'scope', 'start', 'traffic']);
	assert.deepEqual(parseReportQuery(params, NOW), plain);
});

test('what a view saves is what it reads: saving and reopening agree', () => {
	const asked = parseReportQuery(new URLSearchParams({ period: '7', measure: 'favorites', scope: 'album', albums: 'Re7kho', sport: 'volleyball' }), NOW);
	const stored = savedQueryState(asked);
	const reopened = new URLSearchParams();
	for (const [key, value] of Object.entries(stored)) reopened.set(key, Array.isArray(value) ? value.join(',') : String(value));
	assert.deepEqual(savedQueryState(parseReportQuery(reopened, NOW)), stored);
});

test('the filters alone carry no ranking or page, and are what the CSV takes', () => {
	const asked = parseReportQuery(new URLSearchParams({ period: '7', scope: 'album', albums: 'Re7kho' }), NOW);
	const csv = filterParams(asked);
	assert.equal(csv.has('photo_rank'), false);
	assert.equal(csv.has('photo_page'), false);
	assert.deepEqual(parseReportQuery(csv, NOW), asked);
});

test('the period picker names 7, 30 and 90 days and calls anything else custom', () => {
	assert.equal(periodFor('2026-09-29', '2026-10-05'), '7');
	assert.equal(periodFor('2026-09-06', '2026-10-05'), '30');
	assert.equal(periodFor('2026-07-08', '2026-10-05'), '90');
	assert.equal(periodFor('2026-09-25', '2026-10-02'), 'custom');
});

test('a change says what kind of comparison it is, and never invents one', () => {
	const across = { compare: 'previous' as const, basis: 'absolute' as const, currentDays: 30, previousDays: 30 };
	const rate = { ...across, basis: 'daily_rate' as const, currentDays: 10, previousDays: 30 };
	const item = { count: 20, previousCount: 10, difference: 10, newAlbum: false };
	assert.equal(changeLabel(item, across), '+10');
	assert.equal(changeLabel({ ...item, count: 5, difference: -5 }, across), '-5');
	assert.equal(changeLabel({ ...item, count: 10, difference: 0 }, across), 'No change');
	assert.equal(changeLabel({ ...item, previousCount: 0 }, across), 'New activity');
	assert.equal(changeLabel({ ...item, difference: null }, across), 'Comparison unavailable');
	assert.equal(changeLabel({ ...item, newAlbum: true }, across), 'New album');
	assert.equal(changeLabel(item, { ...across, compare: 'none' }), 'No comparison selected');
	// 20 in 10 days against 10 in 30 days is 2.0 a day against 0.33: a daily rate, not a raw difference.
	assert.equal(changeLabel(item, rate), '+1.7 actions/day');
});

test('a count says when it is only what was recorded', () => {
	assert.equal(countLabel(1234, 'complete'), '1,234');
	assert.equal(countLabel(1234, 'partial'), '1,234 recorded');
	assert.equal(countLabel(null, 'complete'), 'Unavailable');
	assert.equal(measureLabel('photo_opens'), 'Photo opens');
	assert.equal(measureLabel('downloads'), 'Downloads');
});

test('the CSV button counts the rows the file really has', () => {
	assert.equal(csvRowCount('photo_opens', 254, 2224, 40), 2264);
	assert.equal(csvRowCount('album_opens', 254, 2224, 40), 254);
});
