/**
 * Sharing notes: the owner's private record of where and when an album was shared ("Instagram story, Oct 2"),
 * kept beside the album's arrivals so a rise can be read against what was done. A note belongs to one album and
 * to the owner who wrote it. This file holds the rules for what a note may say; the reads and writes are in
 * `sharing-notes.server.ts` and the album report's actions.
 */

import type { Parsed } from './parsed';

export const CHANNEL_MAX = 64;
export const NOTE_MAX = 2000;
/** Notes listed on one album report. A launch has a handful; the cap only keeps a page bounded. */
export const NOTES_LIMIT = 200;

export interface SharingNote { id: string; activityDate: string; channel: string; note: string; updatedAt: string | null }

const NEW_ERROR = `Use a real date, a channel of 1–${CHANNEL_MAX} characters, and a note of 1–${NOTE_MAX.toLocaleString('en-US')} characters.`;
const EDIT_ERROR = `Use a channel of 1–${CHANNEL_MAX} characters and a note of 1–${NOTE_MAX.toLocaleString('en-US')} characters.`;

/** A calendar day written YYYY-MM-DD that exists: 2026-02-30 is refused, not rolled over to March. */
export function isCalendarDay(value: string | undefined | null): value is string {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const parsed = new Date(`${value}T12:00:00Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function text(form: FormData, name: string, max: number): string | null {
	const value = form.get(name)?.toString().trim();
	return value && value.length <= max ? value : null;
}

export function newNote(form: FormData): Parsed<{ activityDate: string; channel: string; note: string }> {
	const activityDate = form.get('activityDate')?.toString();
	const channel = text(form, 'channel', CHANNEL_MAX);
	const note = text(form, 'note', NOTE_MAX);
	if (!isCalendarDay(activityDate) || !channel || !note) return { ok: false, error: NEW_ERROR };
	return { ok: true, activityDate, channel, note };
}

export function editedNote(form: FormData): Parsed<{ id: string; channel: string; note: string }> {
	const id = form.get('id')?.toString();
	const channel = text(form, 'channel', CHANNEL_MAX);
	const note = text(form, 'note', NOTE_MAX);
	if (!id || !channel || !note) return { ok: false, error: EDIT_ERROR };
	return { ok: true, id, channel, note };
}

export function deletedNote(form: FormData): Parsed<{ id: string }> {
	const id = form.get('id')?.toString();
	return id ? { ok: true, id } : { ok: false, error: 'Choose a note to delete.' };
}
