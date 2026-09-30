import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFixedIntelligenceJourneys, runIntelligenceJobs } from './intelligence-jobs.server';
import type { IntelligenceReport, IntelligenceScope } from './intelligence-contract';

const scope = { kind: 'sites' as const, period: 7 as const, section: 'all' as const };
const report = (current: IntelligenceScope = scope, snapshotId = 'snapshot-a'): IntelligenceReport => ({ snapshotId, scope: current, generatedAt: '2026-09-30T14:00:00.000Z', cutoff: '2026-09-29T23:59:59.000Z', coverage: 'complete', findings: [], suppressions: [], actions: [], briefs: [], page: 0, pageCount: 1, owner: false });
const refreshJob = (id: string, current: IntelligenceScope = scope) => ({ id, kind: 'refresh', scope: current, ownerId: null, intendedPeriod: null, late: false, requestId: null, operation: null });

test('separate snapshots sharing a timestamp finish and record lifecycle by report id', async () => {
	const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
	const otherScope = { kind: 'sites' as const, period: 30 as const, section: 'all' as const };
	const client = { rpc: async (name: string, args?: Record<string, unknown>) => {
		calls.push({ name, args });
		if (name === 'analytics_claim_intelligence_jobs') return { data: [refreshJob('job-a'), refreshJob('job-b', otherScope)], error: null };
		return { data: null, error: null };
	} } as never;
	const result = await runIntelligenceJobs(client, { refreshIntelligence: async (_client, current) => report(current, current.kind === 'sites' && current.period === 7 ? 'snapshot-a' : 'snapshot-b') }, async () => ({ journeys: {}, providerQueries: 0, providerPending: false }), { now: new Date('2026-09-30T15:00:00.000Z'), concurrency: 1 });
	assert.deepEqual(result, { prepared: 2, claimed: 2, refreshed: 2, retried: 0, providerQueries: 0, deferred: 0 });
	const prepared = calls.find((call) => call.name === 'analytics_prepare_intelligence_periods')?.args;
	assert.equal(prepared?.p_refresh_cadence_seconds, 300);
	assert.equal(prepared?.p_provider_pending_retry_seconds, 300);
	assert.equal(prepared?.p_max_catchup_periods, 4);
	assert.deepEqual(calls.filter((call) => call.name === 'analytics_finish_intelligence_job').map((call) => call.args?.p_report_id), ['snapshot-a', 'snapshot-b']);
	assert.deepEqual(calls.filter((call) => call.name === 'analytics_record_intelligence_lifecycle').map((call) => call.args?.p_report_id), ['snapshot-a', 'snapshot-b']);
});

test('request work stores a calculated result only after the refreshed snapshot exists', async () => {
	const requestScope = { kind: 'sites' as const, period: 30 as const, section: 'writing' as const };
	const updates: Array<Record<string, unknown>> = [];
	const client = {
		rpc: async (name: string) => name === 'analytics_claim_intelligence_jobs'
			? { data: [{ id: 'request-job', kind: 'request', scope: requestScope, ownerId: 'owner-1', intendedPeriod: null, late: false, requestId: 'request-1', operation: 'site_retention' }], error: null }
			: { data: null, error: null },
		from: () => ({ update: (value: Record<string, unknown>) => {
			updates.push(value);
			const chain = { eq: () => chain, select: () => chain, maybeSingle: async () => ({ data: { id: 'request-1' }, error: null }) };
			return chain;
		} })
	} as never;
	await runIntelligenceJobs(client, { refreshIntelligence: async () => report(requestScope, 'request-snapshot') }, async () => ({ journeys: { site: [] }, providerQueries: 1, providerPending: false }), { now: new Date('2026-09-30T15:00:00.000Z') });
	assert.equal(updates.length, 1);
	assert.equal(updates[0].status, 'complete');
	assert.equal((updates[0].answer as { operation: string }).operation, 'site_retention');
});

test('malformed claimed scopes are rejected before any refresh', async () => {
	let refreshed = 0;
	const client = { rpc: async (name: string) => name === 'analytics_claim_intelligence_jobs'
		? { data: [{ ...refreshJob('bad'), scope: { kind: 'sites', period: 7, section: 'all', injected: true } }], error: null }
		: { data: null, error: null } } as never;
	await assert.rejects(runIntelligenceJobs(client, { refreshIntelligence: async () => { refreshed += 1; return report(); } }, async () => ({ journeys: {}, providerQueries: 0, providerPending: false }), { now: new Date('2026-09-30T15:00:00.000Z') }));
	assert.equal(refreshed, 0);
});

test('a provider-pending refresh stores truthful evidence and retries with the report id', async () => {
	const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
	const client = { rpc: async (name: string, args?: Record<string, unknown>) => {
		calls.push({ name, args });
		return name === 'analytics_claim_intelligence_jobs' ? { data: [refreshJob('pending')], error: null } : { data: null, error: null };
	} } as never;
	const result = await runIntelligenceJobs(client, { refreshIntelligence: async () => report(scope, 'pending-snapshot') }, async () => ({ journeys: {}, providerQueries: 1, providerPending: true }), { now: new Date('2026-09-30T15:00:00.000Z') });
	assert.equal(result.retried, 1);
	const finish = calls.find((call) => call.name === 'analytics_finish_intelligence_job');
	assert.deepEqual(finish?.args, { p_job_id: 'pending', p_status: 'retry', p_report_id: 'pending-snapshot', p_error_code: 'provider_query_pending' });
});

test('deadline releases unstarted work for retry instead of starting another slow scope', async () => {
	const originalNow = Date.now;
	const ticks = [0, 0, 2_000];
	Date.now = () => ticks.shift() ?? 2_000;
	try {
		const client = { rpc: async (name: string) => name === 'analytics_claim_intelligence_jobs' ? { data: [refreshJob('first'), refreshJob('second')], error: null } : { data: null, error: null } } as never;
		const result = await runIntelligenceJobs(client, { refreshIntelligence: async () => report() }, async () => ({ journeys: {}, providerQueries: 0, providerPending: false }), { now: new Date('2026-09-30T15:00:00.000Z'), deadlineMs: 1_000, concurrency: 1 });
		assert.equal(result.refreshed, 1);
		assert.equal(result.deferred, 1);
	} finally { Date.now = originalNow; }
});

test('fixed gallery and site loaders preserve their respective provider shapes', async () => {
	const galleryScope = { kind: 'gallery' as const, query: { start: '2026-09-01', end: '2026-09-30', measure: 'photo_opens' as const, scope: 'all' as const, albumKeys: [], compare: 'previous' as const, traffic: 'conservative' as const } };
	const gallery = await loadFixedIntelligenceJourneys(galleryScope, {
		gallery: async (name) => ({ report: name, available: true, asOf: null, coverage: { start: '2026-09-01', end: '2026-09-30', timezone: 'America/Chicago', definitionVersion: 2 as const, cohort: 'synthetic', excluded: 'synthetic', metadata: 'synthetic' }, totals: {}, breakdown: [] }),
		site: async () => ({ available: true, rows: [] })
	});
	const site = await loadFixedIntelligenceJourneys(scope, {
		gallery: async () => { throw new Error('not used'); },
		site: async () => ({ available: true, rows: [] })
	});
	assert.equal(gallery.journeys.gallery?.length, 7);
	assert.equal(gallery.providerQueries, 7);
	assert.deepEqual(site.journeys, { site: [] });
	assert.equal(site.providerQueries, 1);
});
