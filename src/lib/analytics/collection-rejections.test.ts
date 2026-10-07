import assert from 'node:assert/strict';
import test from 'node:test';
import { aboutTimes, readRejections, REJECTION_BASELINE_DAYS, type DeliveryDay } from './collection-rejections';
import { formatDay } from './launch-recap';

/*
 * The first fixture is production's `analytics_collection_delivery_counters`, read-only on 2026-10-07: about 400 rejected a day
 * from Sep 29 to Oct 1, then 12,865 to 27,842 a day from Oct 2, while accepted events stayed in their usual range.
 */
const PRODUCTION: DeliveryDay[] = [
	{ date: '2026-09-29', accepted: 125, rejected: 395, duplicate: 3 },
	{ date: '2026-09-30', accepted: 572, rejected: 433, duplicate: 5 },
	{ date: '2026-10-01', accepted: 648, rejected: 420, duplicate: 12 },
	{ date: '2026-10-02', accepted: 682, rejected: 24882, duplicate: 2 },
	{ date: '2026-10-03', accepted: 117, rejected: 27842, duplicate: 9 },
	{ date: '2026-10-04', accepted: 388, rejected: 23316, duplicate: 17 },
	{ date: '2026-10-05', accepted: 124, rejected: 20528, duplicate: 11 },
	{ date: '2026-10-06', accepted: 806, rejected: 12865, duplicate: 10 },
	{ date: '2026-10-07', accepted: 123, rejected: 3913, duplicate: 1 }
];
const read = (days: DeliveryDay[], lastCompleteDay = '2026-10-06') => readRejections({ days, lastCompleteDay, formatDay });
const flat = (start: string, values: number[], accepted = 500): DeliveryDay[] => values.map((rejected, i) => {
	const d = new Date(`${start}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i);
	return { date: d.toISOString().slice(0, 10), accepted, rejected, duplicate: 0 };
});

test('production on Oct 7: rejected events are about 50 times their usual rate since Oct 2, and the cause is not claimed', () => {
	const reading = read(PRODUCTION);
	assert.equal(reading.kind, 'unusual');
	if (reading.kind !== 'unusual') return;
	assert.equal(reading.since, '2026-10-02');
	assert.equal(reading.usualPerDay, 420);
	assert.equal(Math.round(reading.recentPerDay), 21887);
	assert.equal(reading.headline, 'Rejected events are about 50 times their usual rate since Oct 2. The cause is not recorded yet.');
	assert.equal(reading.accepted, 'usual');
	assert.equal(reading.sentence, 'Rejected events are about 50 times their usual rate since Oct 2. The cause is not recorded yet. They have averaged 21,887 a day against about 420 before. Accepted events are at about their usual rate.');
	assert.doesNotMatch(reading.sentence, /because|due to|caused by|bot|crawler|attack/i);
});

test('today is partial and never counted: the surge starts on a complete day and today\'s 3,913 does not enter the average', () => {
	const reading = read(PRODUCTION);
	if (reading.kind !== 'unusual') throw new Error('expected a surge');
	const withoutToday = read(PRODUCTION.slice(0, -1));
	if (withoutToday.kind !== 'unusual') throw new Error('expected a surge');
	assert.equal(reading.recentPerDay, withoutToday.recentPerDay);
});

test('no baseline: fewer than three complete days before the days judged says there is no usual rate, and makes no claim', () => {
	for (const days of [[], PRODUCTION.slice(0, 1), PRODUCTION.slice(0, REJECTION_BASELINE_DAYS - 1)]) {
		const reading = read(days);
		assert.equal(reading.kind, 'no_baseline');
		assert.equal(reading.headline, null);
		assert.match(reading.sentence, /^There are too few earlier days to say whether this many rejected events is usual\./);
	}
	// Three days of history is a baseline; a fourth that jumps is judged against it.
	assert.equal(read(PRODUCTION.slice(0, 4)).kind, 'unusual');
	// Today is not a complete day, so a gallery whose only fourth day is today still has no usual rate.
	assert.equal(read(PRODUCTION.slice(0, 4), '2026-10-01').kind, 'no_baseline');
});

test('a steady rate is usual and says what the usual rate is; no headline is raised', () => {
	const reading = read(flat('2026-09-20', [380, 410, 395, 440, 402, 399, 415]), '2026-09-26');
	assert.equal(reading.kind, 'usual');
	assert.equal(reading.headline, null);
	assert.equal(reading.sentence, 'Rejected events are at their usual rate, about 402 a day.');
});

test('a quiet gallery\'s small numbers are never a surge, even at many times a tiny usual rate', () => {
	assert.equal(read(flat('2026-09-20', [0, 1, 0, 40, 60, 0]), '2026-09-25').kind, 'usual');
	assert.equal(read(flat('2026-09-20', [2, 3, 2, 99]), '2026-09-23').kind, 'usual');
});

test('from almost none, a surge says so without dividing by zero', () => {
	const reading = read(flat('2026-09-20', [0, 0, 0, 500, 700]), '2026-09-24');
	assert.equal(reading.kind, 'unusual');
	if (reading.kind !== 'unusual') return;
	assert.equal(reading.times, null);
	assert.equal(reading.headline, 'Rejected events have averaged 600 a day since Sep 23, against almost none before. The cause is not recorded yet.');
});

test('a surge that has ended is reported as back to usual, with the days it lasted and no cause', () => {
	const reading = read(flat('2026-09-20', [400, 410, 390, 9000, 8000, 420, 410]), '2026-09-26');
	assert.equal(reading.kind, 'usual');
	if (reading.kind !== 'usual') return;
	assert.deepEqual(reading.earlierSurge, { from: '2026-09-23', to: '2026-09-24' });
	assert.equal(reading.sentence, 'Rejected events are back to their usual rate, about 410 a day. They were unusually high from Sep 23 to Sep 24, and the cause is not recorded.');
});

test('accepted events that fell with the surge are said to be lower, because that could be lost data', () => {
	const days = flat('2026-09-20', [400, 410, 390, 9000, 9500]);
	days[3].accepted = 100;
	days[4].accepted = 120;
	const reading = read(days, '2026-09-24');
	if (reading.kind !== 'unusual') throw new Error('expected a surge');
	assert.equal(reading.accepted, 'lower');
	assert.match(reading.sentence, /Accepted events are also lower than usual\.$/);
});

test('ratios are said roughly: half steps under 10, whole under 20, fives under 100, tens above', () => {
	assert.equal(aboutTimes(3.2), '3');
	assert.equal(aboutTimes(7.3), '7.5');
	assert.equal(aboutTimes(14.4), '14');
	assert.equal(aboutTimes(52), '50');
	assert.equal(aboutTimes(57), '55');
	assert.equal(aboutTimes(234), '230');
});
