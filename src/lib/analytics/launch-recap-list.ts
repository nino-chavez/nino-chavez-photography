import { formatDay } from './launch-recap';
import { chicagoDay, RECAP_CATCH_UP_DAYS, RECAP_CHECKPOINTS, recapSlot, type RecapCheckpoint, type RecapLaunch, type RecapSlot } from './launch-recap-schedule';
import { dueWords, recapTitle, type RecapEvidence } from './launch-recap-text';

/**
 * What the album report's "Recaps" list and Home's "Next" line say about recaps, from the clock, the stored recaps and
 * whether anything is set up to store them. Pure: the loader reads, this decides the words.
 *
 * Rules the copy keeps:
 *  - A recap is listed as stored only when it is stored. A due date is never worded as a recap that exists.
 *  - A recap that was late says so, and one built on incomplete records says so, in its row.
 *  - When nothing stores recaps, the owner is told why and what to do; a visitor is told only that none is stored.
 *  - Nothing here says an email was sent. Email is a delivery record, and this list reads none.
 */

export interface StoredRecapSummary {
	checkpoint: RecapCheckpoint;
	dueAt: string;
	late: boolean;
	createdAt: string;
	evidence: RecapEvidence;
	window?: { start: string; end: string } | null;
}

export type RecapRowState = 'stored' | 'upcoming' | 'overdue' | 'not_stored' | 'unreadable';

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
	/** Why it is not stored, when it is not and was due. */
	note: string | null;
	/** Query that opens the stored text on the album report, or null when there is none to read. */
	query: string | null;
}

export interface RecapListInput {
	launch: RecapLaunch;
	now: Date;
	/** Null when the stored recaps could not be read. That is never "none stored". */
	stored: readonly StoredRecapSummary[] | null;
	/** Null when it could not be read; true when at least one owner has recaps written for them. */
	storing: boolean | null;
	owner: boolean;
}

export const NOT_STORED_OWNER_NOTE = 'No recap is being written. Choose how long to keep private records in Settings and later recaps will be.';
export const DUE_NOT_WRITTEN_NOTE = 'It is due, but no recap is being written.';
export const DUE_NOT_STORED_NOTE = `It is due and not stored yet. It is tried again every minute for ${RECAP_CATCH_UP_DAYS} days.`;
export const NOT_STORED_NOTE = 'No recap is stored for this checkpoint.';
export const UNREADABLE_NOTE = 'Stored recaps could not be read. This is not a report that none exist.';

function evidenceFlag(evidence: RecapEvidence): string | null {
	return evidence === 'complete' ? null : evidence === 'partial' ? 'Some records were incomplete' : 'Could not be built';
}

function dueLine(slot: RecapSlot): string {
	return `Due ${dueWords(slot.dueAt)}`;
}

export function recapRows(input: RecapListInput): RecapRow[] {
	return RECAP_CHECKPOINTS.map((checkpoint): RecapRow => {
		const slot = recapSlot(input.launch, checkpoint, input.now);
		const title = recapTitle(checkpoint);
		const stored = input.stored?.find((recap) => recap.checkpoint === checkpoint);
		if (stored) {
			const flags = [...(stored.late ? ['Late'] : []), ...(evidenceFlag(stored.evidence) ? [evidenceFlag(stored.evidence)!] : [])];
			const covers = stored.window ? `Covers ${stored.window.start === stored.window.end ? formatDay(stored.window.start) : `${formatDay(stored.window.start)} to ${formatDay(stored.window.end)}`}.` : null;
			return { checkpoint, title, state: 'stored', when: `Due ${formatDay(chicagoDay(stored.dueAt))}`, flags, covers, note: null, query: `?recap=${checkpoint}` };
		}
		if (slot.phase === 'upcoming') return { checkpoint, title, state: 'upcoming', when: dueLine(slot), flags: [], covers: null, note: null, query: null };
		if (input.stored === null) return { checkpoint, title, state: 'unreadable', when: dueLine(slot), flags: [], covers: null, note: UNREADABLE_NOTE, query: null };
		// Due and inside the catch-up window: the scheduler has not stored it yet. Past it, the checkpoint has lapsed.
		if (slot.phase === 'due') return { checkpoint, title, state: 'overdue', when: dueLine(slot), flags: [], covers: null, note: input.storing === false ? DUE_NOT_WRITTEN_NOTE : DUE_NOT_STORED_NOTE, query: null };
		return { checkpoint, title, state: 'not_stored', when: `Was due ${formatDay(chicagoDay(slot.dueAt))}`, flags: [], covers: null, note: NOT_STORED_NOTE, query: null };
	});
}

/** Said once over the list, to the owner only: why nothing is being written. A visitor is not told to open Settings. */
export function recapListExplain(input: Pick<RecapListInput, 'storing' | 'owner'>): string | null {
	return input.owner && input.storing === false ? NOT_STORED_OWNER_NOTE : null;
}

/** The heading line over the list: whether there is anything to read yet. */
export function recapListSummary(rows: readonly RecapRow[]): string {
	const stored = rows.filter((row) => row.state === 'stored').length;
	if (stored === 0) return 'No recap is stored for this album yet.';
	return stored === 1 ? 'One recap is stored for this album.' : 'Both recaps are stored for this album.';
}

/* ---------------------------------------------------------------------------------------------- */
/* Home: Next                                                                                       */
/* ---------------------------------------------------------------------------------------------- */

export const NO_RECAP_DUE = 'No recap is due. Publishing an album schedules its day 3 and day 7 recaps.';
export const RECAPS_NOT_STORED = 'Recaps are not being written yet. They start once the owner chooses how long to keep private records, in Settings.';

export interface NextRecapInput {
	launches: readonly RecapLaunch[];
	now: Date;
	/** Keys of every stored recap, or null when they could not be read. */
	storedKeys: ReadonlySet<string> | null;
	storing: boolean | null;
}

export interface NextRecapItem { key: string; date: string; text: string; overdue: boolean }

const name = (launch: RecapLaunch) => launch.albumName ?? launch.albumKey;

/**
 * The recaps still to come, soonest first, and any that are due but not stored yet. A stored recap is not "next". A
 * checkpoint past its catch-up window is not listed: it will not be written.
 */
export function nextRecapItems(input: NextRecapInput, label: (launch: RecapLaunch) => string = name): NextRecapItem[] {
	const items: NextRecapItem[] = [];
	for (const launch of input.launches) {
		if (Date.parse(launch.firstPublishedAt) > input.now.getTime()) continue;
		for (const checkpoint of RECAP_CHECKPOINTS) {
			const slot = recapSlot(launch, checkpoint, input.now);
			if (slot.phase === 'lapsed' || input.storedKeys?.has(slot.key)) continue;
			const inferred = launch.basis === 'inferred' ? ' (inferred)' : '';
			if (slot.phase === 'upcoming') items.push({ key: slot.key, date: slot.dueAt, text: `${label(launch)}: ${recapTitle(checkpoint).toLowerCase()} is due ${dueWords(slot.dueAt)}${inferred}.`, overdue: false });
			else items.push({ key: slot.key, date: slot.dueAt, text: `${label(launch)}: ${recapTitle(checkpoint).toLowerCase()} was due ${dueWords(slot.dueAt)} and is not stored yet.`, overdue: true });
		}
	}
	return items.sort((x, y) => Date.parse(x.date) - Date.parse(y.date) || x.key.localeCompare(y.key));
}
