import assert from 'node:assert/strict';
import test from 'node:test';
import type { Finding } from './intelligence-contract';
import { buildRecap, type ArrivalRow } from './launch-recap';
import { ALL, model, shape, type Shape } from './launch-recap.fixture';
import { recapSlot, type RecapCheckpoint } from './launch-recap-schedule';
import { buildRecapDocument, buildUnavailableRecapDocument, dueWords, recapBlocks, recapGaps, RECAP_BODY_LIMIT_BYTES, RECAP_FINDINGS_SHOWN, recapTitle } from './launch-recap-text';

/*
 * JCA at ACC (Re7kho): first published Sep 25 Chicago, inferred. Its day 3 recap is due Mon Sep 28 at 8:00 AM and its
 * day 7 recap Fri Oct 2. Each model is read as of the due morning, as the scheduler reads it, so day N is the first
 * N complete days.
 */
const LINK = 'https://analytics.ninochavez.co/albums/Re7kho?recap=3';
const at = (day: string) => ALL.map((one): Shape => ({ ...one, asOfDay: day }));
const ids = new Set(['p1', 'p2', 'p3', 'p4']);
const TAGS: ArrivalRow[] = [{ source: 'instagram', count: 21 }, { source: 'newsletter', count: 4 }];

const finding = (id: string, over: Partial<Finding> = {}): Finding => ({
	id, rule: 'launch_other', severity: 'medium', target: { kind: 'album', id: 'Re7kho', albumKey: 'Re7kho' },
	title: `Title ${id}`, explanation: `Explanation ${id}.`, action: `Action ${id}.`,
	evidence: { windows: { current: { start: '2026-09-25', end: '2026-09-27' } }, cutoff: null, coverage: 'complete', units: 'photo opens', strength: 'strong' },
	reportHref: '/albums/Re7kho', status: 'open', ...over
});

function doc(checkpoint: RecapCheckpoint, over: { cut?: Shape['cut']; arrivals?: ArrivalRow[] | null; arrivalsRead?: boolean; findings?: Finding[]; findingsRead?: boolean; late?: boolean; nowIso?: string } = {}) {
	const asOfDay = checkpoint === 3 ? '2026-09-28' : '2026-10-02';
	const m = model(shape('Re7kho', asOfDay, over.cut), at(asOfDay), {}, asOfDay);
	const recap = buildRecap({ model: m, arrivals: over.arrivals === undefined ? TAGS : over.arrivals, photoIds: ids, stored: true });
	const slot = { ...recapSlot({ albumKey: 'Re7kho', albumName: 'HS Girls VB - JCA at ACC', firstPublishedAt: '2026-09-26T01:10:52Z', basis: 'inferred' }, checkpoint, new Date(over.nowIso ?? `${asOfDay}T13:01:00Z`)) };
	if (over.late !== undefined) slot.late = over.late;
	return { m, slot, doc: buildRecapDocument({ slot, recap, model: m, findings: over.findings ?? [finding('a')], findingsRead: over.findingsRead ?? true, arrivalsRead: over.arrivalsRead ?? true, link: LINK }) };
}

test('a complete day 3 recap: the launch so far, the rank, what was opened and downloaded, how people arrived, and the findings', () => {
	const { doc: d } = doc(3);
	assert.equal(d.evidence, 'complete');
	assert.equal(d.complete, true);
	assert.deepEqual(d.missing, []);
	assert.equal(d.subject, 'HS Girls VB - JCA at ACC: day 3 recap');
	assert.equal(recapTitle(3), 'Day 3 recap');
	assert.deepEqual(d.window, { start: '2026-09-25', end: '2026-09-27' });
	const blocks = d.body.split('\n\n');
	assert.equal(blocks[0], d.subject);
	assert.match(d.body, /Published Sep 25 \(date recovered afterwards from a log\)\. 804 photo opens in its first 3 full days\./);
	assert.match(d.body, /At the same age, the \d+ earlier launches? had a median of [\d,]+ photo opens\./);
	assert.match(d.body, /Counts cover 3 full days, Sep 25 to Sep 27\.$/m);
	assert.match(d.body, /download requests/);
	assert.match(d.body, /25 arrivals came in through shared links: instagram 21 \(84%\), newsletter 4 \(16%\)\./);
	assert.match(d.body, /What to look at:\n\n- Title a\. Explanation a\. Next step: Action a\./);
	assert.match(d.body, /What this cannot tell you:\n\n- /);
	assert.ok(d.body.endsWith(`Full report: ${LINK}`));
	assert.equal(d.findingIds.join(), 'a');
});

test('a finding written into the recap keeps its title, explanation and action as three separate sentences', () => {
	const bare = finding('x', { title: '804 photo opens in its first 3 days', explanation: '1 of the 5 launches before it had more.', action: 'Open the report' });
	const { doc: d } = doc(3, { findings: [bare] });
	assert.match(d.body, /- 804 photo opens in its first 3 days\. 1 of the 5 launches before it had more\. Next step: Open the report\.\n/);
});

test('the stored text leaves out today, points to the report instead of "below", and never mentions a send', () => {
	const { doc: d } = doc(3);
	assert.doesNotMatch(d.body, /Today,/);
	assert.doesNotMatch(d.body, /\bbelow\b/);
	assert.doesNotMatch(d.body, /\b(sent|emailed|delivered)\b/i);
	// Nothing private: no follow-up, no note, no address.
	assert.doesNotMatch(d.body, /follow-up|private note|@|destination/i);
});

test('a complete day 7 recap is the week-1 recap, read as of the day 7 morning', () => {
	const { doc: d, m } = doc(7);
	assert.equal(d.evidence, 'complete');
	assert.equal(m.album.status === 'no_launch_date' ? null : m.album.elapsedDays, 7);
	assert.match(d.body, /931 photo opens in its first week\./);
	assert.deepEqual(d.window, { start: '2026-09-25', end: '2026-10-01' });
	assert.equal(d.subject, 'HS Girls VB - JCA at ACC: day 7 recap');
});

test('the due morning reads day N as exactly N complete days, so a late run reports the same days', () => {
	for (const checkpoint of [3, 7] as const) {
		const { m } = doc(checkpoint);
		assert.equal(m.album.status === 'no_launch_date' ? null : m.album.elapsedDays, checkpoint);
		assert.equal(m.album.series.length, checkpoint);
	}
});

test('a late recap says so after what it found, not before, and keeps the due date and the same days', () => {
	const onTime = doc(3, { late: false }).doc;
	const late = doc(3, { late: true }).doc;
	assert.doesNotMatch(onTime.body, /This recap is late/);
	const blocks = late.body.split('\n\n');
	const note = 'This recap is late. It was due Mon, Sep 28 at 8:00 AM Chicago time. It reports the same days it would have then, not the days since.';
	// The finding comes first; how late it is follows it, just above what the recap cannot tell the reader.
	assert.notEqual(blocks[1], note);
	assert.match(blocks[1], /^Published Sep 25/);
	assert.equal(blocks.indexOf(note), blocks.indexOf('What this cannot tell you:') - 1);
	assert.deepEqual(late.window, onTime.window);
	assert.equal(late.complete, true, 'late is not incomplete');
});

test('partial evidence says so first, states no total that depends on it, and is never complete', () => {
	const { doc: d } = doc(3, { cut: { 1: { coverage: 'partial', photoOpens: null, downloads: null, albumOpens: null } } });
	assert.equal(d.evidence, 'partial');
	assert.equal(d.complete, false);
	assert.deepEqual(d.missing, ['complete records for some of its first 3 days']);
	const blocks = d.body.split('\n\n');
	assert.equal(blocks[1], 'This recap is incomplete. What is missing: complete records for some of its first 3 days. A figure that depends on it is not stated, and nothing here is a report of zero.');
	assert.match(d.body, /Records are incomplete for 1 day, so the total so far is not stated\./);
	assert.doesNotMatch(d.body, /photo opens in its first 3 full days/);
	assert.doesNotMatch(d.body, /\b0 photo opens\b/);
});

test('unreadable tags and findings are said, not reported as none', () => {
	const arrivals = doc(3, { arrivals: null, arrivalsRead: false }).doc;
	assert.equal(arrivals.evidence, 'partial');
	assert.deepEqual(arrivals.missing, ['how people arrived, which could not be read']);
	assert.match(arrivals.body, /How people arrived could not be read for this recap\./);
	assert.doesNotMatch(arrivals.body, /none were recorded/);
	const findings = doc(3, { findings: [], findingsRead: false }).doc;
	assert.deepEqual(findings.missing, ['the launch findings, which could not be read']);
	assert.match(findings.body, /What to look at:\n\nThe launch findings could not be read for this recap\. This is not a report that there is nothing to look at\./);
	assert.deepEqual(findings.findingIds, []);
	const both = doc(3, { arrivals: null, arrivalsRead: false, findings: [], findingsRead: false }).doc;
	assert.match(both.body, /This recap is incomplete\. What is missing: how people arrived, which could not be read and the launch findings, which could not be read\./);
});

test('no open finding is its own sentence; arrivals that were read and are empty are not an error', () => {
	const { doc: d } = doc(3, { findings: [], arrivals: [] });
	assert.equal(d.complete, true);
	assert.match(d.body, /What to look at:\n\nNo finding is open for this launch\./);
	assert.match(d.body, /Where people came from is only known for links with a label, and none were recorded\./);
	assert.doesNotMatch(d.body, /could not be read/);
});

test('only the top findings are written out; the rest are counted and left to the report', () => {
	const five = ['a', 'b', 'c', 'd', 'e'].map((id) => finding(id));
	const { doc: d } = doc(3, { findings: five });
	assert.equal(RECAP_FINDINGS_SHOWN, 3);
	assert.equal((d.body.match(/Next step:/g) ?? []).length, 3);
	assert.match(d.body, /2 more findings are in the album report\./);
	assert.deepEqual(d.findingIds, ['a', 'b', 'c']);
	const four = doc(3, { findings: ['a', 'b', 'c', 'd'].map((id) => finding(id)) }).doc;
	assert.match(four.body, /1 more finding is in the album report\./);
});

test('an unavailable recap states no figure and says it is not a zero', () => {
	const slot = recapSlot({ albumKey: 'Re7kho', albumName: 'HS Girls VB - JCA at ACC', firstPublishedAt: '2026-09-26T01:10:52Z', basis: 'inferred' }, 3, new Date('2026-09-28T19:30:00Z'));
	const d = buildUnavailableRecapDocument(slot, LINK);
	assert.equal(d.evidence, 'unavailable');
	assert.equal(d.complete, false);
	assert.equal(d.window, null);
	assert.deepEqual(d.missing, ['the launch numbers for its first 3 days, which could not be read']);
	assert.equal(slot.late, true);
	assert.equal(d.body.split('\n\n')[1], 'This recap is late. It was due Mon, Sep 28 at 8:00 AM Chicago time. It reports the same days it would have then, not the days since.');
	assert.match(d.body, /This recap could not be built\. What is missing: the launch numbers for its first 3 days, which could not be read\. It states no figure, and this is not a report of zero\./);
	assert.doesNotMatch(d.body, /photo opens|download requests/);
	assert.ok(d.body.endsWith(`Full report: ${LINK}`));
});

test('gaps name what is missing in the order of its weight, and an unreached day says so', () => {
	const { m } = doc(3);
	assert.deepEqual(recapGaps(m, 3, true, true), []);
	assert.deepEqual(recapGaps(m, 3, false, false), ['how people arrived, which could not be read', 'the launch findings, which could not be read']);
	assert.deepEqual(recapGaps(m, 7, true, true), ['day 7, which had not been reached']);
});

test('the stored layout reads back as headings, lists and paragraphs, and markup in a title stays text', () => {
	const body = ['A recap', 'A paragraph that goes on.', 'What to look at:', '- <b>one</b>. Next step: do it.\n- two', 'Full report: https://example.test'].join('\n\n');
	assert.deepEqual(recapBlocks(body), [
		{ kind: 'paragraph', text: 'A recap' }, { kind: 'paragraph', text: 'A paragraph that goes on.' }, { kind: 'heading', text: 'What to look at' },
		{ kind: 'list', items: ['<b>one</b>. Next step: do it.', 'two'] }, { kind: 'paragraph', text: 'Full report: https://example.test' }
	]);
	const real = recapBlocks(doc(3).doc.body);
	assert.deepEqual(real.filter((block) => block.kind === 'heading').map((block) => (block as { text: string }).text), ['What to look at', 'What this cannot tell you']);
});

test('a very long finding cannot push the body past the limit, and the title and link survive', () => {
	const huge = 'x'.repeat(4000);
	const { doc: d } = doc(3, { findings: [finding('a', { explanation: huge }), finding('b', { explanation: huge }), finding('c', { explanation: huge })] });
	assert.ok(new TextEncoder().encode(d.body).byteLength <= RECAP_BODY_LIMIT_BYTES);
	assert.equal(d.body.split('\n\n')[0], d.subject);
	assert.ok(d.body.endsWith(`Full report: ${LINK}`));
});

test('due wording is Chicago time on either side of a DST change', () => {
	assert.equal(dueWords('2026-03-08T13:00:00.000Z'), 'Sun, Mar 8 at 8:00 AM Chicago time');
	assert.equal(dueWords('2026-11-01T14:00:00.000Z'), 'Sun, Nov 1 at 8:00 AM Chicago time');
});
