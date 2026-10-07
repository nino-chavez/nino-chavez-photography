import assert from 'node:assert/strict';
import test from 'node:test';
import type { Finding } from './intelligence-contract';
import { ALL, model, shape, type Shape } from './launch-recap.fixture';
import {
	buildSlotDocument, decodeStoredRecap, readEmailOwners, readStoredRecap, readStoredRecaps, queueRecapEmail, recapLink, recapRunDeps, runRecapGeneration, slotReads, storeRecap,
	type BuiltRecap, type EmailOwner, type RecapRunDeps, type SlotReads
} from './launch-recap.server';
import { MAX_RECAPS_PER_RUN, recapKey, recapSlot, type RecapLaunch, type RecapSlot } from './launch-recap-schedule';
import { buildRecapDocument, buildUnavailableRecapDocument, type RecapDocument } from './launch-recap-text';
import { buildRecap } from './launch-recap';

const JCA: RecapLaunch = { albumKey: 'Re7kho', albumName: 'HS Girls VB - JCA at ACC', firstPublishedAt: '2026-09-26T01:10:52Z', basis: 'inferred' };
const DUE3 = '2026-09-28T13:00:00.000Z';
const at = (iso: string) => new Date(iso);
const owner = (id = 'owner-1'): EmailOwner => ({ ownerId: id, address: 'owner@example.test', verifiedAt: '2026-09-30T00:00:00.000Z', sender: 'owned' });

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

interface Calls { existing: number; builds: string[]; stores: Array<{ key: string; evidence: string; late: boolean }>; emails: Array<{ owner: string; key: string }> }
function deps(over: { owners?: EmailOwner[]; stored?: string[]; build?: (slot: RecapSlot, now: Date) => Promise<BuiltRecap>; store?: (slot: RecapSlot, doc: RecapDocument) => Promise<'stored' | 'exists'>; queue?: () => Promise<'queued' | 'exists'> } = {}): { deps: RecapRunDeps; calls: Calls } {
	const calls: Calls = { existing: 0, builds: [], stores: [], emails: [] };
	const stored = new Set(over.stored ?? []);
	return {
		calls,
		deps: {
			existing: async () => { calls.existing += 1; return new Set(stored); },
			build: async (slot, now) => { calls.builds.push(slot.key); return over.build ? over.build(slot, now) : { state: 'built', document: documentFor(slot) }; },
			store: async (slot, document) => {
				calls.stores.push({ key: slot.key, evidence: document.evidence, late: slot.late });
				return over.store ? over.store(slot, document) : 'stored';
			},
			emailOwners: async () => over.owners ?? [],
			queueEmail: async (who, slot) => { calls.emails.push({ owner: who.ownerId, key: slot.key }); return over.queue ? over.queue() : 'queued'; }
		}
	};
}
const zero = { due: 0, stored: 0, existing: 0, waiting: 0, unavailable: 0, skipped: 0, failed: 0, built: 0, emailQueued: 0 };

test('nothing is due: nothing is read', async () => {
	const { deps: d, calls } = deps();
	assert.deepEqual(await runRecapGeneration(d, [JCA], at('2026-09-27T13:00:00Z')), zero);
	assert.deepEqual([calls.existing, calls.builds.length], [0, 0]);
});

test('a launch younger than 3 days, and an album that is not in the public list, have no recap due', async () => {
	const { deps: d, calls } = deps();
	const young: RecapLaunch = { ...JCA, albumKey: 'young', firstPublishedAt: '2026-09-27T20:00:00Z' };
	assert.equal((await runRecapGeneration(d, [young], at('2026-09-29T13:00:00Z'))).due, 0);
	assert.equal((await runRecapGeneration(d, [], at('2026-09-28T13:05:00Z'))).due, 0);
	assert.equal(calls.builds.length, 0);
});

test('a due recap is written whether or not any owner exists: no owner is read to decide it, and nothing is emailed', async () => {
	const { deps: d, calls } = deps({ owners: [] });
	const result = await runRecapGeneration(d, [JCA], at('2026-09-28T13:05:00Z'));
	assert.deepEqual(result, { ...zero, due: 1, stored: 1, built: 1 });
	assert.deepEqual(calls.stores, [{ key: 'launch:Re7kho:day3', evidence: 'complete', late: false }]);
	assert.deepEqual(calls.emails, []);
});

test('the next run finds it by its key and does nothing', async () => {
	const again = deps({ stored: ['launch:Re7kho:day3'] });
	const second = await runRecapGeneration(again.deps, [JCA], at('2026-09-28T13:06:00Z'));
	assert.deepEqual(second, { ...zero, due: 1, existing: 1 });
	assert.deepEqual([again.calls.builds.length, again.calls.stores.length], [0, 0]);
});

test('overlapping runs: the loser of the race is told it exists and queues no email', async () => {
	let first = true;
	const { deps: d, calls } = deps({ owners: [owner()], store: async () => { const outcome = first ? 'stored' : 'exists'; first = false; return outcome; } });
	const a = await runRecapGeneration(d, [JCA], at('2026-09-28T13:05:00Z'));
	const b = await runRecapGeneration(d, [JCA], at('2026-09-28T13:05:01Z'));
	assert.deepEqual([a.stored, a.existing, b.stored, b.existing], [1, 0, 0, 1]);
	assert.equal(calls.emails.length, 1, 'only the run that stored the recap queued its email');
});

test('email is queued per owner with a verified destination, after the recap is stored; a duplicate is not counted', async () => {
	const { deps: d, calls } = deps({ owners: [owner('a'), owner('b')] });
	const result = await runRecapGeneration(d, [JCA], at('2026-09-28T13:05:00Z'));
	assert.deepEqual(calls.emails, [{ owner: 'a', key: 'launch:Re7kho:day3' }, { owner: 'b', key: 'launch:Re7kho:day3' }]);
	assert.equal(result.emailQueued, 2);
	const dup = deps({ owners: [owner('a')], queue: async () => 'exists' });
	assert.equal((await runRecapGeneration(dup.deps, [JCA], at('2026-09-28T13:05:00Z'))).emailQueued, 0);
});

test('an email that cannot be queued is a failure of the email only: the recap stays stored', async () => {
	const { deps: d } = deps({ owners: [owner()], queue: async () => { throw new Error('down'); } });
	const result = await runRecapGeneration(d, [JCA], at('2026-09-28T13:05:00Z'));
	assert.deepEqual([result.stored, result.failed, result.emailQueued], [1, 1, 0]);
});

test('a late run keeps the intended checkpoint and marks itself late; a DST-day run is not early or duplicated', async () => {
	const { deps: d, calls } = deps();
	await runRecapGeneration(d, [JCA], at('2026-09-29T09:00:00Z'));
	assert.deepEqual(calls.stores.map((s) => [s.key, s.late]), [['launch:Re7kho:day3', true]]);
	const spring: RecapLaunch = { albumKey: 'spring', albumName: 'Spring', firstPublishedAt: '2026-03-06T04:00:00Z', basis: 'recorded' };
	const run = deps({ build: async (slot) => ({ state: 'built', document: canned(slot) }) });
	await runRecapGeneration(run.deps, [spring], at('2026-03-08T13:00:00Z'));
	assert.deepEqual(run.calls.stores.map((s) => [s.key, s.late]), [['launch:spring:day3', false]]);
	const early = deps();
	assert.equal((await runRecapGeneration(early.deps, [spring], at('2026-03-08T12:59:00Z'))).due, 0, 'one minute before 08:00 CDT is not yet due');
});

test('a checkpoint that lapsed more than 3 days ago is not written by the scheduler', async () => {
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
	const { deps: d } = deps({ build: async () => ({ state: 'unread' }), store: async (_slot, document) => { stored.push(document); return 'stored'; } });
	const waiting = await runRecapGeneration(d, [JCA], at('2026-09-28T14:00:00Z'));
	assert.deepEqual([waiting.waiting, waiting.unavailable, stored.length], [1, 0, 0]);
	const settled = await runRecapGeneration(d, [JCA], at('2026-09-28T19:30:00Z'));
	assert.deepEqual([settled.unavailable, settled.stored], [1, 1]);
	assert.equal(stored[0].evidence, 'unavailable');
	assert.doesNotMatch(stored[0].body, /photo opens/);
	assert.match(stored[0].body, /not a report of zero/);
});

test('the cheap incomplete signal also waits, and does not count as a built recap', async () => {
	const { deps: d } = deps({ build: async () => ({ state: 'incomplete' }) });
	const result = await runRecapGeneration(d, [JCA], at('2026-09-28T13:30:00Z'));
	assert.deepEqual([result.waiting, result.built], [1, 0]);
});

test('a run builds at most one recap, oldest first, and leaves the rest for the next minute', async () => {
	const launches: RecapLaunch[] = ['a', 'b', 'c', 'd', 'e'].map((key, i) => ({ albumKey: key, albumName: key, firstPublishedAt: `2026-09-2${i + 1}T20:00:00Z`, basis: 'recorded' }));
	const { deps: d, calls } = deps({ build: async (slot) => ({ state: 'built', document: canned(slot) }) });
	// Published Sep 21..25. At Sep 28 13:05: b's day 3 lapsed at 13:00, c and d are late, a's day 7 and e's day 3 are due at 13:00.
	const result = await runRecapGeneration(d, launches, at('2026-09-28T13:05:00Z'));
	assert.equal(MAX_RECAPS_PER_RUN, 1);
	assert.deepEqual(calls.builds, ['launch:c:day3'], 'oldest due first; b lapsed at 08:00 three days after it was due');
	assert.deepEqual([result.stored, result.built], [1, 1]);
	assert.ok(result.due > MAX_RECAPS_PER_RUN);
});

test('a failed store is counted and does not stop the next; a missing table stops the run at once', async () => {
	const launches: RecapLaunch[] = [JCA, { ...JCA, albumKey: 'Other', firstPublishedAt: '2026-09-26T02:00:00Z' }];
	// Two per run so the second is reached; the constant is exercised above.
	let n = 0;
	const flaky = deps({ store: async () => { n += 1; throw new Error('recap was not stored (57014)'); } });
	const result = await runRecapGeneration(flaky.deps, launches, at('2026-09-28T13:05:00Z'));
	assert.equal(result.failed, 1);
	assert.equal(n, 1);
	const missing = deps({ store: async () => { throw new Error('recap was not stored (42P01)'); } });
	const stopped = await runRecapGeneration(missing.deps, launches, at('2026-09-28T13:05:00Z'));
	assert.equal(stopped.failed, 1);
	assert.equal(missing.calls.stores.length, 1);
});

test('when what is stored cannot be read the run says it failed and writes nothing', async () => {
	const broken: RecapRunDeps = { ...deps().deps, existing: async () => { throw new Error('down'); } };
	const result = await runRecapGeneration(broken, [JCA], at('2026-09-28T13:05:00Z'));
	assert.deepEqual([result.failed, result.stored], [1, 0]);
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

test('storing a recap writes one public row with no owner, its covered days and its text, and nothing else', async () => {
	const { client, inserts } = fakeAdmin();
	const slot = slot3();
	const document = documentFor(slot);
	assert.equal(await storeRecap(client, slot, document, 'scheduled'), 'stored');
	assert.deepEqual(inserts.map((one) => one.table), ['analytics_launch_recaps']);
	const row = inserts[0].row;
	assert.deepEqual([row.album_key, row.checkpoint, row.due_date, row.due_at, row.late, row.source, row.evidence], ['Re7kho', 3, '2026-09-28', DUE3, false, 'scheduled', 'complete']);
	assert.deepEqual([row.covers_start, row.covers_end], ['2026-09-25', '2026-09-27']);
	assert.equal(row.body, document.body);
	assert.ok(!('owner_id' in row));
	assert.match(String(row.subject), /day 3 recap$/);
});

test('a late scheduled recap is marked late; a backfilled one never is', async () => {
	const lateSlot = recapSlot(JCA, 3, at('2026-09-29T09:00:00Z'));
	const a = fakeAdmin(); await storeRecap(a.client, lateSlot, documentFor(slot3()), 'scheduled');
	const b = fakeAdmin(); await storeRecap(b.client, lateSlot, documentFor(slot3()), 'backfill');
	assert.equal(a.inserts[0].row.late, true);
	assert.deepEqual([b.inserts[0].row.late, b.inserts[0].row.source], [false, 'backfill']);
});

test('a unique-key violation means the recap exists already; any other error is thrown with its code', async () => {
	const slot = slot3();
	assert.equal(await storeRecap(fakeAdmin({ analytics_launch_recaps: { code: '23505' } }).client, slot, documentFor(slot), 'scheduled'), 'exists');
	await assert.rejects(storeRecap(fakeAdmin({ analytics_launch_recaps: { code: '42P01' } }).client, slot, documentFor(slot), 'scheduled'), /\(42P01\)/);
});

test('queueing an email writes a private brief then a pending email record for a complete recap; an incomplete one is suppressed with its reason', async () => {
	const slot = slot3();
	const complete = fakeAdmin();
	assert.equal(await queueRecapEmail(complete.client, owner('o'), slot, documentFor(slot), at('2026-09-28T13:05:00Z')), 'queued');
	assert.deepEqual(complete.inserts.map((one) => one.table), ['analytics_intelligence_briefs', 'analytics_intelligence_deliveries']);
	const brief = complete.inserts[0].row;
	assert.deepEqual([brief.owner_id, brief.kind, brief.incident_key, brief.period_key], ['o', 'launch_recap', 'launch:Re7kho:day3', '2026-09-28']);
	const email = complete.inserts[1].row;
	assert.deepEqual([email.channel, email.status, email.error_code, email.idempotency_key, email.destination_verified], ['email', 'pending', null, 'email:brief-1', true]);
	assert.deepEqual(email.destination, { channel: 'email', address: 'owner@example.test', verifiedAt: '2026-09-30T00:00:00.000Z' });
	assert.equal((email.payload as { body: string }).body, brief.body, 'the recap and the email carry one text');
	const held = fakeAdmin();
	await queueRecapEmail(held.client, owner('o'), slot, documentFor(slot, false), at('2026-09-28T13:05:00Z'));
	assert.deepEqual([held.inserts[1].row.status, held.inserts[1].row.error_code], ['suppressed', 'recap_not_complete']);
	const none = fakeAdmin();
	await queueRecapEmail(none.client, owner('o'), slot, buildUnavailableRecapDocument(slot, recapLink('Re7kho', 3)), at('2026-09-28T13:05:00Z'));
	assert.equal(none.inserts[1].row.status, 'suppressed');
});

test('a queued email for the same owner and recap is a unique violation: no email record is written; other errors throw', async () => {
	const slot = slot3();
	const dup = fakeAdmin({ analytics_intelligence_briefs: { code: '23505' } });
	assert.equal(await queueRecapEmail(dup.client, owner(), slot, documentFor(slot), at('2026-09-28T13:05:00Z')), 'exists');
	assert.deepEqual(dup.inserts.map((one) => one.table), ['analytics_intelligence_briefs']);
	await assert.rejects(queueRecapEmail(fakeAdmin({ analytics_intelligence_briefs: { code: '23514' } }).client, owner(), slot, documentFor(slot), at('2026-09-28T13:05:00Z')), /\(23514\)/);
	await assert.rejects(queueRecapEmail(fakeAdmin({ 'delivery:email': { code: '42501' } }).client, owner(), slot, documentFor(slot), at('2026-09-28T13:05:00Z')), /email record/);
});

/* ---------------------------------------------------------------------------------------------- */

function readerAdmin(tables: Record<string, { data?: unknown[]; error?: { message: string } }>) {
	const chain = (table: string) => {
		const answer = tables[table] ?? { data: [] };
		const c: Record<string, unknown> = {};
		for (const name of ['select', 'eq', 'neq', 'in', 'order', 'limit']) c[name] = () => c;
		c.then = (resolve: (value: unknown) => unknown) => resolve({ data: answer.data ?? null, error: answer.error ?? null });
		return c;
	};
	return { from: (table: string) => chain(table) } as never;
}
const storedRow = (checkpoint: 3 | 7, createdAt: string, extra: Record<string, unknown> = {}) => ({
	album_key: 'Re7kho', checkpoint, due_date: checkpoint === 3 ? '2026-09-28' : '2026-10-02', due_at: checkpoint === 3 ? DUE3 : '2026-10-02T13:00:00+00:00', late: false, source: 'scheduled', created_at: createdAt,
	evidence: 'complete', missing: [], covers_start: '2026-09-25', covers_end: checkpoint === 3 ? '2026-09-27' : '2026-10-01', subject: `Subject ${checkpoint}`, body: `Body ${checkpoint}`, ...extra
});

test('stored recaps are decoded strictly: a row that does not fit is dropped, an unknown evidence value is never complete', () => {
	const ok = decodeStoredRecap(storedRow(3, '2026-09-28T13:01:00Z'));
	assert.equal(ok?.subject, 'Subject 3');
	assert.equal(ok?.key, 'launch:Re7kho:day3');
	assert.deepEqual(ok?.window, { start: '2026-09-25', end: '2026-09-27' });
	assert.equal(decodeStoredRecap(storedRow(3, '2026-09-28T13:01:00Z', { checkpoint: 5 })), null);
	assert.equal(decodeStoredRecap(storedRow(3, '2026-09-28T13:01:00Z', { due_at: 'not a date' })), null);
	assert.equal(decodeStoredRecap(storedRow(3, '2026-09-28T13:01:00Z', { due_date: '28 Sep' })), null);
	assert.equal(decodeStoredRecap(storedRow(3, '2026-09-28T13:01:00Z', { covers_start: '2026-09-27', covers_end: '2026-09-25' }))?.window, null, 'a backwards window is not trusted');
	assert.equal(decodeStoredRecap(storedRow(3, '2026-09-28T13:01:00Z', { covers_start: null, covers_end: null }))?.window, null);
	const odd = decodeStoredRecap(storedRow(3, '2026-09-28T13:01:00Z', { evidence: 'surprising', missing: ['a', 4], source: 'backfill' }));
	assert.equal(odd?.evidence, 'partial');
	assert.deepEqual(odd?.missing, ['a']);
	assert.equal(odd?.source, 'backfill');
});

test('the list is day 3 then day 7, without text; an error is null, never an empty list', async () => {
	const rows = [storedRow(7, '2026-10-02T13:02:00Z'), storedRow(3, '2026-09-28T13:01:00Z')];
	const list = await readStoredRecaps(readerAdmin({ analytics_launch_recaps: { data: rows } }), 'Re7kho');
	assert.deepEqual(list?.map((one) => [one.checkpoint, one.createdAt]), [[3, '2026-09-28T13:01:00Z'], [7, '2026-10-02T13:02:00Z']]);
	assert.ok(list?.every((one) => !('body' in one)));
	assert.equal(await readStoredRecaps(readerAdmin({ analytics_launch_recaps: { error: { message: 'down' } } }), 'Re7kho'), null);
	assert.deepEqual(await readStoredRecaps(readerAdmin({ analytics_launch_recaps: { data: [] } }), 'Re7kho'), []);
	const one = await readStoredRecap(readerAdmin({ analytics_launch_recaps: { data: [storedRow(3, '2026-09-28T13:01:00Z')] } }), 'Re7kho', 3);
	assert.equal(one?.body, 'Body 3');
	assert.equal(await readStoredRecap(readerAdmin({ analytics_launch_recaps: { data: [] } }), 'Re7kho', 3), null);
	assert.equal(await readStoredRecap(readerAdmin({ analytics_launch_recaps: { error: { message: 'down' } } }), 'Re7kho', 3), null);
});

test('email owners need email on, a verified destination with its time and an allowed sender', async () => {
	const row = { owner_id: 'o1', destination_verified_at: '2026-09-30T00:00:00Z', destination: 'a@example.test', sender: 'owned' };
	const owners = await readEmailOwners(readerAdmin({ analytics_intelligence_preferences: { data: [row, { ...row, owner_id: 'o4', sender: 'other' }, { ...row, owner_id: 'o5', destination: '' }, { ...row, owner_id: 'o6', destination_verified_at: null }, { owner_id: 7 }] } }));
	assert.deepEqual(owners.map((one) => [one.ownerId, one.address, one.sender]), [['o1', 'a@example.test', 'owned']]);
	await assert.rejects(readEmailOwners(readerAdmin({ analytics_intelligence_preferences: { error: { message: 'down' } } })), /email owners unavailable/);
	assert.equal(typeof recapRunDeps(readerAdmin({})).existing, 'function');
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
		photoRows: async () => { otherReads += 1; return []; },
		arrivals: async () => { otherReads += 1; return { arrivals: [], read: true }; }
	});
	assert.deepEqual(await buildSlotDocument(gap, slot3(), at('2026-09-28T13:05:00Z')), { state: 'incomplete' });
	assert.equal(otherReads, 0, 'the other reads are not repeated while records may still arrive');
	const settled = await buildSlotDocument(gap, slot3(), at('2026-09-28T19:30:00Z'));
	assert.equal(settled.state === 'built' && settled.document.evidence, 'partial', 'past the settling period it is built and says what is missing');
});

test('findings that could not be read, and tags that could not be read, make the recap incomplete rather than silent', async () => {
	const noFindings = await buildSlotDocument(reads({ findings: async () => ({ findings: [], read: false }) }), slot3(), at('2026-09-28T13:05:00Z'));
	assert.equal(noFindings.state === 'built' && noFindings.document.complete, false);
	const noTags = await buildSlotDocument(reads({ arrivals: async () => ({ arrivals: null, read: false }) }), slot3(), at('2026-09-28T13:05:00Z'));
	assert.equal(noTags.state === 'built' && noTags.document.missing[0], 'how people arrived, which could not be read');
	const finding: Finding = {
		id: 'f', rule: 'launch_other', target: { kind: 'album', albumKey: 'Re7kho' }, title: 'T', explanation: 'E.', action: 'A.', reportHref: '/albums/Re7kho', status: 'open',
		evidence: { windows: { current: { start: '2026-09-25', end: '2026-09-27' } }, cutoff: null, coverage: 'complete', units: 'photo opens', strength: 'strong' }
	};
	const withFinding = await buildSlotDocument(reads({ findings: async () => ({ findings: [finding], read: true }) }), slot3(), at('2026-09-28T13:05:00Z'));
	assert.match(withFinding.state === 'built' ? withFinding.document.body : '', /- T\. E\. Next step: A\./);
});

test('a reach finding adds only its next step: the comparison is made once, in the recap\'s own text', async () => {
	const base = { id: 'reach', rule: 'launch_reach', target: { kind: 'album' as const, albumKey: 'Re7kho' }, title: '804 photo opens in its first 3 days', explanation: '1 of the 5 launches before it had more photo opens by day 3. Their median was 124, so this launch is above it.', action: 'See which photos people are opening.', reportHref: '/albums/Re7kho', status: 'open' as const };
	const reach: Finding = { ...base, evidence: { windows: { current: { start: '2026-09-25', end: '2026-09-27' } }, cutoff: null, coverage: 'complete', units: 'photo opens', strength: 'strong', comparison: { age: 3, rank: 2, launches: 6, tied: false, median: 124, lowest: 8, highest: 1117, excluded: 0 } } };
	const built = await buildSlotDocument(reads({ findings: async () => ({ findings: [reach], read: true }) }), slot3(), at('2026-09-28T13:05:00Z'));
	const body = built.state === 'built' ? built.document.body : '';
	assert.match(body, /had a median of [\d,]+ photo opens/, 'the comparison is in the text');
	assert.match(body, /What to look at:\n\n- Next step: See which photos people are opening\.\n/);
	assert.doesNotMatch(body, /Their median was|1 of the 5 launches before it/, 'and not again in the finding');
	assert.equal((body.match(/804 photo opens/g) ?? []).length, 1, 'the total is not repeated in the finding');
});

test('a finished finding adds the sentence that the launch is over and its next step, and not the numbers the recap already states', async () => {
	const finished: Finding = {
		id: 'fin', rule: 'launch_finished', target: { kind: 'album', albumKey: 'Re7kho' }, title: 'The launch is over.', explanation: 'Photo opens fell to 1 over Sep 1-3. In its first 7 days it had 1,258 photo opens and 109 download requests. None of the 4 launches before it had more.', action: 'Look at the photos people asked to download.',
		reportHref: '/albums/Re7kho', status: 'open', evidence: { windows: { current: { start: '2026-09-25', end: '2026-10-01' } }, cutoff: null, coverage: 'complete', units: 'photo opens', strength: 'strong' }
	};
	const built = await buildSlotDocument(reads({ findings: async () => ({ findings: [finished], read: true }) }), slot3(), at('2026-09-28T13:05:00Z'));
	const body = built.state === 'built' ? built.document.body : '';
	assert.match(body, /- The launch is over\. Photo opens fell to 1 over Sep 1-3\. Next step: Look at the photos people asked to download\.\n/);
	assert.doesNotMatch(body, /1,258|109 download requests/);
});

test('an unlisted album gets no recap: it is skipped before any launch number is read, and nothing is stored', async () => {
	let modelReads = 0;
	const hidden = reads({ visible: async () => false, model: async () => { modelReads += 1; throw new Error('must not be read'); } });
	assert.deepEqual(await buildSlotDocument(hidden, slot3(), at('2026-09-28T13:05:00Z')), { state: 'skipped' });
	assert.equal(modelReads, 0);
	const { deps: d, calls } = deps({ build: (slot, now) => buildSlotDocument(hidden, slot, now) });
	const result = await runRecapGeneration(d, [JCA], at('2026-09-28T13:05:00Z'));
	assert.deepEqual([result.skipped, result.stored, result.waiting, result.unavailable, result.failed, result.built], [1, 0, 0, 0, 0, 0]);
	assert.equal(calls.stores.length, 0);
	assert.deepEqual(await buildSlotDocument(reads({ visible: async () => { throw new Error('down'); } }), slot3(), at('2026-09-28T13:05:00Z')), { state: 'unread' });
});

test('a backfill says it was written later and is never late', async () => {
	const lapsed = recapSlot(JCA, 3, at('2026-10-08T15:00:00Z'));
	assert.equal(lapsed.phase, 'lapsed');
	const built = await buildSlotDocument(reads(), lapsed, at('2026-10-08T15:00:00Z'), { writtenOn: '2026-10-08' });
	const body = built.state === 'built' ? built.document.body : '';
	const blocks = body.split('\n\n');
	const note = 'This recap was written on Oct 8, after its checkpoint, from the records for those days. It was not written on the morning it was due.';
	// The finding leads; when it was written follows it, just above what the recap cannot tell the reader.
	assert.notEqual(blocks[1], note);
	assert.equal(blocks.indexOf(note), blocks.indexOf('What this cannot tell you:') - 1);
	assert.doesNotMatch(body, /This recap is late/);
});

test('visibility is read from album_settings: unlisted is hidden; public and no row are visible; an error throws', async () => {
	const admin = (answer: { data: unknown; error: unknown }) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => answer }) }) }) }) as never;
	assert.equal(await slotReads(admin({ data: { visibility: 'unlisted' }, error: null })).visible('x'), false);
	assert.equal(await slotReads(admin({ data: { visibility: 'public' }, error: null })).visible('x'), true);
	assert.equal(await slotReads(admin({ data: null, error: null })).visible('x'), true);
	await assert.rejects(slotReads(admin({ data: null, error: { message: 'down' } })).visible('x'), /visibility unavailable/);
});

test('the link in a recap opens the report on the recap, on the report host, and the key holds no date', () => {
	assert.equal(recapLink('Re7kho', 7), 'https://analytics.ninochavez.co/albums/Re7kho?recap=7');
	assert.equal(recapKey('Re7kho', 3), 'launch:Re7kho:day3');
});
