import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadCorrections, recordCorrection, reverseCorrection } from './corrections.server';

type Row = Record<string, unknown>;
interface Script { [table: string]: { data?: Row[]; error?: unknown } | ((filters: Row) => { data?: Row[]; error?: unknown }) }

/** A recording stand-in for the admin client: every read says which table and filters it asked for. */
function fake(script: Script, rpcError: unknown = null) {
	const reads: Array<{ table: string; filters: Row }> = [];
	const rpcs: Array<{ name: string; args: Row }> = [];
	const client = {
		from(table: string) {
			const filters: Row = {};
			const chain: Record<string, unknown> = {};
			for (const method of ['select', 'gte', 'lt', 'order', 'range', 'limit', 'in']) chain[method] = (...args: unknown[]) => { filters[method] = args; return chain; };
			chain.then = (resolve: (value: unknown) => unknown) => {
				reads.push({ table, filters });
				const entry = script[table];
				const result = typeof entry === 'function' ? entry(filters) : entry ?? { data: [] };
				return Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve);
			};
			return chain;
		},
		rpc(name: string, args: Row) { rpcs.push({ name, args }); return Promise.resolve({ data: null, error: rpcError }); }
	};
	return { client: client as unknown as SupabaseClient, reads, rpcs };
}

const names = new Map([['Re7kho', 'JCA at ACC']]);
const event = (id: number) => ({ id, album_key: 'Re7kho', photo_id: null, event_type: 'album_open', source: 'profile', created_at: '2026-10-02T15:00:00Z', traffic_context: 'audience' });

test('retained events and the correction history are read for the days asked, fifty to a page', async () => {
	const { client, reads } = fake({
		engagement_events: (filters) => (filters.in ? { data: [event(900)] } : { data: Array.from({ length: 51 }, (_, i) => event(1000 - i)) }),
		engagement_classification_corrections: { data: [
			{ id: 3, engagement_event_id: 1000, classification: 'test', classification_version: 2, note: 'my phone', corrected_at: '2026-10-03T10:00:00Z' },
			{ id: 2, engagement_event_id: 1000, classification: 'unclassified', classification_version: 1, note: 'first', corrected_at: '2026-10-03T09:00:00Z' },
			{ id: 1, engagement_event_id: 900, classification: 'operator', classification_version: 1, note: 'older event', corrected_at: '2026-10-01T09:00:00Z' }
		] },
		analytics_events_v2: { data: [] },
		analytics_event_v2_classifications: { data: [{ event_id: '0b7c1f34-6a2e-4d5b-8c11-3f9a7d2e6b40', classification: 'self_excluded', classification_version: 1, note: 'me', corrected_at: '2026-10-03T08:00:00Z', reversed: true }] }
	});
	const view = await loadCorrections(client, { start: '2026-09-06', end: '2026-10-05' }, 0, names);
	assert.equal(view.legacy.events.length, 50);
	assert.equal(view.hasMore, true);
	assert.match(view.legacy.events[0].album ?? '', /JCA at ACC/);
	// The newest version of an event is the one that can be reversed; the earlier one is history.
	assert.deepEqual(view.legacy.log.map((row) => [row.eventId, row.version, row.canReverse]), [['1000', 2, true], ['1000', 1, false], ['900', 1, true]]);
	// An event outside this page is still described: it was fetched by id.
	assert.match(view.legacy.log[2].context, /JCA at ACC · album open/);
	assert.ok(reads.some((read) => read.table === 'engagement_events' && read.filters.in));
	// A correction that was already reversed has no button.
	assert.equal(view.v2.log[0].canReverse, false);
	assert.equal(view.v2.log[0].reversed, true);
	assert.equal(view.legacy.eventsAvailable && view.legacy.logAvailable && view.v2.eventsAvailable && view.v2.logAvailable, true);
});

test('the page asked for is the page read', async () => {
	const { client, reads } = fake({});
	await loadCorrections(client, { start: '2026-09-06', end: '2026-10-05' }, 2, names);
	const read = reads.find((item) => item.table === 'engagement_events')!;
	assert.deepEqual(read.filters.range, [100, 150]);
});

test('a read that fails says so and is never an empty list', async () => {
	const { client } = fake({ engagement_events: { error: { message: 'boom' } }, engagement_classification_corrections: { error: { message: 'boom' } } });
	const view = await loadCorrections(client, { start: '2026-09-06', end: '2026-10-05' }, 0, names);
	assert.equal(view.legacy.eventsAvailable, false);
	assert.equal(view.legacy.logAvailable, false);
	assert.equal(view.v2.eventsAvailable, true);
});

test('a correction is written once, as the owner, and a bad one writes nothing', async () => {
	const good = fake({});
	const form = new FormData();
	form.set('eventId', '42'); form.set('classification', 'test'); form.set('note', 'my phone');
	assert.deepEqual(await recordCorrection(good.client, 'owner-1', 'legacy', form), { corrected: true });
	assert.deepEqual(good.rpcs, [{ name: 'analytics_record_classification_correction', args: { p_event_id: 42, p_classification: 'test', p_note: 'my phone', p_corrected_by: 'owner-1', p_reverse: false } }]);

	const bad = fake({});
	const empty = new FormData();
	empty.set('eventId', '42'); empty.set('classification', 'test');
	const refused = await recordCorrection(bad.client, 'owner-1', 'legacy', empty) as { status: number; data: { correctionError: string } };
	assert.equal(refused.status, 400);
	assert.equal(bad.rpcs.length, 0);

	const failing = fake({}, { message: 'down' });
	const failed = await recordCorrection(failing.client, 'owner-1', 'legacy', form) as { status: number; data: { correctionError: string } };
	assert.equal(failed.status, 503);
	assert.match(failed.data.correctionError, /Nothing changed\.$/);
});

test('a version 2 correction and a reversal each go to their own record', async () => {
	const uuid = '0b7c1f34-6a2e-4d5b-8c11-3f9a7d2e6b40';
	const one = fake({});
	const form = new FormData();
	form.set('eventId', uuid); form.set('classification', 'self_excluded'); form.set('note', 'me');
	assert.deepEqual(await recordCorrection(one.client, 'owner-1', 'v2', form), { v2Corrected: true });
	assert.equal(one.rpcs[0].name, 'analytics_record_event_v2_classification');
	assert.equal(one.rpcs[0].args.p_reverse, false);

	const undo = new FormData();
	undo.set('eventId', uuid);
	assert.deepEqual(await reverseCorrection(one.client, 'owner-1', 'v2', undo), { v2CorrectionUndone: true });
	assert.equal(one.rpcs[1].args.p_reverse, true);
	assert.equal(one.rpcs[1].args.p_classification, 'unclassified');

	const legacyUndo = new FormData();
	legacyUndo.set('eventId', '42');
	assert.deepEqual(await reverseCorrection(one.client, 'owner-1', 'legacy', legacyUndo), { correctionUndone: true });
	assert.equal(one.rpcs[2].name, 'analytics_record_classification_correction');
	const refused = await reverseCorrection(one.client, 'owner-1', 'legacy', new FormData()) as { status: number };
	assert.equal(refused.status, 400);
	assert.equal(one.rpcs.length, 3);
});
