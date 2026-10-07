import assert from 'node:assert/strict';
import test from 'node:test';
import { CHANNEL_MAX, deletedNote, editedNote, isCalendarDay, newNote, NOTE_MAX } from './sharing-notes';

const form = (fields: Record<string, string>) => {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) data.set(key, value);
	return data;
};

test('a day is a calendar day that exists', () => {
	for (const ok of ['2026-10-02', '2024-02-29', '2026-12-31']) assert.equal(isCalendarDay(ok), true, ok);
	for (const bad of ['', '2026-02-30', '2026-13-01', '2026-10-32', '2026-1-2', '10/02/2026', '2026-10-02T00:00', 'tomorrow', '2025-02-29']) assert.equal(isCalendarDay(bad), false, bad);
	assert.equal(isCalendarDay(null), false);
	assert.equal(isCalendarDay(undefined), false);
});

test('a new note needs a real day, a channel and something that happened', () => {
	assert.deepEqual(newNote(form({ activityDate: '2026-10-02', channel: ' Instagram story ', note: ' Posted the top six. ' })), { ok: true, activityDate: '2026-10-02', channel: 'Instagram story', note: 'Posted the top six.' });
	const bads: Array<Record<string, string>> = [
		{ activityDate: '2026-02-30', channel: 'x', note: 'x' }, { activityDate: '', channel: 'x', note: 'x' }, { activityDate: '2026-10-02', channel: '  ', note: 'x' },
		{ activityDate: '2026-10-02', channel: 'x', note: '' }, { activityDate: '2026-10-02', channel: 'x'.repeat(CHANNEL_MAX + 1), note: 'x' },
		{ activityDate: '2026-10-02', channel: 'x', note: 'x'.repeat(NOTE_MAX + 1) }, { channel: 'x', note: 'x' }
	];
	for (const bad of bads) assert.equal(newNote(form(bad)).ok, false, JSON.stringify(bad).slice(0, 80));
	assert.equal(newNote(form({ activityDate: '2026-10-02', channel: 'x'.repeat(CHANNEL_MAX), note: 'x'.repeat(NOTE_MAX) })).ok, true);
});

test('editing changes the channel and the note, never the day or the album', () => {
	assert.deepEqual(editedNote(form({ id: 'n1', channel: ' Email ', note: ' Sent to the team. ' })), { ok: true, id: 'n1', channel: 'Email', note: 'Sent to the team.' });
	assert.equal(editedNote(form({ channel: 'Email', note: 'x' })).ok, false);
	assert.equal(editedNote(form({ id: 'n1', channel: '', note: 'x' })).ok, false);
	assert.equal(editedNote(form({ id: 'n1', channel: 'x', note: '' })).ok, false);
});

test('deleting names one note', () => {
	assert.deepEqual(deletedNote(form({ id: 'n1' })), { ok: true, id: 'n1' });
	assert.equal(deletedNote(form({})).ok, false);
});
