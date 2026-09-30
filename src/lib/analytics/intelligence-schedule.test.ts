import assert from 'node:assert/strict';
import test from 'node:test';
import { chicagoWallTimeToUtc, dueIntelligencePeriods, standardIntelligenceScopes } from './intelligence-schedule';

test('daily schedule uses Chicago time through DST and does not run before 08:00', () => {
	assert.deepEqual(dueIntelligencePeriods(new Date('2026-03-08T12:59:00.000Z')), []);
	const due = dueIntelligencePeriods(new Date('2026-03-08T13:00:00.000Z'));
	assert.equal(due[0]?.intendedPeriod, '2026-03-08');
	assert.equal(due[0]?.dueAt, '2026-03-08T13:00:00.000Z');
	assert.equal(chicagoWallTimeToUtc('2026-11-01'), '2026-11-01T14:00:00.000Z');
});

test('Monday has a deduplicable daily and weekly intended period, including late recovery', () => {
	const due = dueIntelligencePeriods(new Date('2026-11-02T15:30:00.000Z'));
	assert.deepEqual(due.map((period) => [period.kind, period.intendedPeriod, period.late]), [
		['daily', '2026-11-02', true], ['weekly', '2026-11-02', true]
	]);
});

test('repeated and delayed checks retain the same intended daily period', () => {
	const first = dueIntelligencePeriods(new Date('2026-07-15T13:02:00.000Z'));
	const delayed = dueIntelligencePeriods(new Date('2026-07-15T19:00:00.000Z'));
	assert.equal(first[0]?.intendedPeriod, delayed[0]?.intendedPeriod);
	assert.equal(first[0]?.late, false); assert.equal(delayed[0]?.late, true);
});

test('standard refresh scopes use a last complete Chicago gallery day', () => {
	const scopes = standardIntelligenceScopes(new Date('2026-03-09T13:00:00.000Z'));
	assert.deepEqual(scopes[0], { kind: 'gallery', query: { start: '2026-02-07', end: '2026-03-08', measure: 'photo_opens', scope: 'all', albumKeys: [], compare: 'previous', traffic: 'conservative' } });
	assert.deepEqual(scopes.slice(1).map((scope) => scope.kind === 'sites' ? scope.period : 0), [7, 30, 90]);
});
