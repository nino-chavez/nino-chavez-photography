import assert from 'node:assert/strict';
import test from 'node:test';
import {
	addCalendarDays, chicagoDay, chicagoWallTimeToUtc, dueRecaps, isRecapCheckpoint, MAX_RECAPS_PER_RUN, RECAP_CATCH_UP_DAYS, RECAP_CHECKPOINTS, RECAP_LATE_AFTER_MINUTES, RECAP_SETTLE_HOURS,
	recapKey, recapSlot, recapSlots, type RecapLaunch
} from './launch-recap-schedule';

const launch = (albumKey: string, firstPublishedAt: string, basis: 'recorded' | 'inferred' = 'recorded'): RecapLaunch => ({ albumKey, albumName: `Album ${albumKey}`, firstPublishedAt, basis });
const at = (iso: string) => new Date(iso);

test('the named constants are the decision: day 3 and day 7, 08:00 Chicago, a 15 minute late line, a bounded catch-up', () => {
	assert.deepEqual([...RECAP_CHECKPOINTS], [3, 7]);
	assert.equal(RECAP_LATE_AFTER_MINUTES, 15);
	assert.equal(RECAP_CATCH_UP_DAYS, 3);
	assert.equal(RECAP_SETTLE_HOURS, 6);
	assert.equal(MAX_RECAPS_PER_RUN, 3);
	assert.equal(isRecapCheckpoint(3), true);
	assert.equal(isRecapCheckpoint(7), true);
	assert.equal(isRecapCheckpoint(5), false);
	assert.equal(isRecapCheckpoint('3'), false);
});

test('Chicago wall time converts through both DST changes', () => {
	assert.equal(chicagoWallTimeToUtc('2026-03-08'), '2026-03-08T13:00:00.000Z', 'CDT begins that day; 08:00 is UTC-5');
	assert.equal(chicagoWallTimeToUtc('2026-03-07'), '2026-03-07T14:00:00.000Z', 'the day before it is still CST, UTC-6');
	assert.equal(chicagoWallTimeToUtc('2026-11-01'), '2026-11-01T14:00:00.000Z', 'CST returns that day; 08:00 is UTC-6');
	assert.equal(chicagoWallTimeToUtc('2026-10-31'), '2026-10-31T13:00:00.000Z');
});

test('due times: the first publication Chicago date plus 3 or 7 days, at 08:00 Chicago', () => {
	// JCA at ACC went public at 01:10 UTC on Sep 26, which is the evening of Sep 25 in Chicago. Day 0 is Sep 25.
	const jca = launch('Re7kho', '2026-09-26T01:10:52Z', 'inferred');
	const day3 = recapSlot(jca, 3, at('2026-09-20T00:00:00Z'));
	const day7 = recapSlot(jca, 7, at('2026-09-20T00:00:00Z'));
	assert.equal(day3.dueDate, '2026-09-28');
	assert.equal(day3.dueAt, '2026-09-28T13:00:00.000Z');
	assert.equal(day7.dueDate, '2026-10-02');
	assert.equal(day7.dueAt, '2026-10-02T13:00:00.000Z');
	assert.equal(day3.key, 'launch:Re7kho:day3');
	assert.equal(day3.inferred, true);
	assert.equal(recapSlot(launch('x', '2026-09-25T15:00:00Z'), 3, at('2026-09-20T00:00:00Z')).inferred, false);
});

test('a launch published after 18:00 local is still counted from its Chicago date, not the UTC date', () => {
	const slot = recapSlot(launch('late-night', '2026-09-26T04:30:00Z'), 3, at('2026-09-20T00:00:00Z'));
	assert.equal(chicagoDay('2026-09-26T04:30:00Z'), '2026-09-25');
	assert.equal(slot.dueDate, '2026-09-28');
});

test('DST between publication and checkpoint moves nothing: the date is added in calendar days, the time stays 08:00', () => {
	// Published Mar 5, 22:00 CST. Day 3 is Mar 8, the day CDT begins; day 7 is Mar 12.
	const spring = launch('spring', '2026-03-06T04:00:00Z');
	assert.equal(recapSlot(spring, 3, at('2026-03-06T05:00:00Z')).dueAt, '2026-03-08T13:00:00.000Z');
	assert.equal(recapSlot(spring, 7, at('2026-03-06T05:00:00Z')).dueAt, '2026-03-12T13:00:00.000Z');
	// Published Oct 29, 10:00 CDT. Day 3 is Nov 1, the day CST returns; day 7 is Nov 5.
	const fall = launch('fall', '2026-10-29T15:00:00Z');
	assert.equal(recapSlot(fall, 3, at('2026-10-29T16:00:00Z')).dueAt, '2026-11-01T14:00:00.000Z');
	assert.equal(recapSlot(fall, 7, at('2026-10-29T16:00:00Z')).dueAt, '2026-11-05T14:00:00.000Z');
	assert.equal(addCalendarDays('2026-11-01', -1), '2026-10-31');
	assert.equal(addCalendarDays('2026-02-28', 1), '2026-03-01');
});

test('a launch younger than 3 days has nothing due; its first recap is upcoming with its date', () => {
	const young = launch('young', '2026-10-05T20:00:00Z');
	const now = at('2026-10-06T13:00:00Z');
	assert.deepEqual(dueRecaps([young], now), []);
	const slots = recapSlots([young], now);
	assert.deepEqual(slots.map((slot) => [slot.checkpoint, slot.phase, slot.dueAt]), [[3, 'upcoming', '2026-10-08T13:00:00.000Z'], [7, 'upcoming', '2026-10-12T13:00:00.000Z']]);
	// One minute before 08:00 on the morning is still upcoming; at 08:00 it is due and not late.
	assert.equal(recapSlot(young, 3, at('2026-10-08T12:59:00Z')).phase, 'upcoming');
	const due = recapSlot(young, 3, at('2026-10-08T13:00:00Z'));
	assert.equal(due.phase, 'due');
	assert.equal(due.late, false);
});

test('a launch published after the clock reads is not scheduled', () => {
	assert.deepEqual(recapSlots([launch('future', '2026-10-07T01:00:00Z')], at('2026-10-06T17:00:00Z')), []);
});

test('late: past 15 minutes it is marked late and keeps its intended date', () => {
	const l = launch('a', '2026-10-01T15:00:00Z');
	const onTime = recapSlot(l, 3, at('2026-10-04T13:14:00Z'));
	const edge = recapSlot(l, 3, at('2026-10-04T13:15:00Z'));
	const late = recapSlot(l, 3, at('2026-10-04T19:00:00Z'));
	assert.equal(onTime.late, false);
	assert.equal(edge.late, false, 'exactly 15 minutes is not yet late');
	assert.equal(late.late, true);
	assert.equal(late.dueDate, onTime.dueDate, 'a late run keeps the intended checkpoint');
	assert.equal(late.dueAt, onTime.dueAt);
	assert.equal(late.key, onTime.key);
});

test('catch-up is bounded: a checkpoint more than 3 days past is lapsed and never backfilled', () => {
	const l = launch('old', '2026-09-26T01:10:52Z');
	assert.equal(recapSlot(l, 3, at('2026-10-01T12:59:00Z')).phase, 'due', 'under 3 days after Sep 28 08:00');
	assert.equal(recapSlot(l, 3, at('2026-10-01T13:00:00Z')).phase, 'due', 'the boundary instant is still inside');
	assert.equal(recapSlot(l, 3, at('2026-10-01T13:00:01Z')).phase, 'lapsed');
	// The first deploy: launches long past, one of them still inside its week. Nothing is due, so nothing is written late.
	const history = [launch('a', '2026-08-29T02:39:40Z'), launch('b', '2026-09-04T01:00:00Z'), launch('c', '2026-09-26T01:10:52Z'), launch('d', '2026-10-01T01:00:00Z')];
	assert.deepEqual(dueRecaps(history, at('2026-10-07T12:00:00Z')), []);
	assert.deepEqual(recapSlots(history, at('2026-10-07T12:00:00Z')).filter((slot) => slot.phase === 'upcoming').map((slot) => slot.key), ['launch:d:day7']);
});

test('launches due at different times come back oldest first, so a backlog drains in order', () => {
	const a = launch('a', '2026-10-01T15:00:00Z');
	const b = launch('b', '2026-09-26T15:00:00Z');
	const due = dueRecaps([a, b], at('2026-10-04T13:05:00Z'));
	assert.deepEqual(due.map((slot) => [slot.albumKey, slot.checkpoint, slot.late]), [['b', 7, true], ['a', 3, false]]);
});

test('a duplicate run produces the same key and the same intended period; the key holds no date', () => {
	const l = launch('Re7kho', '2026-09-26T01:10:52Z');
	const first = recapSlot(l, 3, at('2026-09-28T13:01:00Z'));
	const retry = recapSlot(l, 3, at('2026-09-28T13:02:00Z'));
	const overlap = recapSlot(l, 3, at('2026-09-29T09:00:00Z'));
	assert.equal(first.key, retry.key);
	assert.equal(first.key, overlap.key);
	assert.equal(recapKey('Re7kho', 3), 'launch:Re7kho:day3');
	assert.notEqual(recapKey('Re7kho', 3), recapKey('Re7kho', 7));
	assert.doesNotMatch(first.key, /\d{4}-\d{2}-\d{2}/);
});

test('the settle and lapse instants are fixed offsets from the due instant', () => {
	const slot = recapSlot(launch('a', '2026-10-01T15:00:00Z'), 3, at('2026-10-04T13:00:00Z'));
	assert.equal(slot.settleBy, '2026-10-04T19:00:00.000Z');
	assert.equal(slot.lapsesAt, '2026-10-07T13:00:00.000Z');
});
