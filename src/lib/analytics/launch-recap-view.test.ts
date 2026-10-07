import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRecapView, stampWords, type RecapViewInput, type StoredRecapText } from './launch-recap-view';
import type { StoredRecapSummary } from './launch-recap-list';

/*
 * JCA at ACC as production has it: first published Sep 25 (Chicago), day 3 due Sep 28 at 8:00, day 7 due Oct 2 at 8:00.
 * The day 7 recap here was written afterwards from the records (a backfill), on Oct 6 at 12:03 AM Chicago time.
 */
const LAUNCH = { albumKey: 'Re7kho', albumName: 'HS Girls VB - JCA at ACC - 09-22-2026', firstPublishedAt: '2026-09-26T01:10:52Z', basis: 'inferred' as const };
const BODY = [
	'HS Girls VB - JCA at ACC - 09-22-2026: day 7 recap',
	'It was not written on the morning it was due.',
	'What happened:',
	'- 931 photo opens in its first 7 days.\n- 2nd of the 6 launches.',
	'Full report: https://analytics.ninochavez.co/albums/Re7kho?recap=7'
].join('\n\n');
const day7: StoredRecapText = { checkpoint: 7, dueAt: '2026-10-02T13:00:00Z', late: false, source: 'backfill', createdAt: '2026-10-06T05:03:00Z', evidence: 'complete', window: { start: '2026-09-25', end: '2026-10-01' }, body: BODY };
const day3: StoredRecapSummary = { checkpoint: 3, dueAt: '2026-09-28T13:00:00Z', late: false, source: 'scheduled', createdAt: '2026-09-28T13:00:40Z', evidence: 'complete', window: { start: '2026-09-25', end: '2026-09-27' } };
const { body: _body, ...day7Summary } = day7;
const base = (over: Partial<RecapViewInput> = {}): RecapViewInput => ({ albumKey: 'Re7kho', albumName: LAUNCH.albumName, launch: LAUNCH, now: new Date('2026-10-07T14:00:00Z'), asked: '7', stored: [day3, day7Summary], open: day7, owner: false, ...over });

test('a stored recap opens as its own page: its title, the date it is as of, the days it covers, then the text', () => {
	const view = buildRecapView(base());
	assert.equal(view.state, 'stored');
	assert.equal(view.title, 'Day 7 recap: HS Girls VB - JCA at ACC - 09-22-2026');
	assert.equal(view.asOf, 'As of Oct 6, 12:03 AM Chicago time.');
	assert.equal(view.covers, 'Covers Sep 25 to Oct 1, 7 full days.');
	assert.deepEqual(view.flags, ['Written later from the records']);
	assert.equal(view.message, null);
	assert.match(view.snapshotNote ?? '', /live report counts later days and later launches/);
	// The text is kept as written; the subject line is the title and the plain-text address line is the page's own link.
	assert.deepEqual(view.blocks.map((block) => block.kind), ['paragraph', 'heading', 'list']);
	assert.ok(!JSON.stringify(view.blocks).includes('Full report'));
	assert.deepEqual(view.others, [{ checkpoint: 3, title: 'Day 3 recap', query: '?recap=3' }]);
});

test('a recap written on schedule says it is as of that morning; a late one and one on incomplete records say so', () => {
	const scheduled = buildRecapView(base({ asked: '3', open: { ...day3, body: BODY } }));
	assert.equal(scheduled.asOf, 'As of Sep 28, 8:00 AM Chicago time.');
	assert.equal(scheduled.covers, 'Covers Sep 25 to Sep 27, 3 full days.');
	assert.deepEqual(scheduled.flags, []);
	assert.deepEqual(buildRecapView(base({ open: { ...day7, source: 'scheduled', late: true, evidence: 'partial' } })).flags, ['Late', 'Some records were incomplete']);
	assert.deepEqual(buildRecapView(base({ open: { ...day7, evidence: 'unavailable', window: null } })).covers, 'The days it covers were not recorded.');
});

test('the as-of time is Chicago time on either side of a date change', () => {
	assert.equal(stampWords('2026-10-07T04:59:00Z'), 'Oct 6, 11:59 PM Chicago time');
	assert.equal(stampWords('2026-10-07T05:00:00Z'), 'Oct 7, 12:00 AM Chicago time');
});

test('a recap that is not stored says so plainly, never shows the report, and tells a visitor nothing private', () => {
	// Day 7 asked for, nothing stored for it: a visitor is told there is none.
	const none = buildRecapView(base({ open: null, stored: [day3] }));
	assert.equal(none.state, 'not_stored');
	assert.equal(none.message, 'There is no day 7 recap for this album.');
	assert.deepEqual([none.asOf, none.covers, none.blocks, none.snapshotNote], [null, null, [], null]);
	assert.deepEqual(none.others, [{ checkpoint: 3, title: 'Day 3 recap', query: '?recap=3' }]);
	// Still to come: the date it is due.
	const soon = buildRecapView(base({ open: null, stored: [], now: new Date('2026-10-01T14:00:00Z') }));
	assert.equal(soon.message, 'There is no day 7 recap yet. It is due Fri, Oct 2 at 8:00 AM Chicago time.');
	// Due and waiting: a visitor hears nothing about the wait; the owner hears why.
	const waiting = base({ open: null, stored: [], now: new Date('2026-10-02T15:00:00Z') });
	assert.equal(buildRecapView(waiting).message, 'There is no day 7 recap for this album.');
	assert.match(buildRecapView({ ...waiting, owner: true }).message ?? '', /^There is no day 7 recap for this album\. Not stored yet\. It waits for complete records/);
	// Stored recaps that could not be read are not "none".
	assert.match(buildRecapView(base({ open: null, stored: null })).message ?? '', /Stored recaps could not be read\. This is not a report that none exist\./);
});

test('an unknown checkpoint is a plain message that never echoes the address', () => {
	for (const asked of ['5', '0', 'abc', '', '  ', '7abc', '<script>alert(1)</script>']) {
		const view = buildRecapView(base({ asked, open: null }));
		assert.equal(view.state, 'unknown_checkpoint', asked);
		assert.equal(view.message, 'Recaps are written for day 3 and day 7 of a launch. This address asks for neither.');
		assert.ok(!JSON.stringify(view).includes('script'), 'nothing that was asked is shown');
		assert.deepEqual(view.others.map((other) => other.checkpoint), [3, 7]);
	}
});

test('an album with no launch date has no recaps', () => {
	const view = buildRecapView(base({ launch: null, open: null, stored: null }));
	assert.equal(view.state, 'no_launch');
	assert.equal(view.message, 'This album has no launch date, so it has no recaps.');
});
