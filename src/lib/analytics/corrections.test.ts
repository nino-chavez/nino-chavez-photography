import assert from 'node:assert/strict';
import test from 'node:test';
import { CORRECTION_NOTE_MAX, eventPage, legacyCorrection, legacyReversal, reversibleKeys, v2Correction, v2Reversal } from './corrections';

const form = (fields: Record<string, string>) => {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) data.set(key, value);
	return data;
};
const UUID = '0b7c1f34-6a2e-4d5b-8c11-3f9a7d2e6b40';

test('a traffic correction needs a retained event, a supported class and a reason', () => {
	assert.deepEqual(legacyCorrection(form({ eventId: '42', classification: 'test', note: ' my own phone ' })), { ok: true, eventId: 42, classification: 'test', note: 'my own phone' });
	const bads: Array<Record<string, string>> = [
		{ eventId: '', classification: 'test', note: 'x' }, { eventId: '0', classification: 'test', note: 'x' }, { eventId: '-3', classification: 'test', note: 'x' },
		{ eventId: '1.5', classification: 'test', note: 'x' }, { eventId: 'abc', classification: 'test', note: 'x' }, { eventId: '42', classification: 'self_excluded', note: 'x' },
		{ eventId: '42', classification: 'mystery', note: 'x' }, { eventId: '42', classification: 'test', note: '   ' }, { eventId: '42', classification: 'test', note: 'x'.repeat(CORRECTION_NOTE_MAX + 1) },
		{ eventId: '42', note: 'x' }
	];
	for (const bad of bads) assert.equal(legacyCorrection(form(bad)).ok, false, JSON.stringify(bad));
	assert.equal(legacyCorrection(form({ eventId: '42', classification: 'test', note: 'x'.repeat(CORRECTION_NOTE_MAX) })).ok, true);
});

test('a version 2 correction needs a UUID, and may say the owner\'s own browser was excluded', () => {
	assert.deepEqual(v2Correction(form({ eventId: UUID, classification: 'self_excluded', note: 'me' })), { ok: true, eventId: UUID, classification: 'self_excluded', note: 'me' });
	for (const bad of ['', '42', 'not-a-uuid', `${UUID}0`, `${UUID.slice(0, -1)}g`]) assert.equal(v2Correction(form({ eventId: bad, classification: 'test', note: 'x' })).ok, false, bad);
	assert.equal(v2Correction(form({ eventId: UUID, classification: 'mystery', note: 'x' })).ok, false);
	assert.equal(v2Correction(form({ eventId: UUID, classification: 'test', note: '' })).ok, false);
});

test('a reversal names one event and nothing else', () => {
	assert.deepEqual(legacyReversal(form({ eventId: '7' })), { ok: true, eventId: 7 });
	assert.equal(legacyReversal(form({ eventId: '0' })).ok, false);
	assert.equal(legacyReversal(form({})).ok, false);
	assert.deepEqual(v2Reversal(form({ eventId: UUID })), { ok: true, eventId: UUID });
	assert.equal(v2Reversal(form({ eventId: 'x' })).ok, false);
});

test('only the newest version of an event can be reversed, and not one that already was', () => {
	const open = reversibleKeys([
		{ eventId: 'a', version: 2, reversed: false }, { eventId: 'a', version: 1, reversed: false },
		{ eventId: 'b', version: 3, reversed: true }, { eventId: 'b', version: 2, reversed: false },
		{ eventId: 'c', version: 1, reversed: false }
	]);
	assert.deepEqual([...open].sort(), ['a@2', 'c@1']);
	assert.equal(reversibleKeys([]).size, 0);
});

test('the event page is a small whole number, and the first page for anything else', () => {
	assert.equal(eventPage(null), 0);
	assert.equal(eventPage('3'), 3);
	for (const bad of ['', 'abc', '-1', '1.5e3x']) assert.ok(eventPage(bad) >= 0 && eventPage(bad) <= 10_000, bad);
	assert.equal(eventPage('abc'), 0);
	assert.equal(eventPage('-4'), 0);
	assert.equal(eventPage('999999'), 10_000);
});
