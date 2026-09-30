import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadLatestIntelligenceOutcomes } from './intelligence-private-controls.server';

const ownerId = '11111111-1111-4111-8111-111111111111';
const actionA = '22222222-2222-4222-8222-222222222222';
const actionB = '33333333-3333-4333-8333-333333333333';

function clientFor(rows: unknown[], calls: Array<{ method: string; args: unknown[] }>) {
 return { rpc: async (...args: unknown[]) => { calls.push({ method:'rpc', args }); return {data:rows,error:null}; } } as never;
}

test('latest outcome loader is owner-scoped, bounded, and preserves a zero count', async () => {
	const calls: Array<{ method: string; args: unknown[] }> = [];
	const outcomes = await loadLatestIntelligenceOutcomes(clientFor([
		{ id: '44444444-4444-4444-8444-444444444444', action_id: actionA, outcome: 'booking', outcome_count: 0, note: null, created_at: '2026-09-30T10:00:00.000Z' },
		{ id: '55555555-5555-4555-8555-555555555555', action_id: actionA, outcome: 'inquiry', outcome_count: 3, note: 'older', created_at: '2026-09-29T10:00:00.000Z' },
		{ id: '66666666-6666-4666-8666-666666666666', action_id: actionB, outcome: 'other', outcome_count: null, note: 'Observed later', created_at: '2026-09-30T09:00:00.000Z' }
	], calls), ownerId, [actionA, actionB]);
	assert.equal(outcomes.get(actionA)?.outcome, 'booking');
	assert.equal(outcomes.get(actionA)?.outcomeCount, 0);
	assert.equal(outcomes.get(actionB)?.note, 'Observed later');
	assert.deepEqual(calls[0], { method:'rpc', args:['analytics_latest_intelligence_outcomes',{p_owner_id:ownerId,p_action_ids:[actionA,actionB]}] });
});

test('latest outcome loader rejects cross-owner or over-limit input before querying', async () => {
	const calls: Array<{ method: string; args: unknown[] }> = [];
	const tooMany = Array.from({ length: 21 }, () => actionA);
	const outcomes = await loadLatestIntelligenceOutcomes(clientFor([], calls), 'not-an-owner', tooMany);
	assert.equal(outcomes.size, 0);
	assert.equal(calls.length, 0);
});

test('private-control migration keeps writes service-only and every private deletion owner-scoped', () => {
	const migration = readFileSync('supabase/migrations/20260930062000_analytics_intelligence_private_controls.sql', 'utf8');
	assert.match(migration, /REVOKE ALL ON public\.analytics_intelligence_outcomes FROM PUBLIC, anon, authenticated;/);
	assert.match(migration, /CREATE POLICY analytics_intelligence_outcomes_owner_read[\s\S]*USING \(owner_id = auth\.uid\(\)\)/);
	assert.match(migration, /WHERE a\.id = p_action_id AND a\.owner_id = p_owner_id AND a\.kind = 'record'/);
	assert.match(migration, /DELETE FROM public\.analytics_intelligence_outcomes WHERE owner_id = p_owner_id;/);
	assert.match(migration, /DELETE FROM public\.analytics_intelligence_finding_lifecycle WHERE owner_id = p_owner_id;/);
	assert.match(migration, /DELETE FROM public\.analytics_intelligence_briefs WHERE owner_id = p_owner_id;/);
	assert.match(migration, /DELETE FROM public\.analytics_intelligence_jobs WHERE owner_id = p_owner_id;/);
	assert.match(migration, /DELETE FROM public\.analytics_intelligence_requests WHERE owner_id = p_owner_id;/);
	assert.doesNotMatch(migration, /DELETE FROM public\.analytics_intelligence_snapshots/);
	assert.doesNotMatch(migration, /DELETE FROM public\.analytics_(?:events|site_action_daily|audience)/);
});
