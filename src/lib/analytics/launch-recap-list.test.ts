import assert from 'node:assert/strict';
import test from 'node:test';
import { DUE_NOT_STORED_NOTE, DUE_NOT_WRITTEN_NOTE, nextRecapItems, NOT_STORED_NOTE, NOT_STORED_OWNER_NOTE, recapListExplain, recapListSummary, recapRows, UNREADABLE_NOTE, type StoredRecapSummary } from './launch-recap-list';
import type { RecapLaunch } from './launch-recap-schedule';

const JCA: RecapLaunch = { albumKey: 'Re7kho', albumName: 'HS Girls VB - JCA at ACC', firstPublishedAt: '2026-09-26T01:10:52Z', basis: 'inferred' };
const at = (iso: string) => new Date(iso);
const stored3: StoredRecapSummary = { checkpoint: 3, dueAt: '2026-09-28T13:00:00.000Z', late: false, createdAt: '2026-09-28T13:01:00Z', evidence: 'complete', window: { start: '2026-09-25', end: '2026-09-27' } };
const stored7: StoredRecapSummary = { checkpoint: 7, dueAt: '2026-10-02T13:00:00.000Z', late: true, createdAt: '2026-10-02T19:01:00Z', evidence: 'partial' };

test('a stored recap lists its due date, its late and incomplete flags, and a link to read it', () => {
	const rows = recapRows({ launch: JCA, now: at('2026-10-03T15:00:00Z'), stored: [stored3, stored7], storing: true, owner: false });
	assert.deepEqual(rows.map((row) => [row.title, row.state, row.when, row.flags, row.query]), [
		['Day 3 recap', 'stored', 'Due Sep 28', [], '?recap=3'],
		['Day 7 recap', 'stored', 'Due Oct 2', ['Late', 'Some records were incomplete'], '?recap=7']
	]);
	assert.equal(recapListSummary(rows), 'Both recaps are stored for this album.');
	// A stored recap says which days its figures cover; one that states none says nothing about days.
	assert.deepEqual(rows.map((row) => row.covers), ['Covers Sep 25 to Sep 27.', null]);
	assert.equal(recapRows({ launch: JCA, now: at('2026-10-03T15:00:00Z'), stored: [{ ...stored3, window: { start: '2026-09-25', end: '2026-09-25' } }], storing: true, owner: false })[0].covers, 'Covers Sep 25.');
});

test('an unavailable recap is flagged as one that could not be built', () => {
	const rows = recapRows({ launch: JCA, now: at('2026-10-03T15:00:00Z'), stored: [{ ...stored3, evidence: 'unavailable' }], storing: true, owner: false });
	assert.deepEqual(rows[0].flags, ['Could not be built']);
});

test('a launch in its first days lists both recaps as upcoming with their date and time, and no link to read', () => {
	const rows = recapRows({ launch: JCA, now: at('2026-09-27T15:00:00Z'), stored: [], storing: true, owner: true });
	assert.deepEqual(rows.map((row) => [row.state, row.when, row.query]), [
		['upcoming', 'Due Mon, Sep 28 at 8:00 AM Chicago time', null],
		['upcoming', 'Due Fri, Oct 2 at 8:00 AM Chicago time', null]
	]);
	assert.equal(recapListSummary(rows), 'No recap is stored for this album yet.');
});

test('due but not stored: it says so and for how long it is tried; when nothing is being written it says that instead', () => {
	const working = recapRows({ launch: JCA, now: at('2026-09-28T14:00:00Z'), stored: [], storing: true, owner: true });
	assert.equal(working[0].state, 'overdue');
	assert.equal(working[0].note, 'It is due and not stored yet. It is tried again every minute for 3 days.');
	assert.equal(working[0].note, DUE_NOT_STORED_NOTE);
	const unset = recapRows({ launch: JCA, now: at('2026-09-28T14:00:00Z'), stored: [], storing: false, owner: false });
	assert.equal(unset[0].note, 'It is due, but no recap is being written.');
	assert.equal(unset[0].note, DUE_NOT_WRITTEN_NOTE);
	assert.equal(unset[1].note, null, 'a checkpoint still to come has no note');
});

test('only the owner is told why, once over the list, and told to open Settings', () => {
	assert.equal(recapListExplain({ storing: false, owner: true }), NOT_STORED_OWNER_NOTE);
	assert.equal(NOT_STORED_OWNER_NOTE, 'No recap is being written. Choose how long to keep private records in Settings and later recaps will be.');
	assert.equal(recapListExplain({ storing: false, owner: false }), null);
	assert.equal(recapListExplain({ storing: true, owner: true }), null);
	assert.equal(recapListExplain({ storing: null, owner: true }), null, 'unknown is not "nothing is written"');
});

test('a checkpoint past its catch-up window with nothing stored says none was stored; it is never worded as a recap that exists', () => {
	const rows = recapRows({ launch: JCA, now: at('2026-10-08T15:00:00Z'), stored: [], storing: true, owner: false });
	assert.deepEqual(rows.map((row) => [row.state, row.when, row.note, row.query]), [
		['not_stored', 'Was due Sep 28', NOT_STORED_NOTE, null],
		['not_stored', 'Was due Oct 2', NOT_STORED_NOTE, null]
	]);
	assert.equal(NOT_STORED_NOTE, 'No recap is stored for this checkpoint.');
});

test('stored recaps that could not be read are never listed as none stored', () => {
	const rows = recapRows({ launch: JCA, now: at('2026-10-08T15:00:00Z'), stored: null, storing: null, owner: true });
	assert.deepEqual(rows.map((row) => [row.state, row.note]), [['unreadable', UNREADABLE_NOTE], ['unreadable', UNREADABLE_NOTE]]);
	assert.equal(UNREADABLE_NOTE, 'Stored recaps could not be read. This is not a report that none exist.');
	// A checkpoint still to come needs no read to be described.
	assert.equal(recapRows({ launch: JCA, now: at('2026-09-27T15:00:00Z'), stored: null, storing: null, owner: false })[0].state, 'upcoming');
});

test('one stored recap and one still to come', () => {
	const rows = recapRows({ launch: JCA, now: at('2026-09-30T15:00:00Z'), stored: [stored3], storing: true, owner: false });
	assert.deepEqual(rows.map((row) => row.state), ['stored', 'upcoming']);
	assert.equal(recapListSummary(rows), 'One recap is stored for this album.');
});

test('next items are soonest first, skip stored and lapsed recaps, and carry the inferred mark', () => {
	const other: RecapLaunch = { albumKey: 'DWdCET', albumName: 'Millikin', firstPublishedAt: '2026-09-27T01:00:00Z', basis: 'recorded' };
	const items = nextRecapItems({ launches: [JCA, other], now: at('2026-09-29T15:00:00Z'), storedKeys: new Set(['launch:Re7kho:day3']), storing: true });
	assert.deepEqual(items.map((item) => [item.key, item.overdue]), [['launch:DWdCET:day3', true], ['launch:Re7kho:day7', false], ['launch:DWdCET:day7', false]]);
	assert.equal(items[1].text, 'HS Girls VB - JCA at ACC: day 7 recap is due Fri, Oct 2 at 8:00 AM Chicago time (inferred).');
	assert.equal(items[2].text, 'Millikin: day 7 recap is due Sat, Oct 3 at 8:00 AM Chicago time.');
	// A launch not yet published at the clock is not listed.
	assert.deepEqual(nextRecapItems({ launches: [{ ...JCA, firstPublishedAt: '2026-10-01T00:00:00Z' }], now: at('2026-09-29T15:00:00Z'), storedKeys: new Set(), storing: true }), []);
});
