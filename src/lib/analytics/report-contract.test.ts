import assert from 'node:assert/strict';
import test from 'node:test';
import { assertReportDateBounds, chicagoDayStart, comparisonWindow, coverageFor, coverageFromStates, datesInclusive, parseReportQuery, previousWindow, publishedAfterComparison, rising, risingComparison, risingValue, sumMeasure, type DailyActionRow } from './report-contract';

const row = (overrides: Partial<DailyActionRow> = {}): DailyActionRow => ({
	bucket_date: '2026-09-14', album_key: 'a', photo_id: 'p', event_type: 'view', source: 'direct', source_kind: 'internal_open_location',
	sport: 'volleyball', photo_category: 'action', traffic_classification: 'audience', action_count: 2,
	coverage_state: 'complete', ...overrides
});

test('uses Chicago calendar dates and only complete days by default', () => {
	const query = parseReportQuery(new URLSearchParams(), new Date('2026-09-28T17:00:00Z'));
	assert.equal(query.end, '2026-09-27');
	assert.equal(query.start, '2026-08-29');
});

test('custom intervals normalize inversion and preserve exact filters', () => {
	const query = parseReportQuery(new URLSearchParams('period=custom&start=2026-09-20&end=2026-09-10&scope=selected&albums=a,b&traffic=inclusive&measure=downloads&event_date=2026-09-12&season=2026&event_type=tournament&compare=publication_age'));
	assert.deepEqual({ start: query.start, end: query.end, scope: query.scope, traffic: query.traffic, measure: query.measure, eventDate: query.eventDate, season: query.season, albumEventType: query.albumEventType, compare: query.compare },
		{ start: '2026-09-10', end: '2026-09-20', scope: 'selected', traffic: 'inclusive', measure: 'downloads', eventDate: '2026-09-12', season: '2026', albumEventType: 'tournament', compare: 'publication_age' });
});

test('invalid dates cannot expand a report beyond its bounded fallback', () => {
	const query = parseReportQuery(new URLSearchParams('period=custom&start=not-a-date&end=2026-02-30'), new Date('2026-09-28T17:00:00Z'));
	assert.equal(query.end, '2026-09-27');
	assert.equal(query.start, '2026-08-29');
});

test('long history stays available while extreme ranges fail before work begins', () => {
	const long = parseReportQuery(new URLSearchParams('period=custom&start=2025-01-01&end=2026-09-28&compare=none'));
	assert.doesNotThrow(() => assertReportDateBounds(long));
	assert.doesNotThrow(() => assertReportDateBounds(long, 'export'));
	const excessive = parseReportQuery(new URLSearchParams('period=custom&start=2010-01-01&end=2026-09-28&compare=none'));
	assert.throws(() => assertReportDateBounds(excessive), /Interactive reports allow at most 3650 days/i);
	assert.throws(() => assertReportDateBounds(excessive, 'export'), /Export reports allow at most 3650 days/i);
});

test('previous comparison window is equal-sized and immediately preceding', () => {
	assert.deepEqual(previousWindow({ start: '2026-09-10', end: '2026-09-16' }), { start: '2026-09-03', end: '2026-09-09' });
});

test('custom comparison uses its own normalized date window', () => {
	const query = parseReportQuery(new URLSearchParams('period=custom&start=2026-09-10&end=2026-09-16&compare=custom&compare_start=2026-08-20&compare_end=2026-08-14'));
	assert.deepEqual(comparisonWindow(query), { start: '2026-08-14', end: '2026-08-20' });
});

test('conservative reports exclude known operator and crawler activity but retain unknown', () => {
	const query = parseReportQuery(new URLSearchParams('period=custom&start=2026-09-01&end=2026-09-30'));
	assert.equal(sumMeasure([row(), row({ traffic_classification: 'operator' }), row({ traffic_classification: 'known_crawler' }), row({ traffic_classification: 'unclassified' })], query), 4);
});

test('coverage and rising labels never turn a gap or zero baseline into a false zero', () => {
	const query = parseReportQuery(new URLSearchParams('period=custom&start=2026-09-01&end=2026-09-30'));
	assert.equal(coverageFor([], query), 'unavailable');
	assert.equal(coverageFromStates(['complete', 'complete']), 'complete');
	assert.equal(coverageFromStates(['complete', 'partial']), 'partial');
	assert.deepEqual(datesInclusive('2026-09-27', '2026-09-28'), ['2026-09-27', '2026-09-28']);
	assert.equal(coverageFor([row({ coverage_state: 'partial' })], query), 'partial');
	assert.deepEqual(rising(5, 0), { difference: 5, label: 'New activity' });
});

test('rising never falls back to popularity and normalizes unequal complete windows', () => {
	const noComparator = parseReportQuery(new URLSearchParams('period=7&compare=none'));
	assert.equal(risingComparison(noComparator, 'complete', 'unavailable').available, false);
	const unequal = parseReportQuery(new URLSearchParams('period=custom&start=2026-09-01&end=2026-09-30&compare=custom&compare_start=2026-08-01&compare_end=2026-08-07'));
	const comparison = risingComparison(unequal, 'complete', 'complete');
	assert.equal(comparison.basis, 'daily_rate');
	// 30 actions over 30 days fell from 14 over 7 days; raw +16 must not read as rising.
	assert.equal(risingValue(30, 14, comparison), -1);
	assert.equal(risingComparison(unequal, 'partial', 'complete').available, false);
});

test('tagged arrivals are not counted as photo opens', () => {
	const query = parseReportQuery(new URLSearchParams('period=custom&start=2026-09-01&end=2026-09-30'));
	assert.equal(sumMeasure([row(), row({ photo_id: '', source_kind: 'tagged_arrival' })], query), 2);
});

 test('Chicago raw event bounds follow both daylight saving transitions',()=>{
 assert.equal(chicagoDayStart('2026-03-08'),'2026-03-08T06:00:00.000Z');
 assert.equal(chicagoDayStart('2026-03-09'),'2026-03-09T05:00:00.000Z');
 assert.equal(chicagoDayStart('2026-11-01'),'2026-11-01T05:00:00.000Z');
 assert.equal(chicagoDayStart('2026-11-02'),'2026-11-02T06:00:00.000Z');
 });

test('an album published after the comparison window is new, not growth from zero', () => {
	const query = parseReportQuery(new URLSearchParams('period=custom&start=2026-09-05&end=2026-10-04'));
	// Previous window ends 2026-09-04 (Chicago).
	assert.equal(publishedAfterComparison('2026-09-26T15:00:00Z', query), true);
	assert.equal(publishedAfterComparison('2026-09-05T04:30:00Z', query), false, 'still Sep 4 in Chicago');
	assert.equal(publishedAfterComparison('2026-08-20T12:00:00Z', query), false);
	assert.equal(publishedAfterComparison(null, query), false, 'never inferred from other dates');
	assert.equal(publishedAfterComparison('2026-09-26T15:00:00Z', { ...query, compare: 'none' }), false);
});
