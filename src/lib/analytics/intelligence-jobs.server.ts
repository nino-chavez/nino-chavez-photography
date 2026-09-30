import type { SupabaseClient } from '@supabase/supabase-js';
import type { JourneyAggregate } from './posthog.types';
import { dueIntelligencePeriods, standardIntelligenceScopes, type ScheduledIntelligencePeriod } from './intelligence-schedule';
import type { IntelligenceReport, IntelligenceScope } from './intelligence-contract';

export type IntelligenceJob = {
	id: string;
	kind: 'refresh' | 'request' | 'daily' | 'weekly';
	scope: IntelligenceScope;
	ownerId: string | null;
	intendedPeriod: string | null;
};

export interface IntelligenceJobRpcClient {
	rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

export interface IntelligenceEngine {
	refreshIntelligence(client: SupabaseClient, scope: IntelligenceScope, options: { ownerId?: string; now?: Date; journeys?: JourneyAggregate[] }): Promise<IntelligenceReport>;
}

export type IntelligenceJourneys = (scope: IntelligenceScope) => Promise<JourneyAggregate[]>;
/** This schedule is intentionally closed: it is not a client-supplied PostHog operation. */
export const FIXED_INTELLIGENCE_JOURNEYS = ['discovery', 'album_use', 'search_usefulness', 'download_reliability', 'photo_response', 'sources_return', 'experiments'] as const;

function invalid(name: string): never { throw new Error(`${name} returned an invalid payload`); }
function isScope(value: unknown): value is IntelligenceScope {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const scope = value as { kind?: unknown; period?: unknown; section?: unknown; query?: unknown };
	return scope.kind === 'gallery' ? !!scope.query && typeof scope.query === 'object' : scope.kind === 'sites' && [7, 30, 90].includes(Number(scope.period)) && typeof scope.section === 'string';
}
function isJob(value: unknown): value is IntelligenceJob {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const row = value as Partial<IntelligenceJob>;
	return typeof row.id === 'string' && ['refresh', 'request', 'daily', 'weekly'].includes(String(row.kind)) && isScope(row.scope)
		&& (row.ownerId === null || typeof row.ownerId === 'string') && (row.intendedPeriod === null || typeof row.intendedPeriod === 'string');
}

export function createIntelligenceJobStore(client: IntelligenceJobRpcClient) {
	return {
		async prepare(periods: ScheduledIntelligencePeriod[], now: Date) {
			const result = await client.rpc('analytics_prepare_intelligence_periods', {
				p_daily_period: periods.find((period) => period.kind === 'daily')?.intendedPeriod ?? null,
				p_weekly_period: periods.find((period) => period.kind === 'weekly')?.intendedPeriod ?? null,
				p_standard_scopes: standardIntelligenceScopes(now),
				p_now: now.toISOString()
			});
			if (result.error) throw new Error('analytics_prepare_intelligence_periods failed');
		},
		async claim(limit: number, now: Date): Promise<IntelligenceJob[]> {
			const result = await client.rpc('analytics_claim_intelligence_jobs', { p_limit: Math.min(Math.max(limit, 1), 20), p_lease_seconds: 180, p_now: now.toISOString() });
			if (result.error) throw new Error('analytics_claim_intelligence_jobs failed');
			if (!Array.isArray(result.data) || !result.data.every(isJob)) invalid('analytics_claim_intelligence_jobs');
			return result.data;
		},
		async finish(job: IntelligenceJob, status: 'complete' | 'retry', report: IntelligenceReport | null, errorCode: string | null) {
			const result = await client.rpc('analytics_finish_intelligence_job', { p_job_id: job.id, p_status: status, p_report_generated_at: report?.generatedAt ?? null, p_error_code: errorCode });
			if (result.error) throw new Error('analytics_finish_intelligence_job failed');
		},
		async lifecycle(report: IntelligenceReport, now: Date) {
			const result = await client.rpc('analytics_record_intelligence_lifecycle', { p_report_generated_at: report.generatedAt, p_now: now.toISOString() });
			if (result.error) throw new Error('analytics_record_intelligence_lifecycle failed');
		}
	};
}

export type IntelligenceJobResult = { prepared: number; claimed: number; refreshed: number; retried: number; providerQueries: number };

/** Bounded scheduler worker; dashboard reads only the report that this stores. */
export async function runIntelligenceJobs(
	client: SupabaseClient & IntelligenceJobRpcClient,
	engine: IntelligenceEngine,
	journeys: IntelligenceJourneys,
	options: { now?: Date; limit?: number } = {}
): Promise<IntelligenceJobResult> {
	const now = options.now ?? new Date();
	const store = createIntelligenceJobStore(client);
	const periods = dueIntelligencePeriods(now);
	// The same bounded call also queues due standard scopes and owner requests.
	// Empty report periods before 08:00 must not starve those background jobs.
	await store.prepare(periods, now);
	const jobs = await store.claim(options.limit ?? 12, now);
	let refreshed = 0; let retried = 0; let providerQueries = 0;
	for (const job of jobs) {
		try {
			const approvedJourneys = await journeys(job.scope);
			providerQueries += approvedJourneys.length;
			const report = await engine.refreshIntelligence(client, job.scope, { ownerId: job.ownerId ?? undefined, now, journeys: approvedJourneys });
			await store.lifecycle(report, now);
			await store.finish(job, 'complete', report, null);
			refreshed += 1;
		} catch {
			await store.finish(job, 'retry', null, 'intelligence_refresh_unavailable');
			retried += 1;
		}
	}
	return { prepared: periods.length, claimed: jobs.length, refreshed, retried, providerQueries };
}

/** Fixed reports only; free-text never reaches a provider query builder. */
export async function loadFixedIntelligenceJourneys(
	scope: IntelligenceScope,
	load: (name: (typeof FIXED_INTELLIGENCE_JOURNEYS)[number], scope: IntelligenceScope) => Promise<JourneyAggregate>
): Promise<JourneyAggregate[]> {
	if (scope.kind !== 'gallery') return [];
	return Promise.all(FIXED_INTELLIGENCE_JOURNEYS.map((name) => load(name, scope)));
}

export { standardIntelligenceScopes };
