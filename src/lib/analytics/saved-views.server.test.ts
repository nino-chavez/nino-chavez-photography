import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseReportQuery } from './report-contract';
import { deleteView, filtersFromAddress, insertView, renameView, saveViewFromPage, updateViewFromPage } from './saved-views.server';
import { savedQueryState } from './saved-views';

type Row = { id: string; owner_id: string; name: string; query: unknown; updated_at?: string };

/** An in-memory stand-in for the saved views table: select, insert and update with equality filters, and a way to make one call fail. */
function fakeTable(rows: Row[], failing: Array<'select' | 'insert' | 'update' | 'delete'> = []) {
	const writes: string[] = [];
	const client = {
		from(table: string) {
			assert.equal(table, 'analytics_saved_reports');
			let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
			let patch: Record<string, unknown> = {};
			const filters: Array<[string, unknown]> = [];
			let wantRows = false;
			const chain: Record<string, unknown> = {
				select: () => { wantRows = true; return chain; },
				insert: (value: Row) => { op = 'insert'; patch = value; return chain; },
				update: (value: Record<string, unknown>) => { op = 'update'; patch = value; return chain; },
				delete: () => { op = 'delete'; return chain; },
				eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; }
			};
			chain.then = (resolve: (value: unknown) => unknown) => {
				const matches = rows.filter((row) => filters.every(([key, value]) => (row as Record<string, unknown>)[key] === value));
				let result: { data: unknown; error: unknown };
				if (failing.includes(op)) result = { data: null, error: { message: 'down' } };
				else if (op === 'insert') { writes.push('insert'); rows.push({ id: `new-${rows.length + 1}`, ...(patch as Omit<Row, 'id'>) }); result = { data: null, error: null }; }
				else if (op === 'update') { writes.push('update'); for (const row of matches) Object.assign(row, patch); result = { data: wantRows ? matches.map((row) => ({ id: row.id })) : null, error: null }; }
				else if (op === 'delete') { writes.push('delete'); for (const row of matches) rows.splice(rows.indexOf(row), 1); result = { data: wantRows ? matches.map((row) => ({ id: row.id })) : null, error: null }; }
				else result = { data: matches, error: null };
				return Promise.resolve(result).then(resolve);
			};
			return chain;
		}
	};
	return { client: client as unknown as SupabaseClient, writes };
}

const NOW = new Date('2026-10-06T15:00:00Z');
const page = (query: string) => new URL(`https://analytics.ninochavez.co/photos?/saveView&${query}`);
const FILTERS = 'period=custom&start=2026-09-25&end=2026-10-02&measure=downloads&scope=album&albums=Re7kho&traffic=inclusive&sport=volleyball&compare=none&photo_rank=rising&photo_page=3';
const status = (result: unknown) => (result as { status: number }).status;
const data = (result: unknown) => (result as { data: Record<string, string> }).data;

test('a signed-out request is refused, and nothing is read or written', async () => {
	const { client, writes } = fakeTable([]);
	const saved = await saveViewFromPage(client, null, 'Mine', page(FILTERS));
	assert.equal(status(saved), 401);
	assert.match(data(saved).saveError, /Sign in/);
	const updated = await updateViewFromPage(client, null, 'v1', page(FILTERS));
	assert.equal(status(updated), 401);
	assert.deepEqual(writes, []);
});

test('the stored filters are exactly what the page parsed from its address, without the ranking or the page', async () => {
	const rows: Row[] = [];
	const { client } = fakeTable(rows);
	assert.deepEqual(await saveViewFromPage(client, 'owner-1', '  First week  ', page(FILTERS)), { saved: true });
	assert.equal(rows.length, 1);
	assert.equal(rows[0].owner_id, 'owner-1');
	assert.equal(rows[0].name, 'First week');
	const expected = savedQueryState(parseReportQuery(new URLSearchParams(FILTERS), NOW));
	assert.deepEqual(rows[0].query, expected);
	assert.deepEqual(filtersFromAddress(page(FILTERS), NOW), expected);
	for (const key of ['photo_rank', 'photo_page', 'section']) assert.equal(key in (rows[0].query as object), false, key);
	assert.deepEqual((rows[0].query as { albums: string[] }).albums, ['Re7kho']);
});

test('updating changes the filters of the owner\'s own view and nothing else', async () => {
	const rows: Row[] = [{ id: 'v1', owner_id: 'owner-1', name: 'First week', query: { old: true } }];
	const { client } = fakeTable(rows);
	assert.deepEqual(await updateViewFromPage(client, 'owner-1', 'v1', page(FILTERS)), { updated: true, updatedId: 'v1' });
	assert.deepEqual(rows[0].query, filtersFromAddress(page(FILTERS), NOW));
	assert.equal(rows[0].name, 'First week');
	assert.ok(rows[0].updated_at);
});

test('someone else\'s view, or one that is not there, is refused and not reported as updated', async () => {
	const rows: Row[] = [{ id: 'v1', owner_id: 'owner-2', name: 'Theirs', query: { old: true } }];
	const { client } = fakeTable(rows);
	for (const id of ['v1', 'missing']) {
		const result = await updateViewFromPage(client, 'owner-1', id, page(FILTERS));
		assert.equal(status(result), 404, id);
		assert.match(data(result).updateError, /not found.*Nothing changed/);
	}
	assert.deepEqual(rows[0].query, { old: true });
	assert.equal(status(await updateViewFromPage(client, 'owner-1', '', page(FILTERS))), 400);
	assert.equal(status(await updateViewFromPage(client, 'owner-1', null, page(FILTERS))), 400);
});

test('a second view with the same name is refused, whatever its case or spacing, and another owner may use the name', async () => {
	const rows: Row[] = [{ id: 'v1', owner_id: 'owner-1', name: 'First Week', query: {} }, { id: 'v2', owner_id: 'owner-2', name: 'Shared name', query: {} }];
	const { client, writes } = fakeTable(rows);
	for (const name of ['First Week', 'first week', '  FIRST WEEK ']) {
		const result = await saveViewFromPage(client, 'owner-1', name, page(FILTERS));
		assert.equal(status(result), 409, name);
		assert.match(data(result).saveError, /already have a view named "[^"]+"\. Choose another name, or update that one\./);
	}
	assert.equal(rows.length, 2);
	assert.deepEqual(writes, []);
	assert.deepEqual(await saveViewFromPage(client, 'owner-1', 'Shared name', page(FILTERS)), { saved: true });
	assert.equal(rows.length, 3);
});

test('a name that is empty or too long is refused before anything is read', async () => {
	const { client, writes } = fakeTable([]);
	for (const name of [null, '', '   ', 'x'.repeat(101)]) assert.equal(status(await saveViewFromPage(client, 'owner-1', name, page(FILTERS))), 400, String(name).slice(0, 5));
	assert.deepEqual(writes, []);
});

test('a database that fails says nothing was saved or changed', async () => {
	const readFails = fakeTable([], ['select']);
	const unread = await saveViewFromPage(readFails.client, 'owner-1', 'A', page(FILTERS));
	assert.equal(status(unread), 503);
	assert.match(data(unread).saveError, /Nothing was created\.$/);
	assert.deepEqual(readFails.writes, []);
	const writeFails = fakeTable([], ['insert']);
	assert.match(data(await saveViewFromPage(writeFails.client, 'owner-1', 'A', page(FILTERS))).saveError, /Nothing was created\.$/);
	const updateFails = fakeTable([{ id: 'v1', owner_id: 'owner-1', name: 'A', query: {} }], ['update']);
	const failed = await updateViewFromPage(updateFails.client, 'owner-1', 'v1', page(FILTERS));
	assert.equal(status(failed), 503);
	assert.match(data(failed).updateError, /unchanged\.$/);
});

test('settings saves through the same name check as the photo explorer', async () => {
	const rows: Row[] = [{ id: 'v1', owner_id: 'owner-1', name: 'First week', query: {} }];
	const { client, writes } = fakeTable(rows);
	const query = savedQueryState(parseReportQuery(new URLSearchParams('period=30&measure=photo_opens'), NOW));
	assert.equal(status(await insertView(client, 'owner-1', ' FIRST WEEK ', query)), 409);
	assert.equal(status(await insertView(client, null, 'Other', query)), 401);
	assert.deepEqual(writes, []);
	assert.deepEqual(await insertView(client, 'owner-1', 'Month', query), { saved: true });
	assert.deepEqual(rows.map((row) => row.name), ['First week', 'Month']);
});

test('a rename refuses a name another view has, but a view may keep its own name with new spacing', async () => {
	const rows: Row[] = [{ id: 'v1', owner_id: 'owner-1', name: 'First week', query: {} }, { id: 'v2', owner_id: 'owner-1', name: 'Month', query: {} }];
	const { client } = fakeTable(rows);
	const clash = await renameView(client, 'owner-1', 'v2', 'first week');
	assert.equal(status(clash), 409);
	assert.equal(data(clash).renameId, 'v2');
	assert.equal(rows[1].name, 'Month');
	assert.deepEqual(await renameView(client, 'owner-1', 'v1', 'First Week'), { renamed: true });
	assert.equal(rows[0].name, 'First Week');
});

test('renaming or deleting a view that is someone else\'s, or gone, is a refusal and changes nothing', async () => {
	const rows: Row[] = [{ id: 'v1', owner_id: 'owner-2', name: 'Theirs', query: {} }];
	const { client } = fakeTable(rows);
	assert.equal(status(await renameView(client, 'owner-1', 'v1', 'Mine now')), 404);
	assert.equal(status(await deleteView(client, 'owner-1', 'v1')), 404);
	assert.equal(status(await deleteView(client, 'owner-1', 'missing')), 404);
	assert.equal(status(await deleteView(client, null, 'v1')), 401);
	assert.deepEqual(rows, [{ id: 'v1', owner_id: 'owner-2', name: 'Theirs', query: {} }]);
	assert.equal(status(await deleteView(fakeTable([], ['delete']).client, 'owner-1', 'v1')), 503);
});

test('the owner deletes their own view', async () => {
	const rows: Row[] = [{ id: 'v1', owner_id: 'owner-1', name: 'Mine', query: {} }];
	const { client } = fakeTable(rows);
	assert.deepEqual(await deleteView(client, 'owner-1', 'v1'), { deleted: true });
	assert.deepEqual(rows, []);
});
