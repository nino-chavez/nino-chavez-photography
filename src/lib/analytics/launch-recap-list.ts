import { formatDay } from './launch-recap';
import { chicagoDay, RECAP_CATCH_UP_DAYS, RECAP_CHECKPOINTS, RECAP_SETTLE_HOURS, recapSlot, type RecapCheckpoint, type RecapLaunch, type RecapSlot } from './launch-recap-schedule';
import { dueWords, recapTitle, type RecapEvidence } from './launch-recap-text';

/**
 * What the album report's "Recaps" list and Home's "Next" line say about recaps, from the clock and the stored recaps.
 * Pure: the loader reads, this decides the words.
 *
 * Rules the copy keeps:
 *  - A visitor sees a recap that is stored, or one still to come with its date, or nothing. A recap that is due and not
 *    yet stored, or that was never stored, is not a thing a visitor can use, so it is not listed.
 *  - The owner is told about a missing recap only when it means something: it is due and still being waited for, or its
 *    window passed and nothing was written.
 *  - A recap that was written late, written afterwards from the records, or built on incomplete records says so in its row.
 *  - Nothing here says an email was sent. Email is a delivery record, and this list reads none.
 */

export interface StoredRecapSummary {
	checkpoint: RecapCheckpoint;
	dueAt: string;
	late: boolean;
	/** `backfill`: written afterwards, for a launch that predates recaps. */
	source?: 'scheduled' | 'backfill';
	createdAt: string;
	evidence: RecapEvidence;
	window?: { start: string; end: string } | null;
}

export type RecapRowState = 'stored' | 'upcoming' | 'waiting' | 'missing' | 'unreadable';

export interface RecapRow {
	checkpoint: RecapCheckpoint;
	title: string;
	state: RecapRowState;
	/** The date it was due, or "Due ..." for one still to come. */
	when: string;
	/** Short flags shown beside the date, in plain words. */
	flags: string[];
	/** The days a stored recap's figures cover, in words; null when it states none or is not stored. */
	covers: string | null;
	/** Owner only: why a recap is not stored, when that means something. */
	note: string | null;
	/** Query that opens the stored text on the album report, or null when there is none to read. */
	query: string | null;
}

export interface RecapListInput {
	launch: RecapLaunch;
	now: Date;
	/** Null when the stored recaps could not be read. That is never "none stored". */
	stored: readonly StoredRecapSummary[] | null;
	owner: boolean;
}

export const UNREADABLE_NOTE = 'Stored recaps could not be read. This is not a report that none exist.';
export const WAITING_NOTE = `Not stored yet. It waits for complete records for its days, up to ${RECAP_SETTLE_HOURS} hours, then is stored saying what is missing. It is tried again every minute for ${RECAP_CATCH_UP_DAYS} days.`;
export const MISSING_NOTE = `No recap was written. It was not stored within ${RECAP_CATCH_UP_DAYS} days of its due time.`;

const FLAG_WRITTEN_LATER = 'Written later from the records';
const FLAG_LATE = 'Late';

function evidenceFlag(evidence: RecapEvidence): string | null {
	return evidence === 'complete' ? null : evidence === 'partial' ? 'Some records were incomplete' : 'Could not be built';
}

const dueLine = (slot: RecapSlot) => `Due ${dueWords(slot.dueAt)}`;

export function recapRows(input: RecapListInput): RecapRow[] {
	const rows: RecapRow[] = [];
	for (const checkpoint of RECAP_CHECKPOINTS) {
		const slot = recapSlot(input.launch, checkpoint, input.now);
		const title = recapTitle(checkpoint);
		const stored = input.stored?.find((recap) => recap.checkpoint === checkpoint);
		if (stored) {
			const flags = [...(stored.source === 'backfill' ? [FLAG_WRITTEN_LATER] : stored.late ? [FLAG_LATE] : []), ...(evidenceFlag(stored.evidence) ? [evidenceFlag(stored.evidence)!] : [])];
			const covers = stored.window ? `Covers ${stored.window.start === stored.window.end ? formatDay(stored.window.start) : `${formatDay(stored.window.start)} to ${formatDay(stored.window.end)}`}.` : null;
			rows.push({ checkpoint, title, state: 'stored', when: `Due ${formatDay(chicagoDay(stored.dueAt))}`, flags, covers, note: null, query: `?recap=${checkpoint}` });
		} else if (slot.phase === 'upcoming') {
			rows.push({ checkpoint, title, state: 'upcoming', when: dueLine(slot), flags: [], covers: null, note: null, query: null });
		} else if (!input.owner) {
			continue;
		} else if (input.stored === null) {
			rows.push({ checkpoint, title, state: 'unreadable', when: dueLine(slot), flags: [], covers: null, note: UNREADABLE_NOTE, query: null });
		} else if (slot.phase === 'due') {
			rows.push({ checkpoint, title, state: 'waiting', when: dueLine(slot), flags: [], covers: null, note: WAITING_NOTE, query: null });
		} else {
			rows.push({ checkpoint, title, state: 'missing', when: `Was due ${formatDay(chicagoDay(slot.dueAt))}`, flags: [], covers: null, note: MISSING_NOTE, query: null });
		}
	}
	return rows;
}

/* ---------------------------------------------------------------------------------------------- */
/* Home: Next                                                                                       */
/* ---------------------------------------------------------------------------------------------- */

export const NO_RECAP_DUE = 'No recap is due. Publishing an album schedules its day 3 and day 7 recaps.';

export interface NextRecapItem { key: string; date: string; text: string }

const name = (launch: RecapLaunch) => launch.albumName ?? launch.albumKey;

/**
 * The recaps still to come, soonest first. Only recaps whose due time has not come are listed: one that is due or past
 * is either stored (and read on its album report) or not, and "was due and is not stored" is not something to tell a visitor.
 */
export function nextRecapItems(input: { launches: readonly RecapLaunch[]; now: Date }, label: (launch: RecapLaunch) => string = name): NextRecapItem[] {
	const items: NextRecapItem[] = [];
	for (const launch of input.launches) {
		if (Date.parse(launch.firstPublishedAt) > input.now.getTime()) continue;
		for (const checkpoint of RECAP_CHECKPOINTS) {
			const slot = recapSlot(launch, checkpoint, input.now);
			if (slot.phase !== 'upcoming') continue;
			items.push({ key: slot.key, date: slot.dueAt, text: `${label(launch)}: ${recapTitle(checkpoint).toLowerCase()} is due ${dueWords(slot.dueAt)}.` });
		}
	}
	return items.sort((x, y) => Date.parse(x.date) - Date.parse(y.date) || x.key.localeCompare(y.key));
}
