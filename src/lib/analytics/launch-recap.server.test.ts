import assert from 'node:assert/strict';
import test from 'node:test';
import type { Finding } from './intelligence-contract';
import { ALL, model, shape, type Shape } from './launch-recap.fixture';
import {
	buildSlotDocument, decodeStoredRecap, readRecapOwners, readRecapStorage, readStoredRecap, readStoredRecaps, recapLink, recapRunDeps, runRecapGeneration, storeRecap,
	type BuiltRecap, type RecapOwner, type RecapRunDeps, type SlotReads
} from './launch-recap.server';
import { MAX_RECAPS_PER_RUN, recapKey, recapSlot, type RecapLaunch, type RecapSlot } from './launch-recap-schedule';
import { buildRecapDocument, buildUnavailableRecapDocument, type RecapDocument } from './launch-recap-text';
import { buildRecap } from './launch-recap';

const JCA: RecapLaunch = { albumKey: 'Re7kho', albumName: 'HS Girls VB - JCA at ACC', firstPublishedAt: '2026-09-26T01:10:52Z', basis: 'inferred' };
const DUE3 = '2026-09-28T13:00:00.000Z';
const at = (iso: string) => new Date(iso);
const owner = (id = 'owner-1', email = false): RecapOwner => ({ ownerId: id, email: email ? { address: 'owner@example.test', verifiedAt: '2026-09-30T00:00:00.000Z', sender: 'owned' } : null });

/** One real document for the JCA day 3 recap, reused for any slot: these tests are about scheduling, not wording. */
function canned(slot: RecapSlot): RecapDocument {
	return { ...documentFor(recapSlot(JCA, 3, at('2026-09-28T13:05:00Z'))), checkpoint: slot.checkpoint };
}

function documentFor(slot: RecapSlot, complete = true): RecapDocument {
	const asOfDay = slot.dueDate;
	const cut: Shape['cut'] = complete ? undefined : { 1: { coverage: 'partial', photoOpens: null, downloads: null, albumOpens: null } };
	const m = model(shape('Re7kho', asOfDay, cut), ALL.map((one) => ({ ...one, asOfDay })), {}, asOfDay);
	const recap = buildRecap({ model: m, arrivals: [], photoIds: new Set(['p1']), stored: true });
	return buildRecapDocument({ slot, recap, model: m, findings: [], findingsRead: true, arrivalsRead: true, link: recapLink(slot.albumKey, slot.checkpoint) });
}

interface Calls { owners: number; existing: number; builds: string[]; stores: Array<{ owner: string; key: string; evidence: string; late: boolean }> }
function deps(over: { owners?: RecapOwner[]; stored?: string[]; build?: (slot: RecapSlot, now: Date) => Promise<BuiltRecap>; store?: (owner: RecapOwner, slot: RecapSlot, doc: RecapDocument) => Promise<'stored' | 'exists'> } = {}): { deps: RecapRunDeps; calls: Calls } {
	const calls: Calls = { owners: 0, existing: 0, builds: [], stores: [] };
	const stored = new Set(over.stored ?? []);
	return {
		calls,
		deps: {
			owners: async () => { calls.owners += 1; return over.owners ?? [owner()]; },
			existing: async () => { calls.existing += 1; return new Set(stored); },
			build: async (slot, now) => { calls.builds.push(slot.key); return over.build ? over.build(slot, now) : { state: 'built', document: documentFor(slot) }; },
			store: async (who, slot, document) => {
				calls.stores.push({ owner: who.ownerId, key: slot.key, evidence: document.evidence, late: slot.late });
				return over.store ? over.store(who, slot, document) : 'stored';
			}
		}
	};
}

test('nothing is due: nothing is read, not even the owners', async () => {
	const { deps: d, calls } = deps();
	const result = await runRecapGeneration(d, [JCA], at('2026-09-27T13:00:00Z'));
	assert.deepEqual(result, { owners: 0, due: 0, stored: 0, existing: 0, waiting: 0, unavailable: 0, skipped: 0, failed: 0 });
	assert.deepEqual([calls.owners, calls.existing, calls.builds.length], [0, 0, 0]);
});

test('a launch younger than 3 days, and an album that is not in the public list, have no recap due', async () => {
	const { deps: d, calls } = deps();
	const young: RecapLaunch = { ...JCA, albumKey: 'young', firstPublishedAt: '2026-09-27T20:00:00Z' };
	assert.equal((await runRecapGeneration(d, [young], at('2026-09-29T13:00:00Z'))).due, 0);
	// An unlisted album never reaches this function: the list it is given is the public one. An empty list is not an error.
	assert.equal((await runRecapGeneration(d, [], at('2026-09-28T13:05:00Z'))).due, 0);
	assert.equal(calls.builds.length, 0);
});

test('with no owner set up, the recap is due but no launch number is read and nothing is stored', async () => {
	const { deps: d, calls } = deps({ owners: [] });
	const result = await runRecapGeneration(d, [JCA], at('2026-09-28T13:05:00Z'));
	assert.deepEqual(result, { owners: 0, due: 1, stored: 0, existing: 0, waiting: 0, unavailable: 0, skipped: 0, failed: 0 });
	assert.deepEqual([calls.existing, calls.builds.length, calls.stores.length], [0, 0, 0]);
});

test('a due recap is built as of its due slot and stored once for the owner; the next run finds it and does nothing', async () => {
	const { deps: d, calls } = deps();
	const result = await runRecapGeneration(d, [JCA], at('2026-09-28T13:05:00Z'));
	assert.deepEqual(result, { owners: 1, due: 1, stored: 1, existing: 0, waiting: 0, unavailable: 0, skipped: 0, failed: 0 });
	assert.deepEqual(calls.builds, ['launch:Re7kho:day3']);
	assert.deepEqual(calls.stores, [{ owner: 'owner-1', key: 'launch:Re7kho:day3', evidence: 'complete', late: false }]);
	// The next minute: the unique key is already stored.
	const again = deps({ stored: ['owner-1|launch:Re7kho:day3'] });
	const second = await runRecapGeneration(again.deps, [JCA], at('2026-09-28T13:06:00Z'));
	assert.equal(second.existing, 1);
	assert.equal(second.stored, 0);
	assert.deepEqual([again.calls.builds.length, again.calls.stores.length], [0, 0]);
});

test('overlapping runs: the loser of the race is told the recap exists and stores nothing twice', async () => {
	let first = true;
	const { deps: d } = deps({ store: async () => { const outcome = first ? 'stored' : 'exists'; first = false; return outcome; } });
	const a = await runRecapGeneration(d, [JCA], at('2026-09-28T13:05:00Z'));
	const b = await runRecapGeneration(d, [JCA], at('2026-09-28T13:05:01Z'));
	assert.deepEqual([a.stored, a.existing, b.stored, b.existing], [1, 0, 0, 1]);
});

test('a late run keeps the intended checkpoint and marks itself late; it is not duplicated by a DST-day retry', async () => {
	const { deps: d, calls } = deps();
	await runRecapGeneration(d, [JCA], at('2026-09-29T09:00:00Z'));
	assert.deepEqual(calls.stores.map((s) => [s.key, s.late]), [['launch:Re7kho:day3', true]]);
	// Published Mar 5 22:00 CST; day 3 is the morning CDT begins. The key and instant do not move.
	const spring: RecapLaunch = { albumKey: 'spring', albumName: 'Spring', firstPublishedAt: '2026-03-06T04:00:00Z', basis: 'recorded' };
	const run = deps({ build: async (slot) => ({ state: 'built', document: canned(slot) }) });
	await runRecapGeneration(run.deps, [spring], at('2026-03-08T13:00:00Z'));
	assert.deepEqual(run.calls.stores.map((s) => [s.key, s.late]), [['launch:spring:day3', false]]);
	const early = deps();
	assert.equal((await runRecapGeneration(early.deps, [spring], at('2026-03-08T12:59:00Z'))).due, 0, 'one minute before 08:00 CDT is not yet due');
});

test('a checkpoint that lapsed more than 3 days ago is not backfilled', async () => {
	const { deps: d, calls } = deps();
	const result = await runRecapGeneration(d, [JCA], at('2026-10-02T13:00:00Z'));
	assert.equal(result.due, 1, 'only day 7 is due; day 3 lapsed on Oct 1 at 08:00');
	assert.deepEqual(calls.builds, ['launch:Re7kho:day7']);
});

test('incomplete records are waited for until the settling period ends, then stored saying so', async () => {
	const { deps: d, calls } = deps({ build: async (slot) => ({ state: 'built', document: documentFor(slot, false) }) });
	const waiting = await runRecapGeneration(d, [JCA], at('2026-09-28T13:05:00Z'));
	assert.deepEqual([waiting.waiting, waiting.stored], [1, 0]);
	assert.equal(calls.stores.length, 0);
	const settled = await runRecapGeneration(d, [JCA], at('2026-09-28T19:00:01Z'));
	assert.deepEqual([settled.waiting, settled.stored], [0, 1]);
	assert.deepEqual(calls.stores.map((s) => [s.evidence, s.late]), [['partial', true]]);
});

test('a launch read that fails is waited for, then stored as an unavailable recap that states no figure', async () => {
	const stored: RecapDocument[] = [];
	const { deps: d } = deps({ build: async () => ({ state: 'unread' }), store: async (_who, _slot, document) => { stored.push(document); return 'stored'; } });
	const waiting = await runRecapGeneration(d, [JCA], at('2026-09-28T14:00:00Z'));
	assert.deepEqual([waiting.waiting, waiting.unavailable, stored.length], [1, 0, 0]);
	const settled = await runRecapGeneration(d, [JCA], at('2026-09-28T19:30:00Z'));
	assert.deepEqual([settled.unavailable, settled.stored], [1, 1]);
	assert.equal(stored[0].evidence, 'unavailable');
	assert.doesNotMatch(stored[0].body, /photo opens/);
	assert.match(stored[0].body, /not a report of zero/);
});

test('the cheap incomplete signal also waits, and is stored as unavailable only if nothing better ever arrives', async () => {
	const { deps: d } = deps({ build: async () => ({ state: 'incomplete' }) });
	assert.equal((await runRecapGeneration(d, [JCA], at('2026-09-28T13:30:00Z'))).waiting, 1);
});

test('a run builds at most MAX_RECAPS_PER_RUN recaps, oldest first, and leaves the rest for the next minute', async () => {
	const launches: RecapLaunch[] = ['a', 'b', 'c', 'd', 'e'].map((key, i) => ({ albumKey: key, albumName: key, firstPublishedAt: `2026-09-2${i + 1}T20:00:00Z`, basis: 'recorded' }));
	const { deps: d, calls } = deps({ build: async (slot) => ({ state: 'built', document: canned(slot) }) });
	// Published Sep 21..25. At Sep 28 13:05: b's day 3 lapsed at 13:00, c and d are late, a's day 7 and e's day 3 are due at 13:00.
	const result = await runRecapGeneration(d, launches, at('2026-09-28T13:05:00Z'));
	assert.equal(MAX_RECAPS_PER_RUN, 2);
	assert.equal(calls.builds.length, MAX_RECAPS_PER_RUN);
	assert.equal(result.stored, MAX_RECAPS_PER_RUN);
	assert.deepEqual(calls.builds, ['launch:c:day3', 'launch:d:day3'], 'oldest due first; b lapsed at 08:00 three days after it was due');
	assert.ok(result.due > MAX_RECAPS_PER_RUN);
});

test('two owners: a recap is stored only for the owner who does not have it yet', async () => {
	const { deps: d, calls } = deps({ owners: [owner('owner-1'), owner('owner-2')], stored: ['owner-1|launch:Re7kho:day3'] });
	const result = await runRecapGeneration(d, [JCA], at('2026-09-28T13:05:00Z'));
	assert.deepEqual(calls.stores.map((s) => s.owner), ['owner-2']);
	assert.equal(result.stored, 1);
});

test('a failed store is counted and does not stop the run; a missing migration stops it at once', async () => {
	const launches: RecapLaunch[] = [JCA, { ...JCA, albumKey: 'Other', firstPublishedAt: '2026-09-26T02:00:00Z' }];
	let n = 0;
	const flaky = deps({ store: async () => { n += 1; if (n === 1) throw new Error('recap brief was not stored (57014)'); return 'stored'; } });
	const result = await runRecapGeneration(flaky.deps, launches, at('2026-09-28T13:05:00Z'));
	assert.deepEqual([result.failed, result.stored], [1, 1]);
	const missing = deps({ store: async () => { throw new Error('recap brief was not stored (23514)'); } });
	const stopped = await runRecapGeneration(missing.deps, launches, at('2026-09-28T13:05:00Z'));
	assert.equal(stopped.failed, 1, 'the second launch was not even tried');
	assert.equal(missing.calls.stores.length, 1);
});

test('when the owners cannot be read the run says it failed and writes nothing', async () => {
	const broken: RecapRunDeps = { ...deps().deps, owners: async () => { throw new Error('down'); } };
	const result = await runRecapGeneration(broken, [JCA], at('2026-09-28T13:05:00Z'));
	assert.equal(result.failed, 1);
	assert.equal(result.stored, 0);
});

/* ---------------------------------------------------------------------------------------------- */

type Insert = { table: string; row: Record<string, unknown> };
function fakeAdmin(errors: Record<string, { code: string } | undefined> = {}) {
	const inserts: Insert[] = [];
	const client = {
		from(table: string) {
			return {
				insert(row: Record<string, unknown>) {
					inserts.push({ table, row });
					const key = table === 'analytics_intelligence_deliveries' ? `delivery:${row.channel}` : table;
					const error = errors[key] ?? null;
					const result = { data: error ? null : { id: 'brief-1' }, error };
					return Object.assign(Promise.resolve({ data: null, error }), { select: () => ({ single: async () => result }) });
				}
			};
		}
	};
	return { client: client as never, inserts };
}
const slot3 = () => recapSlot(JCA, 3, at('2026-09-28T13:05:00Z'));

test('storing a recap writes the brief with its key and a dashboard record; with no verified destination there is no email record', async () => {
	const { client, inserts } = fakeAdmin();
	const slot = slot3();
	const outcome = await storeRecap(client, owner(), slot, documentFor(slot), at('2026-09-28T13:05:00Z'));
	assert.equal(outcome, 'stored');
	const brief = inserts.find((one) => one.table === 'analytics_intelligence_briefs')!.row;
	assert.equal(brief.kind, 'launch_recap');
	assert.equal(brief.incident_key, 'launch:Re7kho:day3');
	assert.equal(brief.period_key, '2026-09-28');
	assert.equal(brief.late, false);
	assert.equal(brief.scope_key, null, 'no pointer foreign key, so the recap outlives any snapshot pointer');
	assert.match(String(brief.body), /^HS Girls VB - JCA at ACC: day 3 recap\n\n/);
	const deliveries = inserts.filter((one) => one.table === 'analytics_intelligence_deliveries').map((one) => one.row);
	assert.deepEqual(deliveries.map((row) => row.channel), ['dashboard']);
	assert.equal(deliveries[0].idempotency_key, 'dashboard:brief-1');
	assert.equal((deliveries[0].payload as { body: string }).body, brief.body, 'the dashboard and the email carry one text');
});

test('with a verified destination, a complete recap is queued for email and an incomplete one is recorded as suppressed with its reason', async () => {
	const complete = fakeAdmin();
	const slot = slot3();
	await storeRecap(complete.client, owner('o', true), slot, documentFor(slot), at('2026-09-28T13:05:00Z'));
	const email = complete.inserts.filter((one) => one.table === 'analytics_intelligence_deliveries').map((one) => one.row).find((row) => row.channel === 'email')!;
	assert.equal(email.status, 'pending');
	assert.equal(email.error_code, null);
	assert.equal(email.idempotency_key, 'email:brief-1');
	assert.equal(email.destination_verified, true);
	assert.deepEqual(email.destination, { channel: 'email', address: 'owner@example.test', verifiedAt: '2026-09-30T00:00:00.000Z' });
	const partial = fakeAdmin();
	await storeRecap(partial.client, owner('o', true), slot, documentFor(slot, false), at('2026-09-28T13:05:00Z'));
	const held = partial.inserts.filter((one) => one.table === 'analytics_intelligence_deliveries').map((one) => one.row).find((row) => row.channel === 'email')!;
	assert.equal(held.status, 'suppressed');
	assert.equal(held.error_code, 'recap_not_complete');
	const unavailable = fakeAdmin();
	await storeRecap(unavailable.client, owner('o', true), slot, buildUnavailableRecapDocument(slot, recapLink('Re7kho', 3)), at('2026-09-28T13:05:00Z'));
	assert.equal(unavailable.inserts.filter((one) => one.table === 'analytics_intelligence_deliveries').map((one) => one.row).find((row) => row.channel === 'email')!.status, 'suppressed');
});

test('a unique-key violation on the brief means it is stored already: no delivery record is written', async () => {
	const { client, inserts } = fakeAdmin({ analytics_intelligence_briefs: { code: '23505' } });
	const slot = slot3();
	assert.equal(await storeRecap(client, owner('o', true), slot, documentFor(slot), at('2026-09-28T13:05:00Z')), 'exists');
	assert.deepEqual(inserts.map((one) => one.table), ['analytics_intelligence_briefs']);
});

test('any other brief error is thrown with its code, and a duplicate delivery key is tolerated', async () => {
	const slot = slot3();
	await assert.rejects(storeRecap(fakeAdmin({ analytics_intelligence_briefs: { code: '23514' } }).client, owner(), slot, documentFor(slot), at('2026-09-28T13:05:00Z')), /\(23514\)/);
	assert.equal(await storeRecap(fakeAdmin({ 'delivery:dashboard': { code: '23505' } }).client, owner(), slot, documentFor(slot), at('2026-09-28T13:05:00Z')), 'stored');
	await assert.rejects(storeRecap(fakeAdmin({ 'delivery:dashboard': { code: '42501' } }).client, owner(), slot, documentFor(slot), at('2026-09-28T13:05:00Z')), /delivery record/);
});

/* ---------------------------------------------------------------------------------------------- */

function readerAdmin(tables: Record<string, { data?: unknown[]; count?: number; error?: { message: string } }>) {
	const chain = (table: string) => {
		const answer = tables[table] ?? { data: [] };
		const c: Record<string, unknown> = {};
		for (const name of ['select', 'eq', 'neq', 'in', 'order', 'limit']) c[name] = () => c;
		c.then = (resolve: (value: unknown) => unknown) => resolve({ data: answer.data ?? null, count: answer.count ?? null, error: answer.error ?? null });
		return c;
	};
	return { from: (table: string) => chain(table) } as never;
}
const storedRow = (checkpoint: 3 | 7, createdAt: string, extra: Record<string, unknown> = {}) => ({
	period_key: checkpoint === 3 ? '2026-09-28' : '2026-10-02', late: false, created_at: createdAt, incident_key: recapKey('Re7kho', checkpoint), body: `Body ${checkpoint}`,
	source_windows: [{ current: { start: '2026-09-25', end: '2026-09-27' }, recap: { albumKey: 'Re7kho', checkpoint, dueAt: checkpoint === 3 ? DUE3 : '2026-10-02T13:00:00.000Z', subject: `Subject ${checkpoint}`, evidence: 'complete', missing: [] } }], ...extra
});

test('stored recaps are decoded strictly: a row whose key and metadata disagree is dropped', () => {
	assert.equal(decodeStoredRecap(storedRow(3, '2026-09-28T13:01:00Z'))?.subject, 'Subject 3');
	assert.deepEqual(decodeStoredRecap(storedRow(3, '2026-09-28T13:01:00Z'))?.window, { start: '2026-09-25', end: '2026-09-27' });
	assert.equal(decodeStoredRecap({ ...storedRow(3, '2026-09-28T13:01:00Z'), source_windows: [{ current: { start: '2026-09-27', end: '2026-09-25' }, recap: { albumKey: 'Re7kho', checkpoint: 3, dueAt: DUE3 } }] })?.window, null, 'a backwards window is not trusted');
	assert.equal(decodeStoredRecap({ ...storedRow(3, '2026-09-28T13:01:00Z'), incident_key: 'launch:Other:day3' }), null);
	assert.equal(decodeStoredRecap({ ...storedRow(3, '2026-09-28T13:01:00Z'), source_windows: [] }), null);
	assert.equal(decodeStoredRecap({ ...storedRow(3, '2026-09-28T13:01:00Z'), source_windows: [{ recap: { albumKey: 'Re7kho', checkpoint: 5, dueAt: DUE3 } }] }), null);
	assert.equal(decodeStoredRecap({ ...storedRow(3, '2026-09-28T13:01:00Z'), source_windows: [{ recap: { albumKey: 'Re7kho', checkpoint: 3, dueAt: 'not a date' } }] }), null);
	const odd = decodeStoredRecap(storedRow(3, '2026-09-28T13:01:00Z', { source_windows: [{ recap: { albumKey: 'Re7kho', checkpoint: 3, dueAt: DUE3, evidence: 'surprising', missing: ['a', 4] } }] }));
	assert.equal(odd?.evidence, 'partial', 'an unknown evidence value is never read as complete');
	assert.deepEqual(odd?.missing, ['a']);
});

test('the list is day 3 then day 7, one per checkpoint (the earliest when two owners have it), without text; an error is null, never an empty list', async () => {
	const rows = [storedRow(7, '2026-10-02T13:02:00Z'), storedRow(3, '2026-09-28T13:09:00Z'), storedRow(3, '2026-09-28T13:01:00Z')];
	const list = await readStoredRecaps(readerAdmin({ analytics_intelligence_briefs: { data: rows } }), 'Re7kho');
	assert.deepEqual(list?.map((one) => [one.checkpoint, one.createdAt]), [[3, '2026-09-28T13:01:00Z'], [7, '2026-10-02T13:02:00Z']]);
	assert.ok(list?.every((one) => !('body' in one)));
	assert.equal(await readStoredRecaps(readerAdmin({ analytics_intelligence_briefs: { error: { message: 'down' } } }), 'Re7kho'), null);
	assert.deepEqual(await readStoredRecaps(readerAdmin({ analytics_intelligence_briefs: { data: [] } }), 'Re7kho'), []);
	const one = await readStoredRecap(readerAdmin({ analytics_intelligence_briefs: { data: [storedRow(3, '2026-09-28T13:01:00Z')] } }), 'Re7kho', 3);
	assert.equal(one?.body, 'Body 3');
	assert.equal(await readStoredRecap(readerAdmin({ analytics_intelligence_briefs: { data: [] } }), 'Re7kho', 3), null);
});

test('storage state: stored keys and whether any owner is set up; unreadable is null', async () => {
	const ok = await readRecapStorage(readerAdmin({ analytics_intelligence_preferences: { count: 1 }, analytics_intelligence_briefs: { data: [{ incident_key: 'launch:Re7kho:day3' }] } }));
	assert.deepEqual([...ok!.keys], ['launch:Re7kho:day3']);
	assert.equal(ok!.storing, true);
	assert.equal((await readRecapStorage(readerAdmin({ analytics_intelligence_preferences: { count: 0 }, analytics_intelligence_briefs: { data: [] } })))!.storing, false);
	assert.equal(await readRecapStorage(readerAdmin({ analytics_intelligence_preferences: { error: { message: 'down' } }, analytics_intelligence_briefs: { data: [] } })), null);
});

test('owners need retention chosen and the dashboard on; email needs the delivery path\'s own full set of conditions', async () => {
	const row = { owner_id: 'o1', external_enabled: true, destination_verified: true, destination_verified_at: '2026-09-30T00:00:00Z', destination: 'a@example.test', sender: 'owned' };
	const owners = await readRecapOwners(readerAdmin({ analytics_intelligence_preferences: { data: [row, { ...row, owner_id: 'o2', destination_verified: false }, { ...row, owner_id: 'o3', external_enabled: false }, { ...row, owner_id: 'o4', sender: 'other' }, { ...row, owner_id: 'o5', destination: '' }, { owner_id: 7 }] } }));
	assert.deepEqual(owners.map((one) => [one.ownerId, one.email?.address ?? null]), [['o1', 'a@example.test'], ['o2', null], ['o3', null], ['o4', null], ['o5', null]]);
	await assert.rejects(readRecapOwners(readerAdmin({ analytics_intelligence_preferences: { error: { message: 'down' } } })), /recap owners unavailable/);
	assert.equal(typeof recapRunDeps(readerAdmin({})).owners, 'function');
});

/* ---------------------------------------------------------------------------------------------- */

function reads(over: Partial<SlotReads> = {}): SlotReads {
	return {
		visible: async () => true,
		model: async (slot) => model(shape('Re7kho', slot.dueDate), ALL.map((one) => ({ ...one, asOfDay: slot.dueDate })), {}, slot.dueDate),
		photoRows: async () => ['p1', 'p2', 'p3', 'p4'].map((photoId) => ({ photoId })),
		arrivals: async () => ({ arrivals: [{ source: 'instagram', count: 5 }], read: true }),
		findings: async () => ({ findings: [], read: true }),
		...over
	};
}

test('building a slot reads the model as of the due slot and writes the stored words', async () => {
	let asked: RecapSlot | null = null;
	const built = await buildSlotDocument(reads({ model: async (slot) => { asked = slot; return model(shape('Re7kho', slot.dueDate), ALL.map((one) => ({ ...one, asOfDay: slot.dueDate })), {}, slot.dueDate); } }), slot3(), at('2026-09-28T13:05:00Z'));
	assert.equal(asked!.dueAt, DUE3);
	assert.equal(built.state, 'built');
	assert.equal(built.state === 'built' && built.document.complete, true);
	assert.equal(built.state === 'built' && /Today,/.test(built.document.body), false);
});

test('a failed model or photo read is unread; an album with no launch date is unread; incomplete days stop at the cheap read while settling', async () => {
	assert.deepEqual(await buildSlotDocument(reads({ model: async () => { throw new Error('rpc down'); } }), slot3(), at('2026-09-28T13:05:00Z')), { state: 'unread' });
	assert.deepEqual(await buildSlotDocument(reads({ photoRows: async () => { throw new Error('photos down'); } }), slot3(), at('2026-09-28T13:05:00Z')), { state: 'unread' });
	const undated = reads({ model: async () => { const m = model(shape('Re7kho', '2026-09-28'), ALL.map((one) => ({ ...one, asOfDay: '2026-09-28' })), {}, '2026-09-28'); (m.album as { status: string }).status = 'no_launch_date'; return m; } });
	assert.deepEqual(await buildSlotDocument(undated, slot3(), at('2026-09-28T13:05:00Z')), { state: 'unread' });
	let otherReads = 0;
	const gap = reads({
		model: async () => model(shape('Re7kho', '2026-09-28', { 1: { coverage: 'partial', photoOpens: null, downloads: null, albumOpens: null } }), ALL.map((one) => ({ ...one, asOfDay: '2026-09-28' })), {}, '2026-09-28'),
		arrivals: async () => { otherReads += 1; return { arrivals: [], read: true }; }
	});
	assert.deepEqual(await buildSlotDocument(gap, slot3(), at('2026-09-28T13:05:00Z')), { state: 'incomplete' });
	assert.equal(otherReads, 0, 'the other reads are not repeated while records may still arrive');
	const settled = await buildSlotDocument(gap, slot3(), at('2026-09-28T19:30:00Z'));
	assert.equal(settled.state === 'built' && settled.document.evidence, 'partial', 'past the settling period it is built and says what is missing');
});

test('findings that could not be read, and tags that could not be read, make the stored recap incomplete rather than silent', async () => {
	const noFindings = await buildSlotDocument(reads({ findings: async () => ({ findings: [], read: false }) }), slot3(), at('2026-09-28T13:05:00Z'));
	assert.equal(noFindings.state === 'built' && noFindings.document.complete, false);
	const noTags = await buildSlotDocument(reads({ arrivals: async () => ({ arrivals: null, read: false }) }), slot3(), at('2026-09-28T13:05:00Z'));
	assert.equal(noTags.state === 'built' && noTags.document.missing[0], 'how people arrived, which could not be read');
	const finding: Finding = {
		id: 'f', rule: 'launch_reach', target: { kind: 'album', albumKey: 'Re7kho' }, title: 'T', explanation: 'E.', action: 'A.', reportHref: '/albums/Re7kho', status: 'open',
		evidence: { windows: { current: { start: '2026-09-25', end: '2026-09-27' } }, cutoff: null, coverage: 'complete', units: 'photo opens', strength: 'strong' }
	};
	const withFinding = await buildSlotDocument(reads({ findings: async () => ({ findings: [finding], read: true }) }), slot3(), at('2026-09-28T13:05:00Z'));
	assert.match(withFinding.state === 'built' ? withFinding.document.body : '', /- T\. E\. Next step: A\./);
});

test('the link in a recap opens the report on the recap, on the report host', () => {
	assert.equal(recapLink('Re7kho', 7), 'https://analytics.ninochavez.co/albums/Re7kho?recap=7');
});

test('an unlisted album gets no recap: it is skipped before any launch number is read, and nothing is stored', async () => {
	let modelReads = 0;
	const hidden = reads({ visible: async () => false, model: async () => { modelReads += 1; throw new Error('must not be read'); } });
	assert.deepEqual(await buildSlotDocument(hidden, slot3(), at('2026-09-28T13:05:00Z')), { state: 'skipped' });
	assert.equal(modelReads, 0);
	const { deps: d, calls } = deps({ build: (slot, now) => buildSlotDocument(hidden, slot, now) });
	const result = await runRecapGeneration(d, [JCA], at('2026-09-28T13:05:00Z'));
	assert.deepEqual([result.skipped, result.stored, result.waiting, result.unavailable, result.failed], [1, 0, 0, 0, 0]);
	assert.equal(calls.stores.length, 0);
	// A failed visibility read is unread, never "visible".
	assert.deepEqual(await buildSlotDocument(reads({ visible: async () => { throw new Error('down'); } }), slot3(), at('2026-09-28T13:05:00Z')), { state: 'unread' });
});

test('visibility is read from album_settings: unlisted is hidden; public and no row are visible; an error throws', async () => {
	const { slotReads } = await import('./launch-recap.server');
	const admin = (answer: { data: unknown; error: unknown }) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => answer }) }) }) }) as never;
	assert.equal(await slotReads(admin({ data: { visibility: 'unlisted' }, error: null })).visible('x'), false);
	assert.equal(await slotReads(admin({ data: { visibility: 'public' }, error: null })).visible('x'), true);
	assert.equal(await slotReads(admin({ data: null, error: null })).visible('x'), true);
	await assert.rejects(slotReads(admin({ data: null, error: { message: 'down' } })).visible('x'), /visibility unavailable/);
});
