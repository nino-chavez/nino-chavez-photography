/**
 * Correcting how a retained event is classified: the owner's private trail. Every correction is a new
 * version with a reason, and a correction can be reversed but never erased. This file holds the rules for
 * what a correction form may say; the reads and writes are in `corrections.server.ts` and the data page.
 *
 * Two kinds of retained event exist. The first is the older engagement event, which has a number for an id.
 * The second is the version-2 event, which has a UUID. Each has its own correction record, and a version-2
 * correction can also say the owner's own browser was excluded (`self_excluded`).
 */

import type { Parsed } from './parsed';

export const CORRECTION_NOTE_MAX = 1000;
/** Retained events listed for choosing from, per page. */
export const EVENT_PAGE_SIZE = 50;
/** Corrections shown in each history table. */
export const HISTORY_LIMIT = 30;

export const LEGACY_CLASSES = ['audience', 'operator', 'test', 'known_crawler', 'suspected_automation', 'unclassified'] as const;
export const V2_CLASSES = [...LEGACY_CLASSES, 'self_excluded'] as const;
export type LegacyClass = (typeof LEGACY_CLASSES)[number];
export type V2Class = (typeof V2_CLASSES)[number];

export const CLASS_LABELS: Record<V2Class, string> = {
	audience: 'Audience', operator: 'Operator', test: 'Test', known_crawler: 'Known crawler',
	suspected_automation: 'Suspected automation', unclassified: 'Unclassified', self_excluded: 'My own browser, left out'
};

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const REASON_ERROR = `Choose an action, a class, and give a reason of 1–${CORRECTION_NOTE_MAX.toLocaleString('en-US')} characters.`;

function reason(form: FormData): string | null {
	const note = form.get('note')?.toString().trim();
	return note && note.length <= CORRECTION_NOTE_MAX ? note : null;
}

/** An older engagement event: a positive whole number for its id. */
export function legacyEventId(value: FormDataEntryValue | null): number | null {
	const id = Number(value);
	return Number.isSafeInteger(id) && id >= 1 ? id : null;
}

export function legacyCorrection(form: FormData): Parsed<{ eventId: number; classification: LegacyClass; note: string }> {
	const eventId = legacyEventId(form.get('eventId'));
	const classification = form.get('classification')?.toString();
	const note = reason(form);
	if (eventId === null || !classification || !(LEGACY_CLASSES as readonly string[]).includes(classification) || !note) return { ok: false, error: REASON_ERROR };
	return { ok: true, eventId, classification: classification as LegacyClass, note };
}

export function legacyReversal(form: FormData): Parsed<{ eventId: number }> {
	const eventId = legacyEventId(form.get('eventId'));
	return eventId === null ? { ok: false, error: 'Choose the action whose latest correction you want to reverse.' } : { ok: true, eventId };
}

export function v2Correction(form: FormData): Parsed<{ eventId: string; classification: V2Class; note: string }> {
	const eventId = form.get('eventId')?.toString();
	const classification = form.get('classification')?.toString();
	const note = reason(form);
	if (!eventId || !UUID.test(eventId) || !classification || !(V2_CLASSES as readonly string[]).includes(classification) || !note) return { ok: false, error: REASON_ERROR };
	return { ok: true, eventId, classification: classification as V2Class, note };
}

export function v2Reversal(form: FormData): Parsed<{ eventId: string }> {
	const eventId = form.get('eventId')?.toString();
	return eventId && UUID.test(eventId) ? { ok: true, eventId } : { ok: false, error: 'Choose the action whose latest correction you want to reverse.' };
}

/** The page of events asked for. Anything that is not a small whole number is the first page. */
export function eventPage(value: string | null): number {
	return Math.max(0, Math.min(10_000, Number.parseInt(value ?? '0', 10) || 0));
}

export interface LoggedCorrection { eventId: string; version: number; reversed: boolean }

/** One logged correction, named by its event and its version. */
export const correctionKey = (row: Pick<LoggedCorrection, 'eventId' | 'version'>) => `${row.eventId}@${row.version}`;

/**
 * Which logged corrections can still be reversed, by `correctionKey`: only the newest version for each event,
 * and not one that already was. Reversing writes a new version, so an older row for the same event is history
 * and has no button.
 */
export function reversibleKeys(log: LoggedCorrection[]): Set<string> {
	const newest = new Map<string, number>();
	for (const row of log) newest.set(row.eventId, Math.max(newest.get(row.eventId) ?? -Infinity, row.version));
	return new Set(log.filter((row) => !row.reversed && row.version === newest.get(row.eventId)).map(correctionKey));
}

/** What a retained action was, in the words the counts use. */
const LEGACY_WHAT: Record<string, string> = { view: 'Photo opened', album_open: 'Album opened', favorite: 'Favorited', download: 'Download requested', share: 'Shared' };
const sentence = (value: string) => `${value[0].toUpperCase()}${value.slice(1)}`;
export const legacyWhat = (eventType: string) => LEGACY_WHAT[eventType] ?? sentence(eventType.replaceAll('_', ' '));
/** The detailed events' own names read as jargon ("exposed", "rendered"), so the ones people see are said as what happened on screen. */
const V2_WHAT: Record<string, string> = {
	photo_exposed: 'Photo shown on screen', album_exposed: 'Album shown on screen', photo_rendered: 'Photo loaded', photo_load_failed: 'Photo failed to load',
	experiment_exposed: 'Page variant shown', search_result_selected: 'Search result chosen', filters_applied: 'Filters used'
};
export const v2What = (eventName: string) => V2_WHAT[eventName] ?? sentence(eventName.replaceAll('_', ' '));

/**
 * One retained action as a line a person can recognise: what happened, where (the album, else the page, else the
 * gallery), when, and for the older records the source tag it carried. Nothing here is an identifier.
 */
export function describeEvent(input: { what: string; album: string | null; page: string | null; at: string; source?: string | null }): string {
	const where = input.album && input.page ? `${input.album} (${input.page})` : input.album ?? input.page ?? 'Gallery';
	return `${input.what} · ${where} · ${input.at}${input.source ? ` · via ${input.source}` : ''}`;
}

/** Said in place of a description when the record itself is not there to describe. */
export const EVENT_GONE = 'This action\'s record is no longer kept, so its details cannot be shown.';
export const EVENT_UNREAD = 'Its details could not be read just now.';

/** An action that can be chosen to correct: `label` is what the person reads; the id is only the form's value. */
export interface EventChoice { id: string; label: string }
/** `context` says what the action was; `reference` is its identifier, shown as secondary text. */
export interface CorrectionRow { eventId: string; version: number; classification: string; note: string; correctedAt: string | null; reversed: boolean; context: string; reference: string; canReverse: boolean }
export interface CorrectionsView {
	page: number;
	hasMore: boolean;
	legacy: { events: EventChoice[]; eventsAvailable: boolean; log: CorrectionRow[]; logAvailable: boolean };
	v2: { events: EventChoice[]; eventsAvailable: boolean; log: CorrectionRow[]; logAvailable: boolean };
}
