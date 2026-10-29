import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMeasurementHealth, parseRejectionDays, rejectionReading, rejectionsFromHealth, type RejectionDay } from './measurement-health';

/* Daily rejections from the collector's counter, read 2026-10-07. Oct 2 to Oct 6 are its exact figures. Sep 29 to Oct 1 are
 * stand-ins inside the range that read reported, about 400 to 430 a day. */
const REAL: RejectionDay[] = [
	['2026-09-29', 412], ['2026-09-30', 431], ['2026-10-01', 405], ['2026-10-02', 24882], ['2026-10-03', 27842], ['2026-10-04', 23316], ['2026-10-05', 20528], ['2026-10-06', 12865]
].map(([day, count]) => ({ day: day as string, reason: 'not_recorded', count: count as number }));

const quiet = (last: string, days: number, perDay: number, reason = 'known_crawler'): RejectionDay[] => Array.from({ length: days }, (_, i) => {
	const date = new Date(`${last}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - i);
	return { day: date.toISOString().slice(0, 10), reason, count: perDay };
});

test('the Oct 2 surge reads as a surge on every surge day, against the quiet days before it', () => {
	for (const day of ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06']) {
		const reading = rejectionReading(REAL, day)!;
		assert.equal(reading.surge, true, day);
		// A quartile, not the median: on Oct 6 four of the seven earlier days are surge days, and the usual stays quiet.
		assert.ok(reading.usual! >= 405 && reading.usual! <= 431, `${day} usual ${reading.usual}`);
		assert.equal(reading.notRecorded, reading.count);
	}
	assert.equal(rejectionReading(REAL, '2026-10-06')!.usual, 412);
	assert.equal(rejectionReading(REAL, '2026-10-06')!.count, 12865);
});

test('no usual rate is stated from fewer than three earlier days, and days before the first record are not zeros', () => {
	const sep30 = rejectionReading(REAL, '2026-09-30')!;
	assert.equal(sep30.usual, null);
	assert.equal(sep30.surge, false);
	// Oct 2 has three earlier days (Sep 29 to Oct 1), so its usual is stated, from them only: the quietest of the three.
	assert.equal(rejectionReading(REAL, '2026-10-02')!.usual, 405);
});

test('an ordinary day is not a surge; the ratio and the floor must both be met', () => {
	assert.equal(rejectionReading(quiet('2026-10-20', 15, 420), '2026-10-20')!.surge, false);
	// Fail on purpose: the same history with a day six times the usual is a surge.
	const loud = [...quiet('2026-10-19', 14, 420), { day: '2026-10-20', reason: 'known_crawler', count: 2600 }];
	assert.equal(rejectionReading(loud, '2026-10-20')!.surge, true);
	// Forty times a tiny usual is still under the floor of 500 more.
	const small = [...quiet('2026-10-19', 14, 10), { day: '2026-10-20', reason: 'known_crawler', count: 400 }];
	assert.equal(rejectionReading(small, '2026-10-20')!.surge, false);
	// A day with no row after the first record is a real zero.
	assert.equal(rejectionReading([{ day: '2026-10-01', reason: 'invalid_event', count: 3 }, { day: '2026-10-20', reason: 'invalid_event', count: 1 }], '2026-10-20')!.usual, 0);
});

test('the judged day is split by kind', () => {
	const day: RejectionDay[] = [
		{ day: '2026-10-20', reason: 'known_crawler', count: 900 }, { day: '2026-10-20', reason: 'accept_failed', count: 2 }, { day: '2026-10-20', reason: 'target_lookup_failed', count: 1 },
		{ day: '2026-10-20', reason: 'unknown_target', count: 4 }, { day: '2026-10-19', reason: 'known_crawler', count: 7 }
	];
	const reading = rejectionReading(day, '2026-10-20')!;
	assert.deepEqual({ count: reading.count, crawler: reading.crawler, unstored: reading.unstored, notRecorded: reading.notRecorded, other: reading.other }, { count: 907, crawler: 900, unstored: 3, notRecorded: 0, other: 4 });
	assert.equal(rejectionReading([], '2026-10-20'), null);
});

test('the day list is unknown, never empty, when absent or malformed', () => {
	assert.equal(parseRejectionDays(undefined), null);
	assert.equal(parseRejectionDays([{ day: 'Oct 2', reason: 'known_crawler', count: 1 }]), null);
	assert.equal(parseRejectionDays([{ day: '2026-10-02', reason: 'known_crawler', count: -1 }]), null);
	assert.deepEqual(parseRejectionDays([]), []);
	assert.equal(parseMeasurementHealth({ pending: 0 }).rejectedDays, null);
	assert.equal(parseMeasurementHealth(null).rejectedDays, null);
	assert.equal(rejectionsFromHealth({ collection_rejected_days: REAL }, '2026-10-06')!.surge, true);
	assert.equal(rejectionsFromHealth({ pending: 0 }, '2026-10-06'), null);
});
