import type { Launch } from './launch-read-model.server';

/**
 * When a launch recap is due. Pure and deterministic: the loader reads, this file decides the dates.
 *
 * A recap is due at 08:00 America/Chicago on the morning after day 3 completes, and again after day 7
 * completes, counted from the first publication. "Day N completes" is the read model's own rule: the
 * first publication day is day 0, and a launch has had N complete days when N whole Chicago calendar
 * days have passed since it. So the checkpoint falls on the first publication's Chicago date plus N,
 * and the recap covers exactly the N days before that morning, never the morning itself.
 *
 * The due date is added in calendar days, not hours, so a DST change between publication and the
 * checkpoint moves nothing: 08:00 is a wall time, and it is never inside a transition hour.
 */

export const RECAP_TIME_ZONE = 'America/Chicago';
export const RECAP_CHECKPOINTS = [3, 7] as const;
export type RecapCheckpoint = (typeof RECAP_CHECKPOINTS)[number];
/** Local hour of day a recap is due. */
export const RECAP_DUE_HOUR = 8;
/** A recap generated later than this after its due time says it is late. */
export const RECAP_LATE_AFTER_MINUTES = 15;
/**
 * A recap that is still unwritten this long after it was due is still written, and marked late. After it,
 * the checkpoint has lapsed: the scheduler never backfills. Without this bound the first run after a
 * deploy would write a "late" recap for every launch the gallery has ever had.
 */
export const RECAP_CATCH_UP_DAYS = 3;
/**
 * Records for the days a recap covers are written by the daily refresh. If they are not all complete at
 * 08:00 the scheduler waits this long for them, then stores the recap saying which records were missing.
 */
export const RECAP_SETTLE_HOURS = 6;
/** Bounds the work of one scheduler wake-up: each recap is several reads. */
export const MAX_RECAPS_PER_RUN = 3;

export function isRecapCheckpoint(value: unknown): value is RecapCheckpoint {
	return value === 3 || value === 7;
}

type ChicagoParts = { year: number; month: number; day: number; hour: number; minute: number };

function chicagoParts(now: Date): ChicagoParts {
	const values = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
		timeZone: RECAP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
	}).formatToParts(now).map((part) => [part.type, part.value]));
	return { year: Number(values.year), month: Number(values.month), day: Number(values.day), hour: Number(values.hour), minute: Number(values.minute) };
}

const dateKey = (parts: Pick<ChicagoParts, 'year' | 'month' | 'day'>) => `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;

/** Converts an ordinary Chicago wall time to UTC without assuming a fixed offset. */
export function chicagoWallTimeToUtc(day: string, hour = RECAP_DUE_HOUR, minute = 0): string {
	const requested = Date.parse(`${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
	let instant = requested;
	for (let attempt = 0; attempt < 4; attempt += 1) {
		const local = chicagoParts(new Date(instant));
		const projected = Date.parse(`${dateKey(local)}T${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}:00Z`);
		instant += requested - projected;
	}
	return new Date(instant).toISOString();
}

/** The Chicago calendar day (YYYY-MM-DD) of an instant. */
export function chicagoDay(instant: string | Date): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: RECAP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant));
}

export function addCalendarDays(date: string, days: number): string {
	const d = new Date(`${date}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/** The stable identity of one recap: the launch plus its checkpoint. It holds no date, so a retry, an overlapping run or a DST change cannot make a second one. */
export function recapKey(albumKey: string, checkpoint: RecapCheckpoint): string {
	return `launch:${albumKey}:day${checkpoint}`;
}

export type RecapLaunch = Pick<Launch, 'albumKey' | 'albumName' | 'firstPublishedAt' | 'basis'>;

/** Where a checkpoint stands against the clock. */
export type RecapPhase = 'upcoming' | 'due' | 'lapsed';

export interface RecapSlot {
	albumKey: string;
	albumName: string | null;
	checkpoint: RecapCheckpoint;
	/** Chicago date of the morning it is due. */
	dueDate: string;
	/** The 08:00 Chicago instant. The recap's numbers are read as of this instant, whenever it actually runs. */
	dueAt: string;
	key: string;
	inferred: boolean;
	phase: RecapPhase;
	/** Run now, it would be later than the late threshold after dueAt. Only meaningful once due. */
	late: boolean;
	/** The last instant at which incomplete records are still waited for. */
	settleBy: string;
	/** The last instant at which the recap is still written. */
	lapsesAt: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function recapSlot(launch: RecapLaunch, checkpoint: RecapCheckpoint, now: Date): RecapSlot {
	const dueDate = addCalendarDays(chicagoDay(launch.firstPublishedAt), checkpoint);
	const dueAt = chicagoWallTimeToUtc(dueDate, RECAP_DUE_HOUR, 0);
	const due = Date.parse(dueAt);
	const lapsesAt = new Date(due + RECAP_CATCH_UP_DAYS * DAY).toISOString();
	const phase: RecapPhase = now.getTime() < due ? 'upcoming' : now.getTime() > Date.parse(lapsesAt) ? 'lapsed' : 'due';
	return {
		albumKey: launch.albumKey, albumName: launch.albumName, checkpoint, dueDate, dueAt, key: recapKey(launch.albumKey, checkpoint),
		inferred: launch.basis === 'inferred', phase, late: now.getTime() - due > RECAP_LATE_AFTER_MINUTES * MINUTE,
		settleBy: new Date(due + RECAP_SETTLE_HOURS * HOUR).toISOString(), lapsesAt
	};
}

/** Both checkpoints of every launch that was first published before `now`, soonest due first. */
export function recapSlots(launches: readonly RecapLaunch[], now: Date): RecapSlot[] {
	return launches
		.filter((launch) => Date.parse(launch.firstPublishedAt) <= now.getTime())
		.flatMap((launch) => RECAP_CHECKPOINTS.map((checkpoint) => recapSlot(launch, checkpoint, now)))
		.sort((x, y) => Date.parse(x.dueAt) - Date.parse(y.dueAt) || x.key.localeCompare(y.key));
}

/** The recaps that should exist now: due, and not yet lapsed. Oldest first, so a backlog drains in order. */
export function dueRecaps(launches: readonly RecapLaunch[], now: Date): RecapSlot[] {
	return recapSlots(launches, now).filter((slot) => slot.phase === 'due');
}
