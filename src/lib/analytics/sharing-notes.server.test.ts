import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addSharingNote, deleteSharingNote, loadSharingNotes, updateSharingNote } from './sharing-notes.server';

type Call = { table: string; op: string; args: unknown[] };
type Result = { data?: unknown; error?: unknown };

/** A recording stand-in for the admin client. `answers` says what each table returns; every call is kept. */
function fake(answers: Record<string, Result> = {}) {
	const calls: Call[] = [];
	const client = {
		from(table: string) {
			const chain: Record<string, unknown> = {};
			for (const op of ['select', 'insert', 'update', 'delete', 'eq', 'order', 'limit', 'maybeSingle']) chain[op] = (...args: unknown[]) => { calls.push({ table, op, args }); return chain; };
			chain.then = (resolve: (value: unknown) => unknown) => {
				const result = answers[table] ?? {};
				return Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve);
			};
			return chain;
		}
	};
	return { client: client as unknown as SupabaseClient, calls };
}

const form = (fields: Record<string, string>) => {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) data.set(key, value);
	return data;
};
const eqs = (calls: Call[]) => calls.filter((call) => call.op === 'eq').map((call) => `${call.args[0]}=${call.args[1]}`).sort();

test('the notes listed are this album\'s and this owner\'s, newest day first', async () => {
	const { client, calls } = fake({ analytics_sharing_annotations: { data: [{ id: 7, activity_date: '2026-10-02', channel: 'Instagram story', note: 'Posted.', updated_at: '2026-10-02T20:00:00Z' }] } });
	const result = await loadSharingNotes(client, 'Re7kho', 'owner-1');
	assert.deepEqual(result, { available: true, notes: [{ id: '7', activityDate: '2026-10-02', channel: 'Instagram story', note: 'Posted.', updatedAt: '2026-10-02T20:00:00Z' }] });
	assert.deepEqual(eqs(calls), ['album_key=Re7kho', 'created_by=owner-1']);
});

test('notes that cannot be read are reported as unavailable, not as none', async () => {
	const { client } = fake({ analytics_sharing_annotations: { error: { message: 'down' } } });
	assert.deepEqual(await loadSharingNotes(client, 'Re7kho', 'owner-1'), { notes: [], available: false });
});

test('a note is written for the album on the page, as the owner, and only for an album that exists', async () => {
	const ok = fake({ albums_summary: { data: { album_key: 'Re7kho' } } });
	const body = form({ activityDate: '2026-10-02', channel: 'Email', note: 'Sent.' });
	assert.deepEqual(await addSharingNote(ok.client, 'Re7kho', 'owner-1', body), { noteAdded: true });
	const insert = ok.calls.find((call) => call.op === 'insert')!;
	assert.deepEqual(insert.args[0], { album_key: 'Re7kho', activity_date: '2026-10-02', channel: 'Email', note: 'Sent.', created_by: 'owner-1' });

	const missing = fake({ albums_summary: { data: null } });
	const refused = await addSharingNote(missing.client, 'Nope', 'owner-1', body) as { status: number };
	assert.equal(refused.status, 404);
	assert.equal(missing.calls.some((call) => call.op === 'insert'), false);

	const bad = fake({});
	const invalid = await addSharingNote(bad.client, 'Re7kho', 'owner-1', form({ activityDate: '2026-02-30', channel: 'Email', note: 'x' })) as { status: number };
	assert.equal(invalid.status, 400);
	assert.equal(bad.calls.length, 0);

	const down = fake({ albums_summary: { data: { album_key: 'Re7kho' } }, analytics_sharing_annotations: { error: { message: 'down' } } });
	const failed = await addSharingNote(down.client, 'Re7kho', 'owner-1', body) as { status: number; data: { noteError: string } };
	assert.equal(failed.status, 503);
	assert.match(failed.data.noteError, /Nothing was created\.$/);
});

test('an update or a delete can only touch this owner\'s note on this album', async () => {
	const update = fake();
	assert.deepEqual(await updateSharingNote(update.client, 'Re7kho', 'owner-1', form({ id: '7', channel: 'Email', note: 'Edited.' })), { noteUpdated: true });
	assert.deepEqual(eqs(update.calls), ['album_key=Re7kho', 'created_by=owner-1', 'id=7']);

	const remove = fake();
	assert.deepEqual(await deleteSharingNote(remove.client, 'Re7kho', 'owner-1', form({ id: '7' })), { noteDeleted: true });
	assert.deepEqual(eqs(remove.calls), ['album_key=Re7kho', 'created_by=owner-1', 'id=7']);

	const none = fake();
	assert.equal(((await deleteSharingNote(none.client, 'Re7kho', 'owner-1', form({}))) as { status: number }).status, 400);
	assert.equal(((await updateSharingNote(none.client, 'Re7kho', 'owner-1', form({ id: '7', channel: '', note: 'x' }))) as { status: number }).status, 400);
	assert.equal(none.calls.length, 0);
});
