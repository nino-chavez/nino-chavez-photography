import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRecapView, splitLead, stampWords, withoutStaleSteps, withoutTimingNote, type RecapViewInput, type StoredRecapText } from './launch-recap-view';
import { recapBlocks } from './launch-recap-text';
import { WHILE_ARRIVING_STEP } from './launch-rules';
import type { StoredRecapSummary } from './launch-recap-list';

/*
 * JCA at ACC as production has it: first published Sep 25 (Chicago), day 3 due Sep 28 at 8:00, day 7 due Oct 2 at 8:00.
 * The day 7 recap here was written afterwards from the records (a backfill), on Oct 6 at 12:03 AM Chicago time.
 */
const LAUNCH = { albumKey: 'Re7kho', albumName: 'HS Girls VB - JCA at ACC - 09-22-2026', firstPublishedAt: '2026-09-26T01:10:52Z', basis: 'inferred' as const };
const BODY = [
	'HS Girls VB - JCA at ACC - 09-22-2026: day 7 recap',
	'It was not written on the morning it was due.',
	'Counts cover 7 full days, Sep 25 to Oct 1.',
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
	// The figures were read as of the due instant (Oct 2, 8:00 AM), not when the backfill wrote the row (Oct 6, 12:03 AM).
	assert.equal(view.asOf, 'As of Oct 2, 8:00 AM Chicago time.');
	assert.equal(view.covers, 'Covers Sep 25 to Oct 1, 7 full days.');
	// "Written later" is said once, here, with the day it was written (Oct 6 at 12:03 AM Chicago time).
	assert.deepEqual(view.flags, ['Written later from the records, on Oct 6']);
	assert.equal(view.message, null);
	assert.match(view.snapshotNote ?? '', /live report counts later days and later launches/);
	assert.ok(!(view.snapshotNote ?? '').includes('as it was written'));
	// The text is kept as written; the subject line is the title and the plain-text address line is the page's own link.
	assert.deepEqual(view.blocks.map((block) => block.kind), ['paragraph', 'heading', 'list']);
	assert.ok(!JSON.stringify(view.blocks).includes('Full report'));
	// The days are said once, in the header; the stored sentence that repeats them is left out of the text, and the stored row is unchanged.
	assert.ok(!JSON.stringify(view.blocks).includes('Counts cover'));
	assert.ok(BODY.includes('Counts cover 7 full days, Sep 25 to Oct 1.'));
	// A different window in the text is not removed.
	assert.ok(JSON.stringify(buildRecapView(base({ open: { ...day7, window: { start: '2026-09-25', end: '2026-09-30' } } })).blocks).includes('Counts cover 7 full days'));
	assert.deepEqual(view.others, [{ checkpoint: 3, title: 'Day 3 recap', query: '?recap=3' }]);
});

test('a recap written on schedule says it is as of that morning; a late one and one on incomplete records say so', () => {
	const scheduled = buildRecapView(base({ asked: '3', open: { ...day3, body: BODY } }));
	assert.equal(scheduled.asOf, 'As of Sep 28, 8:00 AM Chicago time.');
	// A scheduled recap stored late is still as of its due instant: a later run reads the same days.
	assert.equal(buildRecapView(base({ asked: '3', open: { ...day3, late: true, createdAt: '2026-09-28T15:20:00Z', body: BODY } })).asOf, 'As of Sep 28, 8:00 AM Chicago time.');
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
	assert.deepEqual([none.asOf, none.covers, none.blocks, none.snapshotNote, none.lead], [null, null, [], null, null]);
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
		assert.equal(view.message, 'This address is not a day 3 or day 7 recap. Recaps are written at day 3 and day 7 of a launch.');
		assert.ok(!JSON.stringify(view).includes('script'), 'nothing that was asked is shown');
		assert.deepEqual(view.others.map((other) => other.checkpoint), [3, 7]);
	}
});

test('an album with no launch date has no recaps', () => {
	const view = buildRecapView(base({ launch: null, open: null, stored: null }));
	assert.equal(view.state, 'no_launch');
	assert.equal(view.message, 'This album has no launch date, so it has no recaps.');
});

test('how late a stored recap was is said once, in the badge: the stored sentence is left out wherever it sits, and the stored row is unchanged', () => {
	const note = 'This recap was written on Oct 6, after its checkpoint, from the records for those days. It was not written on the morning it was due.';
	const old = ['subject', note, 'Published Sep 25. 931 photo opens in its first 7 days.', 'What to look at:', '- A finding.', 'What this cannot tell you:', '- Counts are browser actions, not people.'].join('\n\n');
	const kept = withoutTimingNote(recapBlocks(old));
	assert.deepEqual(kept.map((block) => (block.kind === 'paragraph' ? block.text.slice(0, 22) : block.kind === 'heading' ? block.text : 'list')), ['subject', 'Published Sep 25. 931 ', 'What to look at', 'list', 'What this cannot tell you', 'list']);
	// A late recap's sentence goes the same way, in the newer position (after the findings) too; a recap with no such sentence is returned as it is.
	const late = withoutTimingNote(recapBlocks(['x', 'Body.', 'This recap is late. It was due Mon, Sep 28 at 8:00 AM Chicago time. It reports the same days it would have then, not the days since.'].join('\n\n')));
	assert.deepEqual(late.map((block) => (block as { text: string }).text), ['x', 'Body.']);
	const plain = recapBlocks(['x', 'Body.'].join('\n\n'));
	assert.deepEqual(withoutTimingNote(plain), plain);
	// On the page, the sentence of a recap written later does not appear, and the badge says it.
	const view = buildRecapView(base({ open: { ...day7, body: [BODY, note].join('\n\n') } }));
	assert.ok(!JSON.stringify(view.blocks).includes('was written on'));
	assert.ok(view.flags[0].startsWith('Written later'));
});

const STEP = `Next step: ${WHILE_ARRIVING_STEP}`;
const day3Body = ['subject', 'Published Sep 25. 207 photo opens in its first 3 days. At the same age, the 6 earlier launches had a median of 120 photo opens.', 'What to look at:', `- ${STEP}`, 'What this cannot tell you:', '- Counts are browser actions, not people.'].join('\n\n');
const day3Text: StoredRecapText = { ...day3, body: day3Body };
const read = (now: string, open: StoredRecapText = day3Text) => buildRecapView(base({ asked: '3', open, now: new Date(now) }));

test('a next step that only makes sense mid-launch is left out once the first week is over, and kept while it runs', () => {
	// JCA at ACC was first published Sep 25 (Chicago). Its first week is over on Oct 2, the day its day 7 recap is due.
	const during = read('2026-09-29T14:00:00Z');
	assert.ok(JSON.stringify(during.blocks).includes('while attention is still arriving'));
	assert.ok(JSON.stringify(read('2026-10-02T04:00:00Z').blocks).includes('while attention is still arriving'), 'Oct 1 in Chicago is still inside the first week');
	const after = read('2026-10-02T06:00:00Z');
	assert.ok(!JSON.stringify(after.blocks).includes('attention is still arriving'));
	// The list and the heading it sat under go with it; the rest of the page is untouched.
	assert.deepEqual(after.blocks.filter((block) => block.kind === 'heading').map((block) => (block as { text: string }).text), ['What this cannot tell you']);
	assert.equal(after.blocks.length, during.blocks.length - 2);
	assert.ok(day3Body.includes('while attention is still arriving'), 'the stored text is unchanged');
	// Another step in the same list stays.
	const two = read('2026-10-09T14:00:00Z', { ...day3, body: day3Body.replace(`- ${STEP}`, `- ${STEP}\n- Next step: Check where the album was shared.`) });
	assert.deepEqual(two.blocks.find((block) => block.kind === 'list'), { kind: 'list', items: ['Next step: Check where the album was shared.'] });
	// A text with no such step is returned as it is, whenever it is read.
	assert.deepEqual(withoutStaleSteps(recapBlocks('Body.'), LAUNCH, new Date('2026-10-09T14:00:00Z')), recapBlocks('Body.'));
});

test('a recap leads with its headline and sets the other facts in a short list', () => {
	const text = 'Published Sep 26 (date recovered afterwards from a log). 266 photo opens in its first week. At the same age, the 6 earlier launches had a median of 381 photo opens. That is 4th of the 7 launches with a week-1 total, behind Chicago Big Dig 2026 - North Avenue Beach (636). Every one of the 43 photos was opened at least once.';
	const { lead, blocks } = splitLead(recapBlocks(['Subject: day 7 recap', text, 'What to look at:', '- A finding.'].join('\n\n')).slice(1));
	assert.equal(lead?.published, 'Published Sep 26 (date recovered afterwards from a log).');
	assert.equal(lead?.headline, '266 photo opens in its first week.');
	assert.deepEqual(lead?.facts, ['At the same age, the 6 earlier launches had a median of 381 photo opens.', 'That is 4th of the 7 launches with a week-1 total, behind Chicago Big Dig 2026 - North Avenue Beach (636).', 'Every one of the 43 photos was opened at least once.']);
	assert.deepEqual(blocks.map((block) => block.kind), ['heading', 'list']);
	// An abbreviation in an album name does not end a sentence.
	const abbreviated = splitLead(recapBlocks('Published Sep 25. 10 photo opens, behind St. Louis Open (12). Next fact.')).lead;
	assert.equal(abbreviated?.headline, '10 photo opens, behind St. Louis Open (12).');
	assert.deepEqual(abbreviated?.facts, ['Next fact.']);
	// A recap whose text does not have that shape is shown as written.
	const odd = recapBlocks('This recap is incomplete. What is missing: a day.');
	assert.deepEqual(splitLead(odd), { lead: null, blocks: odd });
	// On the page, a stored recap's text has its own lead, and the paragraph it came from is not shown twice.
	const view = buildRecapView(base({ open: { ...day7, body: ['subject', text].join('\n\n') } }));
	assert.equal(view.lead?.headline, '266 photo opens in its first week.');
	assert.ok(!JSON.stringify(view.blocks).includes('266 photo opens'));
});
