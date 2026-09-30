import type { SupabaseClient } from '@supabase/supabase-js';
import { answerIntelligenceQuestion } from './intelligence-assistant';
import { intelligenceScopeKey, parseIntelligenceScope, standardIntelligenceScopes, type IntelligenceReport, type IntelligenceScope } from './intelligence-contract';
import type { IntelligenceJourneyContext } from './intelligence-source.server';
import { dueIntelligencePeriods, type ScheduledIntelligencePeriod } from './intelligence-schedule';
import { POSTHOG_JOURNEY_REPORTS, type JourneyAggregate } from './posthog.types';
import type { SiteJourneys } from './site-journeys.server';

export type IntelligenceJob = {
	id: string;
	kind: 'refresh' | 'request' | 'daily' | 'weekly';
	scope: IntelligenceScope;
	ownerId: string | null;
	intendedPeriod: string | null;
	late: boolean;
	requestId: string | null;
	operation: 'album_comparison' | 'site_retention' | null;
};

export interface IntelligenceJobRpcClient {
	rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

export interface IntelligenceEngine {
	refreshIntelligence(client: SupabaseClient, scope: IntelligenceScope, options: { ownerId?: string; now?: Date; journeys?: IntelligenceJourneyContext }): Promise<IntelligenceReport>;
}

export type IntelligenceJourneyLoad = {
	journeys: IntelligenceJourneyContext;
	providerQueries: number;
	providerPending: boolean;
};
export type IntelligenceJourneys = (scope: IntelligenceScope) => Promise<IntelligenceJourneyLoad>;

/** This allowlist is the provider contract, never a client-supplied operation. */
export const FIXED_INTELLIGENCE_JOURNEYS = POSTHOG_JOURNEY_REPORTS;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REFRESH_CADENCE_SECONDS = 15 * 60;
const PROVIDER_PENDING_RETRY_SECONDS = 5 * 60;
const MAX_CATCHUP_PERIODS = 8;

function invalid(name: string): never { throw new Error(`${name} returned an invalid payload`); }
function object(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown): string | null { return typeof value === 'string' && value.length > 0 ? value : null; }
function nullableText(value: unknown): string | null | undefined { return value === null ? null : text(value) ?? undefined; }
function validDate(value: string): boolean { return DATE.test(value) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value; }
function requestOperation(value: unknown): IntelligenceJob['operation'] | undefined {
	if (value === null) return null;
	if (value === 'album_comparison' || value === 'site_retention') return value;
	return undefined;
}

/** Parse the RPC boundary through the engine contract; no partial scope is trusted. */
function parseJob(value: unknown): IntelligenceJob | null {
	const row = object(value);
	if (!row) return null;
	const id = text(row.id);
	const kind = row.kind;
	const scope = parseIntelligenceScope(row.scope);
	const ownerId = nullableText(row.ownerId);
	const intendedPeriod = nullableText(row.intendedPeriod);
	const requestId = nullableText(row.requestId);
	const operation = requestOperation(row.operation);
	if (!id || !scope || !['refresh', 'request', 'daily', 'weekly'].includes(String(kind)) || ownerId === undefined
		|| intendedPeriod === undefined || requestId === undefined || operation === undefined || typeof row.late !== 'boolean'
		|| (intendedPeriod !== null && !validDate(intendedPeriod))) return null;
	if (kind === 'request' ? !ownerId || !requestId || !operation : requestId !== null || operation !== null) return null;
	return { id, kind, scope, ownerId, intendedPeriod, late: row.late, requestId, operation };
}

function reportId(report: IntelligenceReport): string {
	if (typeof report.snapshotId !== 'string' || report.snapshotId.length === 0) throw new Error('intelligence refresh did not return a stored snapshot');
	return report.snapshotId;
}

function requestPrompt(operation: NonNullable<IntelligenceJob['operation']>): string {
	return operation === 'album_comparison' ? 'compare this album' : 'where are readers losing interest';
}

async function completeRequest(client: SupabaseClient, job: IntelligenceJob, report: IntelligenceReport): Promise<void> {
	if (job.kind !== 'request' || !job.ownerId || !job.requestId || !job.operation) return;
	const calculated = answerIntelligenceQuestion(job.scope, requestPrompt(job.operation), report, job.requestId);
	if (calculated.operation !== job.operation || calculated.status === 'pending') throw new Error('request calculation did not complete');
	// Question text is intentionally not retained. The request row already owns its
	// scope and operation; the stored answer is only the calculated evidence result.
	const { question: _question, ...answer } = calculated;
	const { data, error } = await client.from('analytics_intelligence_requests')
		.update({ status: 'complete', answer })
		.eq('id', job.requestId)
		.eq('owner_id', job.ownerId)
		.eq('scope_key', intelligenceScopeKey(job.scope))
		.eq('operation', job.operation)
		.eq('status', 'pending')
		.select('id')
		.maybeSingle();
	if (error || !data || typeof data.id !== 'string') throw new Error('intelligence request result storage unavailable');
}

export function createIntelligenceJobStore(client: IntelligenceJobRpcClient) {
	return {
		async prepare(periods: ScheduledIntelligencePeriod[], now: Date) {
			const result = await client.rpc('analytics_prepare_intelligence_periods', {
				p_daily_period: periods.find((period) => period.kind === 'daily')?.intendedPeriod ?? null,
				p_weekly_period: periods.find((period) => period.kind === 'weekly')?.intendedPeriod ?? null,
				p_standard_scopes: standardIntelligenceScopes(now),
				p_refresh_cadence_seconds: REFRESH_CADENCE_SECONDS,
				p_provider_pending_retry_seconds: PROVIDER_PENDING_RETRY_SECONDS,
				p_max_catchup_periods: MAX_CATCHUP_PERIODS,
				p_now: now.toISOString()
			});
			if (result.error) throw new Error('analytics_prepare_intelligence_periods failed');
		},
		async claim(limit: number, now: Date): Promise<IntelligenceJob[]> {
			const result = await client.rpc('analytics_claim_intelligence_jobs', { p_limit: Math.min(Math.max(limit, 1), 4), p_lease_seconds: 120, p_now: now.toISOString() });
			if (result.error || !Array.isArray(result.data)) throw new Error('analytics_claim_intelligence_jobs failed');
			const jobs = result.data.map(parseJob);
			if (jobs.some((job) => job === null)) invalid('analytics_claim_intelligence_jobs');
			return jobs.filter((job): job is IntelligenceJob => job !== null);
		},
		async finish(job: IntelligenceJob, status: 'complete' | 'retry', report: IntelligenceReport | null, errorCode: string | null) {
			const result = await client.rpc('analytics_finish_intelligence_job', { p_job_id: job.id, p_status: status, p_report_id: report ? reportId(report) : null, p_error_code: errorCode });
			if (result.error) throw new Error('analytics_finish_intelligence_job failed');
		},
		async lifecycle(report: IntelligenceReport, now: Date) {
			const result = await client.rpc('analytics_record_intelligence_lifecycle', { p_report_id: reportId(report), p_now: now.toISOString() });
			if (result.error) throw new Error('analytics_record_intelligence_lifecycle failed');
		}
	};
}

export type IntelligenceJobResult = { prepared: number; claimed: number; refreshed: number; retried: number; providerQueries: number; deferred: number };

/** Bounded scheduler worker; dashboard reads only a persisted report snapshot. */
export async function runIntelligenceJobs(
	client: SupabaseClient & IntelligenceJobRpcClient,
	engine: IntelligenceEngine,
	journeys: IntelligenceJourneys,
	options: { now?: Date; limit?: number; deadlineMs?: number; concurrency?: number } = {}
): Promise<IntelligenceJobResult> {
	const now = options.now ?? new Date();
	const deadline = Date.now() + Math.min(Math.max(options.deadlineMs ?? 25_000, 1_000), 55_000);
	const store = createIntelligenceJobStore(client);
	const periods = dueIntelligencePeriods(now);
	await store.prepare(periods, now);
	const jobs = await store.claim(options.limit ?? 4, now);
	const result: IntelligenceJobResult = { prepared: periods.length, claimed: jobs.length, refreshed: 0, retried: 0, providerQueries: 0, deferred: 0 };
	let next = 0;
	const process = async (job: IntelligenceJob) => {
		try {
			const loaded = await journeys(job.scope);
			result.providerQueries += loaded.providerQueries;
			const report = await engine.refreshIntelligence(client, job.scope, { ownerId: job.ownerId ?? undefined, now, journeys: loaded.journeys });
			await completeRequest(client, job, report);
			await store.lifecycle(report, now);
			await store.finish(job, loaded.providerPending ? 'retry' : 'complete', report, loaded.providerPending ? 'provider_query_pending' : null);
			result.refreshed += 1;
			if (loaded.providerPending) result.retried += 1;
		} catch {
			await store.finish(job, 'retry', null, 'intelligence_refresh_unavailable');
			result.retried += 1;
		}
	};
	const worker = async () => {
		while (next < jobs.length) {
			if (Date.now() >= deadline) { result.deferred += jobs.length - next; return; }
			const job = jobs[next++];
			await process(job);
		}
	};
	await Promise.all(Array.from({ length: Math.min(Math.max(options.concurrency ?? 2, 1), jobs.length) }, worker));
	return result;
}

async function mapWithConcurrency<T, R>(values: readonly T[], limit: number, load: (value: T) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array(values.length);
	let next = 0;
	await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
		while (next < values.length) {
			const index = next++;
			results[index] = await load(values[index]);
		}
	}));
	return results;
}

/** Fixed provider reads preserve the source's native gallery or UTC site window. */
export async function loadFixedIntelligenceJourneys(
	scope: IntelligenceScope,
	loaders: {
		gallery: (name: (typeof FIXED_INTELLIGENCE_JOURNEYS)[number], scope: Extract<IntelligenceScope, { kind: 'gallery' }>) => Promise<JourneyAggregate>;
		site: (scope: Extract<IntelligenceScope, { kind: 'sites' }>) => Promise<SiteJourneys>;
	}
): Promise<IntelligenceJourneyLoad> {
	if (scope.kind === 'gallery') {
		const gallery = await mapWithConcurrency(FIXED_INTELLIGENCE_JOURNEYS, 3, (name) => loaders.gallery(name, scope));
		return { journeys: { gallery }, providerQueries: gallery.length, providerPending: gallery.some((journey) => journey.error === 'provider_query_pending') };
	}
	const site = await loaders.site(scope);
	return {
		journeys: site.available ? { site: site.rows } : {},
		providerQueries: 1,
		providerPending: !site.available && site.reason.includes('still pending')
	};
}

export { standardIntelligenceScopes };
