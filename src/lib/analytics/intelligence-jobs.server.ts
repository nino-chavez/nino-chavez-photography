import { calculateAlbumComparison } from './intelligence-comparison.server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { answerIntelligenceQuestion, unsupportedProviderScope } from './intelligence-assistant';
import { GALLERY_LAUNCH_SCOPE, INTELLIGENCE_REFRESH_CADENCE_SECONDS, intelligenceScopeKey, launchScope, parseIntelligenceScope, standardIntelligenceScopes, type IntelligenceReport, type IntelligenceScope } from './intelligence-contract';
import { LAUNCH_FINDING_DAYS } from './launch-rules';
import type { LaunchList } from './launch-read-model.server';
import type { IntelligenceJourneyContext } from './intelligence-source.server';
import { POSTHOG_JOURNEY_REPORTS, type JourneyAggregate } from './posthog.types';
import type { GalleryDecisionEvidence } from './posthog-queries.server';
import type { SiteJourneys } from './site-journeys.server';

export type IntelligenceJob = {
	id: string;
	kind: 'refresh' | 'request';
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
// A one-minute wake-up drains bounded work; saved standard reports refresh at
// most every fifteen minutes. SQL prioritizes interactive and due-period work.
const REFRESH_CADENCE_SECONDS = INTELLIGENCE_REFRESH_CADENCE_SECONDS;
const PROVIDER_PENDING_RETRY_SECONDS = 5 * 60;
const MAX_CATCHUP_PERIODS = 4;

function invalid(name: string): never { throw new Error(`${name} returned an invalid payload`); }
function object(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown): string | null { return typeof value === 'string' && value.length > 0 ? value : null; }
function nullableText(value: unknown): string | null | undefined { return value === null ? null : text(value) ?? undefined; }
function validDate(value: string): boolean { const date = new Date(`${value}T12:00:00Z`); return DATE.test(value) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; }
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
	if (kind !== 'refresh' && kind !== 'request') return null;
	const scope = parseIntelligenceScope(row.scope);
	const ownerId = nullableText(row.ownerId);
	const intendedPeriod = nullableText(row.intendedPeriod);
	const requestId = nullableText(row.requestId);
	const operation = requestOperation(row.operation);
	if (!id || !scope || ownerId === undefined
		|| intendedPeriod === undefined || requestId === undefined || operation === undefined || typeof row.late !== 'boolean'
		|| (intendedPeriod !== null && !validDate(intendedPeriod))) return null;
	if (kind === 'request' ? !ownerId || !requestId || !operation : requestId !== null || operation !== null) return null;
	return { id, kind: kind as IntelligenceJob['kind'], scope, ownerId, intendedPeriod, late: row.late, requestId, operation };
}

function retiredBriefJob(value: unknown): boolean {
	const row = object(value);
	return !!row && typeof row.id === 'string' && (row.kind === 'daily' || row.kind === 'weekly');
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
	if (job.operation === 'album_comparison') {
		answer.comparison = await calculateAlbumComparison(client, job.scope);
		answer.status = answer.comparison.available ? 'complete' : 'unavailable';
		answer.summary = answer.comparison.available ? 'Compare the selected album and its public peers below. The calendar and publication-age windows stay separate.' : answer.comparison.reason ?? 'Comparable album evidence is unavailable.';
	}
	const { data, error } = await client.from('analytics_intelligence_requests')
		.update({ status: 'complete', report_id: reportId(report), answer })
		.eq('id', job.requestId)
		.eq('owner_id', job.ownerId)
		.eq('scope_key', intelligenceScopeKey(job.scope))
		.eq('operation', job.operation)
		.eq('status', 'leased')
		.select('id')
		.maybeSingle();
	if (error || !data || typeof data.id !== 'string') throw new Error('intelligence request result storage unavailable');
}

export function createIntelligenceJobStore(client: IntelligenceJobRpcClient) {
	return {
		async prepare(now: Date, launchScopes: readonly IntelligenceScope[] = []) {
			// Launch recaps replaced the daily and weekly briefs. A null period tells the function to queue no
			// scheduled brief, so this call only keeps the standard and launch scopes fresh.
			const result = await client.rpc('analytics_prepare_intelligence_periods', {
				p_daily_period: null,
				p_weekly_period: null,
				p_standard_scopes: [...standardIntelligenceScopes(now), ...launchScopes],
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
			// A daily or weekly job left from before recaps is not run. It is handed back with a backoff, so it
			// stops holding a claim slot, and the attempt cap in the database ends it.
			for (const row of result.data.filter(retiredBriefJob)) await client.rpc('analytics_finish_intelligence_job', { p_job_id: (row as { id: string }).id, p_status: 'retry', p_report_id: null, p_error_code: 'brief_kind_retired' });
			const jobs = result.data.filter((row) => !retiredBriefJob(row)).map(parseJob);
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

export type IntelligenceJobResult = { claimed: number; refreshed: number; retried: number; providerQueries: number; deferred: number };

/** Bounded scheduler worker; dashboard reads only a persisted report snapshot. */
export async function runIntelligenceJobs(
	client: SupabaseClient & IntelligenceJobRpcClient,
	engine: IntelligenceEngine,
	journeys: IntelligenceJourneys,
	options: { now?: Date; limit?: number; deadlineMs?: number; concurrency?: number; launchScopes?: () => Promise<IntelligenceScope[]> } = {}
): Promise<IntelligenceJobResult> {
	const now = options.now ?? new Date();
	const deadline = Date.now() + Math.min(Math.max(options.deadlineMs ?? 25_000, 1_000), 55_000);
	const store = createIntelligenceJobStore(client);
	// Launch scopes come from a database read. If it fails, the standard scopes and Home's scope still refresh.
	let launchScopes: IntelligenceScope[] = [];
	try { launchScopes = options.launchScopes ? await options.launchScopes() : []; } catch { launchScopes = [GALLERY_LAUNCH_SCOPE]; }
	await store.prepare(now, launchScopes);
	const jobs = await store.claim(options.limit ?? 4, now);
	const result: IntelligenceJobResult = { claimed: jobs.length, refreshed: 0, retried: 0, providerQueries: 0, deferred: 0 };
	let next = 0;
	const process = async (job: IntelligenceJob) => {
		try {
			const loaded = await journeys(job.scope);
			result.providerQueries += loaded.providerQueries;
			const report = await engine.refreshIntelligence(client, job.scope, { ownerId: job.ownerId ?? undefined, now, journeys: loaded.journeys });
			if (!loaded.providerPending) await completeRequest(client, job, report);
			// Launch findings are not incidents. The incident table holds operational problems that Home lists as
			// open, and a launch's reach or recap would never recover from it. Collection incidents keep their own path.
			if (job.scope.kind !== 'launch') await store.lifecycle(report, now);
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
			if (Date.now() >= deadline) {
				const remaining = jobs.slice(next); next = jobs.length;
				result.deferred += remaining.length;
				for (const deferred of remaining) await store.finish(deferred, 'retry', null, 'worker_deadline');
				return;
			}
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
		decision?: (scope: Extract<IntelligenceScope, { kind: 'gallery' }>) => Promise<GalleryDecisionEvidence>;
	}
): Promise<IntelligenceJourneyLoad> {
	// Launch rules read only first-party records; they make no provider query.
	if (scope.kind === 'launch') return { journeys: {}, providerQueries: 0, providerPending: false };
	if (scope.kind === 'gallery') {
		if (unsupportedProviderScope(scope)) return { journeys: {}, providerQueries: 0, providerPending: false };
		const [gallery, decision] = await Promise.all([mapWithConcurrency(FIXED_INTELLIGENCE_JOURNEYS, 3, (name) => loaders.gallery(name, scope)), loaders.decision?.(scope)]);
		return { journeys: { gallery, ...(decision ? { decision } : {}) }, providerQueries: gallery.length + (decision ? 1 : 0), providerPending: gallery.some((journey) => journey.error === 'provider_query_pending') };
	}
	const site = await loaders.site(scope);
	return {
		journeys: site.available ? { site: site.rows } : {},
		providerQueries: 1,
		providerPending: !site.available && site.reason.includes('still pending')
	};
}

/**
 * The launch scopes to keep fresh: Home's gallery-wide scope, and one per album whose launch is inside its finding
 * window. Two extra days past the window let the last refresh write the empty snapshot that retires its findings,
 * so an old launch never keeps a stale finding. Older launches are not refreshed: their findings have ended.
 */
export const LAUNCH_REFRESH_DAYS = LAUNCH_FINDING_DAYS + 2;
export function launchIntelligenceScopes(list: Pick<LaunchList, 'launches'> | null, asOf: Date): IntelligenceScope[] {
	const albums = (list?.launches ?? [])
		.filter((launch) => Date.parse(launch.firstPublishedAt) <= asOf.getTime() && launch.elapsedDays <= LAUNCH_REFRESH_DAYS)
		.map((launch) => launchScope(launch.albumKey));
	return [GALLERY_LAUNCH_SCOPE, ...albums];
}

export { standardIntelligenceScopes };
