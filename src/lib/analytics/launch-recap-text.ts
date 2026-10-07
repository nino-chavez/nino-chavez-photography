import type { Finding } from './intelligence-contract';
import type { LaunchReadModel } from './launch-read-model.server';
import { formatDay, plural, recapToPlain, type Recap } from './launch-recap';
import { chicagoDay, type RecapCheckpoint, type RecapSlot } from './launch-recap-schedule';

/**
 * The words of a stored launch recap. One text, written once: the album report's "Recaps" list shows it and the
 * email carries it, so what the owner reads in the dashboard is what a verified inbox would receive.
 *
 * It is built from the step 2 recap (`buildRecap`, run with `stored: true`) plus the launch's current visible findings. Rules:
 *  - A figure comes from the recap; nothing here adds a number of its own except counts of its own parts.
 *  - Partial or unavailable evidence is said in the first lines, and a total that depends on it is never stated.
 *  - Nothing private is in it: no follow-up, note, owner choice or destination. A visitor can read the same page.
 *  - It says nothing about being sent. Whether an email goes out is a delivery record, not part of the text.
 *
 * Layout, so the dashboard can show it without HTML ever being built here: blocks are separated by a blank line.
 * A one-line block ending in a colon is a heading, a block whose lines all start with "- " is a list, and any other
 * block is a paragraph.
 */

/** At most this many findings are written out; the rest are named in a count with a link to all of them. */
export const RECAP_FINDINGS_SHOWN = 3;
/** The briefs table holds 12,000 bytes of body; stay well inside it. */
export const RECAP_BODY_LIMIT_BYTES = 11_000;

export type RecapEvidence = 'complete' | 'partial' | 'unavailable';

export interface RecapDocument {
	checkpoint: RecapCheckpoint;
	subject: string;
	body: string;
	evidence: RecapEvidence;
	/** True only when every part of the recap was read. Email is held for anything else. */
	complete: boolean;
	/** What was missing, in words. Empty when the recap is complete. */
	missing: string[];
	/** The days the figures cover, or null when none could be stated. */
	window: { start: string; end: string } | null;
	/** Ids of the findings written into the text, for the brief's own record. */
	findingIds: string[];
}

export interface RecapDocumentInput {
	slot: Pick<RecapSlot, 'albumKey' | 'albumName' | 'checkpoint' | 'dueAt' | 'late'>;
	recap: Recap;
	model: LaunchReadModel;
	/** The launch's visible findings, most urgent first. */
	findings: readonly Finding[];
	/** False when the findings could not be read; an empty list with true means none are open. */
	findingsRead: boolean;
	/** False when the tagged arrivals could not be read. */
	arrivalsRead: boolean;
	link: string;
	/** A backfill: the Chicago date it was written. The text says it was written later, from the records for those days. */
	writtenOn?: string;
}

const AGE_LABEL: Record<RecapCheckpoint, string> = { 3: 'Day 3 recap', 7: 'Day 7 recap' };
export const recapTitle = (checkpoint: RecapCheckpoint) => AGE_LABEL[checkpoint];
const ARRIVALS_LIMIT = /^Where people came from is only known for tagged links/;

function weekday(date: string): string {
	return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

/** "Mon, Sep 28 at 8:00 AM Chicago time" for the instant a recap was due. */
export function dueWords(dueAt: string): string {
	const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }).format(new Date(dueAt));
	return `${weekday(chicagoDay(dueAt))} at ${time} Chicago time`;
}

function lateNote(dueAt: string): string {
	return `This recap is late. It was due ${dueWords(dueAt)}. It reports the same days it would have then, not the days since.`;
}

function writtenLaterNote(writtenOn: string): string {
	return `This recap was written on ${formatDay(writtenOn)}, after its checkpoint, from the records for those days. It was not written on the morning it was due.`;
}

function bulletList(items: readonly string[]): string {
	return items.map((item) => `- ${item}`).join('\n');
}

function joinMissing(items: readonly string[]): string {
	if (items.length <= 1) return items[0] ?? '';
	return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** A finding's title is a headline with no full stop. Written next to its explanation it needs one, or two sentences run together. */
const endSentence = (text: string) => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

/**
 * The reach and finished findings are computed from the same figures as the recap's own headline, ranking and comparison, so
 * written out in full they say the same thing twice: a reach finding's title is the headline total and its explanation is the
 * median comparison; a finished finding's explanation is the week total, the downloads and the comparison again. The recap
 * keeps the comparison once, in its own text, and takes from these findings only what the text lacks: the next step, and for
 * a finished launch the sentences saying it is over and how far opens fell. Every other finding is written out in full.
 */
/** The first sentence of a finding's explanation. For a finished launch it is the one that says how far opens fell. */
const firstSentence = (text: string) => text.trim().match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text.trim();

function findingBlock(finding: Finding): string {
	const next = `Next step: ${endSentence(finding.action)}`;
	if (finding.rule === 'launch_reach') return next;
	const parts = (finding.rule === 'launch_finished' ? [finding.title, firstSentence(finding.explanation)] : [finding.title, finding.explanation]).filter((part) => part.trim()).map(endSentence).join(' ');
	return `${parts} ${next}`.replace(/\s+/g, ' ');
}

/** Drops whole trailing blocks, never the first or the last, until the body fits. */
function fit(blocks: string[]): string {
	const joined = (list: string[]) => list.join('\n\n');
	const bytes = (text: string) => new TextEncoder().encode(text).byteLength;
	const kept = [...blocks];
	while (bytes(joined(kept)) > RECAP_BODY_LIMIT_BYTES && kept.length > 2) kept.splice(kept.length - 2, 1);
	return joined(kept);
}

/** Which parts of the evidence were not read. The first of these is the launch's own records for the days the recap covers. */
export function recapGaps(model: LaunchReadModel, checkpoint: RecapCheckpoint, arrivalsRead: boolean, findingsRead: boolean): string[] {
	const gaps: string[] = [];
	const album = model.album;
	if (album.status === 'no_launch_date') return ['a launch date, which this album does not have'];
	const age = checkpoint === 3 ? album.totals.day3 : album.totals.day7;
	if (!age.reached) gaps.push(`day ${checkpoint}, which had not been reached`);
	else if (!age.complete) gaps.push(`complete records for some of its first ${checkpoint} days`);
	if (!arrivalsRead) gaps.push('how people arrived, which could not be read');
	if (!findingsRead) gaps.push('the launch findings, which could not be read');
	return gaps;
}

/**
 * The stored recap for a dated launch at a checkpoint. `model` must have been read as of the checkpoint's due instant,
 * so day N means the first N complete days whenever the run happened.
 */
export function buildRecapDocument(input: RecapDocumentInput): RecapDocument {
	const { slot, recap, model, findings, link } = input;
	const name = slot.albumName ?? slot.albumKey;
	const subject = `${name}: ${recapTitle(slot.checkpoint).toLowerCase()}`;
	const missing = recapGaps(model, slot.checkpoint, input.arrivalsRead, input.findingsRead);
	const evidence: RecapEvidence = missing.length ? 'partial' : 'complete';
	const blocks: string[] = [subject];
	// How late it is says nothing about the launch, so it follows the finding instead of leading it. The page's badge already says it first.
	const timingNote = input.writtenOn ? writtenLaterNote(input.writtenOn) : slot.late ? lateNote(slot.dueAt) : null;
	if (missing.length) blocks.push(`This recap is incomplete. What is missing: ${joinMissing(missing)}. A figure that depends on it is not stated, and nothing here is a report of zero.`);

	const head = [recap.published ? recapToPlain(recap.published) : '', recapToPlain(recap.headline)].filter(Boolean).join(' ');
	blocks.push([head, ...recap.sentences.map((sentence) => recapToPlain(sentence))].join(' '));
	blocks.push(recapToPlain(recap.window));
	if (recap.downloads) blocks.push(recapToPlain(recap.downloads));
	if (recap.arrivals) blocks.push(recapToPlain(recap.arrivals));
	else if (!input.arrivalsRead) blocks.push('How people arrived could not be read for this recap.');

	const shown = findings.slice(0, RECAP_FINDINGS_SHOWN);
	if (!input.findingsRead) {
		blocks.push('What to look at:', 'The launch findings could not be read for this recap. This is not a report that there is nothing to look at.');
	} else if (shown.length) {
		blocks.push('What to look at:', bulletList(shown.map(findingBlock)));
		if (findings.length > shown.length) blocks.push(`${plural(findings.length - shown.length, 'more finding')} ${findings.length - shown.length === 1 ? 'is' : 'are'} in the album report.`);
	} else {
		blocks.push('What to look at:', 'No finding is open for this launch.');
	}

	if (timingNote) blocks.push(timingNote);
	const limits = recap.limits.filter((limit) => input.arrivalsRead || !ARRIVALS_LIMIT.test(limit));
	if (limits.length) blocks.push('What this cannot tell you:', bulletList(limits));
	blocks.push(`Full report: ${link}`);

	const series = (model.album.status === 'no_launch_date' ? [] : model.album.series).slice(0, slot.checkpoint);
	return {
		checkpoint: slot.checkpoint, subject, body: fit(blocks), evidence, complete: missing.length === 0, missing,
		window: series.length ? { start: series[0].date, end: series[series.length - 1].date } : null,
		findingIds: input.findingsRead ? shown.map((finding) => finding.id) : []
	};
}

/** The recap for a checkpoint whose numbers could not be read at all by the end of the waiting period. It states no figure. */
export function buildUnavailableRecapDocument(slot: Pick<RecapSlot, 'albumKey' | 'albumName' | 'checkpoint' | 'dueAt' | 'late'>, link: string): RecapDocument {
	const name = slot.albumName ?? slot.albumKey;
	const subject = `${name}: ${recapTitle(slot.checkpoint).toLowerCase()}`;
	const missing = [`the launch numbers for its first ${slot.checkpoint} days, which could not be read`];
	const blocks = [
		subject,
		...(slot.late ? [lateNote(slot.dueAt)] : []),
		`This recap could not be built. What is missing: ${missing[0]}. It states no figure, and this is not a report of zero.`,
		`Full report: ${link}`
	];
	return { checkpoint: slot.checkpoint, subject, body: fit(blocks), evidence: 'unavailable', complete: false, missing, window: null, findingIds: [] };
}

export type RecapBlock = { kind: 'heading' | 'paragraph'; text: string } | { kind: 'list'; items: string[] };

/** Reads the stored layout back into blocks the page can render, without trusting any markup in it. */
export function recapBlocks(body: string): RecapBlock[] {
	return body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean).map((block): RecapBlock => {
		const lines = block.split('\n');
		if (lines.every((line) => line.startsWith('- '))) return { kind: 'list', items: lines.map((line) => line.slice(2).trim()) };
		if (lines.length === 1 && lines[0].endsWith(':') && lines[0].length <= 40) return { kind: 'heading', text: lines[0].slice(0, -1) };
		return { kind: 'paragraph', text: lines.join(' ') };
	});
}
