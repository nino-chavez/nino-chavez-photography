import assert from 'node:assert/strict';
import test from 'node:test';
import { runIntelligenceJobs } from './intelligence-jobs.server';

const scope = { kind: 'sites' as const, period: 7 as const, section: 'all' as const };
test('jobs claim once, keep an incomplete result explicit, and record lifecycle separately', async () => {
	const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
	const client = { rpc: async (name: string, args?: Record<string, unknown>) => {
		calls.push({ name, args });
		if (name === 'analytics_claim_intelligence_jobs') return { data: [{ id: 'job-1', kind: 'refresh', scope, ownerId: null, intendedPeriod: null }], error: null };
		return { data: null, error: null };
	} } as never;
	const report = { scope, generatedAt: '2026-09-30T14:00:00.000Z', cutoff: '2026-09-29T23:59:59.000Z', coverage: 'partial', findings: [], suppressions: [], actions: [], briefs: [], page: 0, pageCount: 1, owner: false } as never;
	const result = await runIntelligenceJobs(client, { refreshIntelligence: async () => report }, async () => [], { now: new Date('2026-09-30T15:00:00.000Z') });
	assert.deepEqual(result, { prepared: 1, claimed: 1, refreshed: 1, retried: 0, providerQueries: 0 });
	assert.deepEqual(calls.map((call) => call.name), ['analytics_prepare_intelligence_periods', 'analytics_claim_intelligence_jobs', 'analytics_record_intelligence_lifecycle', 'analytics_finish_intelligence_job']);
});

test('a failed refresh records a retry, rather than claiming an empty report', async () => {
	const calls: string[] = [];
	const client = { rpc: async (name: string) => {
		calls.push(name);
		if (name === 'analytics_claim_intelligence_jobs') return { data: [{ id: 'job-2', kind: 'request', scope, ownerId: 'owner', intendedPeriod: null }], error: null };
		return { data: null, error: null };
	} } as never;
	const result = await runIntelligenceJobs(client, { refreshIntelligence: async () => { throw new Error('synthetic provider outage'); } }, async () => [], { now: new Date('2026-09-30T15:00:00.000Z') });
	assert.equal(result.retried, 1);
	assert.equal(calls.at(-1), 'analytics_finish_intelligence_job');
});

test('a repeated scheduler claim cannot rerun an acknowledged or recovered incident', async () => {
	let claims = 0; let refreshes = 0; const lifecycle: unknown[] = [];
	const client = { rpc: async (name: string) => {
		if (name === 'analytics_claim_intelligence_jobs') return { data: claims++ === 0 ? [{ id: 'job-3', kind: 'daily', scope, ownerId: 'owner', intendedPeriod: '2026-09-30' }] : [], error: null };
		if (name === 'analytics_record_intelligence_lifecycle') lifecycle.push('recorded');
		return { data: null, error: null };
	} } as never;
	const report = { scope, generatedAt: '2026-09-30T14:00:00.000Z', cutoff: '2026-09-29T23:59:59.000Z', coverage: 'complete', findings: [{ status: 'acknowledged' }, { status: 'recovered' }], suppressions: [], actions: [], briefs: [], page: 0, pageCount: 1, owner: true } as never;
	const engine = { refreshIntelligence: async () => { refreshes += 1; return report; } };
	await runIntelligenceJobs(client, engine, async () => [], { now: new Date('2026-09-30T15:00:00.000Z') });
	await runIntelligenceJobs(client, engine, async () => [], { now: new Date('2026-09-30T15:05:00.000Z') });
	assert.equal(refreshes, 1); assert.deepEqual(lifecycle, ['recorded']);
});
