import { daysWords, formatDay, plural } from './launch-recap';
import { recapRows, UNREADABLE_NOTE, type StoredRecapSummary } from './launch-recap-list';
import { WHILE_ARRIVING_STEP } from './launch-rules';
import { addCalendarDays, chicagoDay, isRecapCheckpoint, type RecapCheckpoint, type RecapLaunch } from './launch-recap-schedule';
import { recapBlocks, recapTitle, type RecapBlock } from './launch-recap-text';

/**
 * The page a recap address opens: the recap and nothing else. The address `/albums/<key>?recap=N` is what a stored recap
 * and an email link to, so it has to land on the recap, with its date and the days it covers first, and then a clear way to
 * the full live report. Pure: the loader reads, this file decides the words. Reader-facing copy, so a reader-contract source.
 *
 * Rules the copy keeps:
 *  - The date comes first, and it is the moment the figures were read as of: when the recap was due, not when a later run stored it. The text was written from the records of the days before it; the live report
 *    counts later days and later launches, so a number in the two can differ. The page says so once and does not compare them.
 *  - A recap that is not stored says so plainly. It never falls back to the full report, and it never echoes what was asked.
 *  - Nothing private is read here: no note, no owner choice, no destination. A visitor reads the same page.
 */

/** A stored recap with its text, as the loader reads it. */
export interface StoredRecapText extends StoredRecapSummary {
	body: string;
}

export interface RecapViewInput {
	albumKey: string;
	albumName: string;
	/** Null for an album with no launch date: it has no recaps. */
	launch: RecapLaunch | null;
	now: Date;
	/** The raw `recap` value from the address. It is only ever checked, never shown. */
	asked: string | null;
	/** Every stored recap of the album, without text; null when they could not be read, which is never "none". */
	stored: readonly StoredRecapSummary[] | null;
	/** The stored recap that was asked for, with its text; null when it is not stored. */
	open: StoredRecapText | null;
	owner: boolean;
}

export type RecapViewState = 'stored' | 'not_stored' | 'unknown_checkpoint' | 'no_launch';

export interface RecapView {
	state: RecapViewState;
	eyebrow: string;
	title: string;
	/** "As of Oct 2, 8:00 AM Chicago time." The due instant the figures were read as of. The first thing under the title. */
	asOf: string | null;
	/** "Covers Sep 22 to Sep 28, 7 full days." */
	covers: string | null;
	flags: string[];
	/**
	 * The recap's own first paragraph, taken apart so the page can lead with its headline and set the other facts in a short list: the "Published" line,
	 * the headline sentence, then the rest. Null when the stored text does not have that shape; the page then shows the paragraph as it was written.
	 */
	lead: { published: string | null; headline: string; facts: string[] } | null;
	/** The stored text, without its subject line (the title), its plain-text address line (the page links to the full report itself) and, for a stored recap, the sentences the page says another way. */
	blocks: RecapBlock[];
	/** Why there is no recap to show, in plain words; null when one is shown. */
	message: string | null;
	/** One line that says this is the recap as written, not the live numbers; null when none is shown. */
	snapshotNote: string | null;
	/** The other stored recap of this launch, for a link. */
	others: Array<{ checkpoint: RecapCheckpoint; title: string; query: string }>;
}

const FULL_REPORT_LINE = /^Full report: /;
/** The sentence a recap carries about when it was written: late, or written afterwards from the records. */
const TIMING_NOTE = /^This recap (is late\.|was written on )/;

/**
 * How late a stored recap was is said once, in the badge under its date. A recap stored before the badge carried the day says it again in a sentence,
 * wherever the sentence sits, so the page leaves that sentence out. The stored row is not changed.
 */
export function withoutTimingNote(blocks: RecapBlock[]): RecapBlock[] {
	return blocks.filter((block) => !(block.kind === 'paragraph' && TIMING_NOTE.test(block.text)));
}

const STEP_PREFIX = 'Next step: ';
/** True from the day the launch's first week is over, which is the day its day 7 recap is due. */
function firstWeekOver(launch: RecapLaunch, now: Date): boolean {
	return chicagoDay(now) >= addCalendarDays(chicagoDay(launch.firstPublishedAt), 7);
}

/**
 * A day 3 recap for a launch that was ahead of the usual says "See which photos people are opening and downloading while attention is still arriving."
 * That was true when it was written. Read after the first week it is not, so the step is left out, with its list and heading when nothing else is in them.
 * What the stored row says is not changed; this follows the launch's state at the moment of reading.
 */
export function withoutStaleSteps(blocks: RecapBlock[], launch: RecapLaunch, now: Date): RecapBlock[] {
	if (!firstWeekOver(launch, now)) return blocks;
	const stale = `${STEP_PREFIX}${WHILE_ARRIVING_STEP}`;
	const kept: RecapBlock[] = [];
	for (const block of blocks) {
		if (block.kind !== 'list') { kept.push(block); continue; }
		const items = block.items.map((item) => item.replace(stale, '').replace(/\s{2,}/g, ' ').trim()).filter(Boolean);
		if (items.length) { kept.push({ kind: 'list', items }); continue; }
		// An emptied list takes its own heading with it.
		const last = kept.at(-1);
		if (last?.kind === 'heading' && last.text === 'What to look at') kept.pop();
	}
	return kept;
}

/** Sentences, split where a full stop is followed by a capital or a digit. A few short forms in album names do not end a sentence. */
const SENTENCE_END = /(?<=[.!?])(?<!\b(?:St|Mt|Dr|Jr|Sr|vs|No)\.)\s+(?=[A-Z0-9])/;
/** The first paragraph that begins "Published ..." holds the recap's headline. It leads the page, and what follows it is a short list. */
export function splitLead(blocks: RecapBlock[]): { lead: RecapView['lead']; blocks: RecapBlock[] } {
	const at = blocks.findIndex((block) => block.kind === 'paragraph' && block.text.startsWith('Published '));
	if (at < 0) return { lead: null, blocks };
	const first = blocks[at] as { kind: 'paragraph'; text: string };
	const sentences = first.text.split(SENTENCE_END).map((part) => part.trim()).filter(Boolean);
	if (sentences.length < 2 || !sentences[0].startsWith('Published ')) return { lead: null, blocks };
	return { lead: { published: sentences[0], headline: sentences[1], facts: sentences.slice(2) }, blocks: blocks.filter((_, index) => index !== at) };
}
/** The one place a recap says it was written after it was due. */
const writtenLater = (writtenOn: string) => `Written later from the records, on ${formatDay(chicagoDay(writtenOn))}`;

/** "Oct 6, 12:03 AM Chicago time", always with the day. */
export function stampWords(instant: string): string {
	const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }).format(new Date(instant));
	return `${formatDay(chicagoDay(instant))}, ${time} Chicago time`;
}

function coversWords(window: StoredRecapSummary['window']): string {
	if (!window) return 'The days it covers were not recorded.';
	const days = Math.round((Date.parse(`${window.end}T12:00:00Z`) - Date.parse(`${window.start}T12:00:00Z`)) / 86_400_000) + 1;
	return `Covers ${daysWords(window.start, window.end)}, ${plural(days, 'full day')}.`;
}

/**
 * The stored text states its window in its own words ("Counts cover 7 full days, Sep 25 to Oct 1."). The page's first lines already
 * say it, so that one sentence is left out of the text here, only when it says the same days. The stored row is not changed.
 */
function withoutRepeatedWindow(text: string, window: StoredRecapSummary['window']): string {
	if (!window) return text;
	const days = Math.round((Date.parse(`${window.end}T12:00:00Z`) - Date.parse(`${window.start}T12:00:00Z`)) / 86_400_000) + 1;
	return text.replace(`Counts cover ${plural(days, 'full day')}, ${daysWords(window.start, window.end)}.`, '').replace(/\s{2,}/g, ' ').trim();
}

function evidenceFlag(evidence: StoredRecapSummary['evidence']): string[] {
	return evidence === 'complete' ? [] : [evidence === 'partial' ? 'Some records were incomplete' : 'Could not be built'];
}

export function buildRecapView(input: RecapViewInput): RecapView {
	const base = { flags: [], lead: null, blocks: [], asOf: null, covers: null, snapshotNote: null, others: [] } satisfies Pick<RecapView, 'flags' | 'lead' | 'blocks' | 'asOf' | 'covers' | 'snapshotNote' | 'others'>;
	const asked = input.asked === null || input.asked.trim() === '' ? NaN : Number(input.asked);
	if (!isRecapCheckpoint(asked)) {
		const others = (input.stored ?? []).map((recap) => ({ checkpoint: recap.checkpoint, title: recapTitle(recap.checkpoint), query: `?recap=${recap.checkpoint}` }));
		return { ...base, state: 'unknown_checkpoint', eyebrow: 'Recap', title: `No such recap: ${input.albumName}`, message: 'This address is not a day 3 or day 7 recap. Recaps are written at day 3 and day 7 of a launch.', others };
	}
	const checkpoint: RecapCheckpoint = asked;
	const title = recapTitle(checkpoint);
	const heading = `${title}: ${input.albumName}`;
	if (input.launch === null) {
		return { ...base, state: 'no_launch', eyebrow: title, title: heading, message: 'This album has no launch date, so it has no recaps.' };
	}
	const others = (input.stored ?? []).filter((recap) => recap.checkpoint !== checkpoint).map((recap) => ({ checkpoint: recap.checkpoint, title: recapTitle(recap.checkpoint), query: `?recap=${recap.checkpoint}` }));
	const open = input.open;
	if (open && open.checkpoint === checkpoint) {
		const flags = [...(open.source === 'backfill' ? [writtenLater(open.createdAt)] : open.late ? ['Late'] : []), ...evidenceFlag(open.evidence)];
		// The first block is the subject line, which the page shows as its title; the address line is replaced by the page's own link. A stored recap that says it
		// was written late says so in the badge once, and a step that only made sense mid-launch is left out once the launch's first week is over.
		const text = withoutStaleSteps(withoutTimingNote(recapBlocks(open.body)
			.filter((block, at) => !(at === 0 && block.kind === 'paragraph') && !(block.kind === 'paragraph' && FULL_REPORT_LINE.test(block.text)))
			.map((block): RecapBlock => (block.kind === 'paragraph' ? { ...block, text: withoutRepeatedWindow(block.text, open.window) } : block))
			.filter((block) => block.kind !== 'paragraph' || block.text !== '')), input.launch, input.now);
		const { lead, blocks } = splitLead(text);
		return {
			state: 'stored', eyebrow: title, title: heading,
			// The figures were read as of the moment the recap was due, whenever it was written. A recap written later says so in its badge.
			asOf: `As of ${stampWords(open.dueAt)}.`, covers: coversWords(open.window), flags, lead, blocks,
			message: null,
			snapshotNote: 'The live report counts later days and later launches, so its numbers can be different.',
			others
		};
	}
	// Not stored. A recap still to come says when; one that was never written, or could not be read, says that.
	const row = recapRows({ launch: input.launch, now: input.now, stored: input.stored, owner: input.owner }).find((item) => item.checkpoint === checkpoint);
	let message: string;
	if (input.stored === null) message = UNREADABLE_NOTE;
	else if (row?.state === 'upcoming') message = `There is no ${title.toLowerCase()} yet. It is due ${row.when.replace(/^Due /, '')}.`;
	else message = `There is no ${title.toLowerCase()} for this album.`;
	if (row?.note && input.owner && input.stored !== null) message += ` ${row.note}`;
	return { ...base, state: 'not_stored', eyebrow: title, title: heading, message, others };
}

