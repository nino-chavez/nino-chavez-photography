import assert from 'node:assert/strict';
import test from 'node:test';
import { MISSING_NOTE, nextRecapItems, NO_RECAP_DUE, recapRows, UNREADABLE_NOTE, WAITING_NOTE, type StoredRecapSummary } from './launch-recap-list';
import type { RecapLaunch } from './launch-recap-schedule';

const JCA: RecapLaunch = { albumKey: 'Re7kho', albumName: 'HS Girls VB - JCA at ACC', firstPublishedAt: '2026-09-26T01:10:52Z', basis: 'inferred' };
const at = (iso: string) => new Date(iso);
const stored3: StoredRecapSummary = { checkpoint: 3, dueAt: '2026-09-28T13:00:00.000Z', late: false, source: 'scheduled', createdAt: '2026-09-28T13:01:00Z', evidence: 'complete', window: { start: '2026-09-25', end: '2026-09-27' } };
const stored7: StoredRecapSummary = { checkpoint: 7, dueAt: '2026-10-02T13:00:00.000Z', late: true, source: 'scheduled', createdAt: '2026-10-02T19:01:00Z', evidence: 'partial' };

test('a stored recap lists its due date, the days it covers, its late and incomplete flags, and a link to read it', () => {
	const rows = recapRows({ launch: JCA, now: at('2026-10-03T15:00:00Z'), stored: [stored3, stored7], owner: false });
	assert.deepEqual(rows.map((row) => [row.title, row.state, row.when, row.flags, row.covers, row.query]), [
		['Day 3 recap', 'stored', 'Due Sep 28', [], 'Covers Sep 25 to Sep 27.', '?recap=3'],
		['Day 7 recap', 'stored', 'Due Oct 2', ['Late', 'Some records were incomplete'], null, '?recap=7']
	]);
	assert.equal(recapRows({ launch: JCA, now: at('2026-10-03T15:00:00Z'), stored: [{ ...stored3, window: { start: '2026-09-25', end: '2026-09-25' } }], owner: false })[0].covers, 'Covers Sep 25.');
});

test('a recap written afterwards for a launch that predates recaps says so, and is not called late', () => {
	const rows = recapRows({ launch: JCA, now: at('2026-10-08T15:00:00Z'), stored: [{ ...stored3, late: true, source: 'backfill' }, { ...stored7, late: false, source: 'backfill', evidence: 'complete' }], owner: false });
	assert.deepEqual(rows.map((row) => row.flags), [['Written later from the records'], ['Written later from the records']]);
});

test('an unavailable recap is flagged as one that could not be built', () => {
	const rows = recapRows({ launch: JCA, now: at('2026-10-03T15:00:00Z'), stored: [{ ...stored3, evidence: 'unavailable' }], owner: false });
	assert.deepEqual(rows[0].flags, ['Could not be built']);
});

test('a visitor sees stored recaps and ones still to come, and nothing else', () => {
	// Day 2: both to come.
	const upcoming = recapRows({ launch: JCA, now: at('2026-09-27T15:00:00Z'), stored: [], owner: false });
	assert.deepEqual(upcoming.map((row) => [row.state, row.when, row.query, row.note]), [
		['upcoming', 'Due Mon, Sep 28 at 8:00 AM Chicago time', null, null],
		['upcoming', 'Due Fri, Oct 2 at 8:00 AM Chicago time', null, null]
	]);
	// Day 3 morning, nothing stored yet: the due one is not listed (it is not something a visitor can use); day 7 still is.
	const waiting = recapRows({ launch: JCA, now: at('2026-09-28T14:00:00Z'), stored: [], owner: false });
	assert.deepEqual(waiting.map((row) => [row.checkpoint, row.state]), [[7, 'upcoming']]);
	// Long past and never stored: nothing at all, not a "was due" line.
	assert.deepEqual(recapRows({ launch: JCA, now: at('2026-10-20T15:00:00Z'), stored: [], owner: false }), []);
	// Stored recaps could not be read: a visitor sees only what needs no read.
	assert.deepEqual(recapRows({ launch: JCA, now: at('2026-10-20T15:00:00Z'), stored: null, owner: false }), []);
	assert.deepEqual(recapRows({ launch: JCA, now: at('2026-09-27T15:00:00Z'), stored: null, owner: false }).map((row) => row.state), ['upcoming', 'upcoming']);
	// One stored and one to come.
	assert.deepEqual(recapRows({ launch: JCA, now: at('2026-09-30T15:00:00Z'), stored: [stored3], owner: false }).map((row) => row.state), ['stored', 'upcoming']);
});

test('the owner is told why a recap is missing only when that means something', () => {
	const waiting = recapRows({ launch: JCA, now: at('2026-09-28T14:00:00Z'), stored: [], owner: true });
	assert.deepEqual(waiting.map((row) => [row.state, row.note]), [['waiting', WAITING_NOTE], ['upcoming', null]]);
	assert.equal(WAITING_NOTE, 'Not stored yet. It waits for complete records for its days, up to 6 hours, then is stored saying what is missing. It is tried again every minute for 3 days.');
	const missing = recapRows({ launch: JCA, now: at('2026-10-20T15:00:00Z'), stored: [], owner: true });
	assert.deepEqual(missing.map((row) => [row.state, row.when, row.note]), [['missing', 'Was due Sep 28', MISSING_NOTE], ['missing', 'Was due Oct 2', MISSING_NOTE]]);
	assert.equal(MISSING_NOTE, 'No recap was written. It was not stored within 3 days of its due time.');
	const unreadable = recapRows({ launch: JCA, now: at('2026-10-20T15:00:00Z'), stored: null, owner: true });
	assert.deepEqual(unreadable.map((row) => [row.state, row.note]), [['unreadable', UNREADABLE_NOTE], ['unreadable', UNREADABLE_NOTE]]);
	assert.equal(UNREADABLE_NOTE, 'Stored recaps could not be read. This is not a report that none exist.');
	// A stored recap carries no note for anyone.
	assert.equal(recapRows({ launch: JCA, now: at('2026-10-03T15:00:00Z'), stored: [stored3, stored7], owner: true }).every((row) => row.note === null), true);
});

test('no row mentions retention, choosing a setting, or an email', () => {
	for (const owner of [true, false]) for (const stored of [null, [], [stored3, stored7]]) for (const now of ['2026-09-27T15:00:00Z', '2026-09-28T14:00:00Z', '2026-10-20T15:00:00Z']) {
		for (const row of recapRows({ launch: JCA, now: at(now), stored, owner })) assert.doesNotMatch(JSON.stringify(row), /retention|choose|Settings|email|sent/i);
	}
});

test('next items: only recaps still to come, soonest first; due, stored and lapsed ones are not listed', () => {
	const other: RecapLaunch = { albumKey: 'DWdCET', albumName: 'Millikin', firstPublishedAt: '2026-09-27T01:00:00Z', basis: 'recorded' };
	const items = nextRecapItems({ launches: [JCA, other], now: at('2026-09-29T15:00:00Z') });
	assert.deepEqual(items.map((item) => item.key), ['launch:Re7kho:day7', 'launch:DWdCET:day7']);
	assert.equal(items[0].text, 'HS Girls VB - JCA at ACC: day 7 recap is due Fri, Oct 2 at 8:00 AM Chicago time.');
	assert.equal(items[1].text, 'Millikin: day 7 recap is due Sat, Oct 3 at 8:00 AM Chicago time.');
	assert.doesNotMatch(items.map((item) => item.text).join(' '), /inferred|not stored|was due/);
	// A launch not yet published at the clock is not listed.
	assert.deepEqual(nextRecapItems({ launches: [{ ...JCA, firstPublishedAt: '2026-10-01T00:00:00Z' }], now: at('2026-09-29T15:00:00Z') }), []);
	assert.equal(NO_RECAP_DUE, 'No recap is due. Publishing an album schedules its day 3 and day 7 recaps.');
});
