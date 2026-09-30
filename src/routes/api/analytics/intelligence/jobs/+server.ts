import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { createOwnedIntelligenceDeliveryProvider, deliverIntelligenceBriefs } from '$lib/analytics/intelligence-delivery.server';
import { loadFixedIntelligenceJourneys, runIntelligenceJobs } from '$lib/analytics/intelligence-jobs.server';
import { createPostHogQueryTransport, queryGalleryJourneys } from '$lib/analytics/posthog-queries.server';
import { hasPostHogScheduleAuthorization } from '$lib/analytics/posthog-delivery.server';
import { createProviderCache } from '$lib/analytics/provider-cache.server';
import { fetchScheduledGalleryReport } from '$lib/analytics/scheduled-gallery-report.server';
import { loadSiteJourneys } from '$lib/analytics/site-journeys.server';
import { refreshIntelligence } from '$lib/analytics/intelligence-store.server';
import type { IntelligenceScope } from '$lib/analytics/intelligence-contract';
import type { RequestHandler } from './$types';

const providerCache = createProviderCache({ ttlMs: 12 * 60_000, maxEntries: 96, maxInFlight: 10, maxBytes: 2 * 1024 * 1024 });
const MAX_PUBLIC_ALBUM_KEYS = 500;

/** Uses the current public scheduled-report projection, so unlisted albums never reach PostHog. */
async function publicGalleryAlbumKeys(client: ReturnType<typeof createSupabaseAdminClient>, scope: Extract<IntelligenceScope, { kind: 'gallery' }>): Promise<string[]> {
	const report = await fetchScheduledGalleryReport(client, scope.query, {
		publicOnly: true,
		includeToday: false,
		photoWindow: { page: 0, pageSize: 0, rank: 'popular' }
	});
	const keys = [...new Set(report.albums.map((album) => album.albumKey))].sort();
	if (keys.length > MAX_PUBLIC_ALBUM_KEYS) throw new Error('public gallery provider scope exceeds its bounded album limit');
	if (scope.query.scope !== 'all' && scope.query.albumKeys.some((key) => !keys.includes(key))) throw new Error('requested gallery scope is not currently public');
	return keys;
}

function utcCompletedWindow(period: 7 | 30 | 90, now: Date): { start: string; end: string } {
	const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	end.setUTCDate(end.getUTCDate() - 1);
	const start = new Date(end);
	start.setUTCDate(start.getUTCDate() - period + 1);
	return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/** Scheduler-only endpoint. It reveals no job, provider, recipient, or report identifiers. */
export const POST: RequestHandler = async ({ request, setHeaders }) => {
	setHeaders({ 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' });
	if (!hasPostHogScheduleAuthorization(request, env.ANALYTICS_POSTHOG_SCHEDULE_TOKEN)) {
		return json({ ok: false, error: 'schedule_authorization_required' }, { status: 403 });
	}
	try {
		const client = createSupabaseAdminClient();
		const now = new Date();
		const transport = createPostHogQueryTransport(env, { totalDeadlineMs: 7_000 });
		const jobs = await runIntelligenceJobs(client, { refreshIntelligence }, async (scope) => loadFixedIntelligenceJourneys(scope, {
			gallery: async (report, current) => {
				const albumKeys = await publicGalleryAlbumKeys(client, current);
				const query = current.query;
				return queryGalleryJourneys(transport, {
					report, start: query.start, end: query.end, albumKeys,
					source: query.source ?? null, sport: query.sport ?? null, category: query.category ?? null
				}, { publicOnly: true, allowedAlbumKeys: albumKeys, cache: providerCache });
			},
			site: (current) => {
				const window = utcCompletedWindow(current.period, now);
				return loadSiteJourneys(transport, window.start, window.end, current.section, { cache: providerCache });
			}
		}), { now, deadlineMs: 25_000, concurrency: 2 });
		const provider = createOwnedIntelligenceDeliveryProvider({
			enabled: env.ANALYTICS_INTELLIGENCE_DELIVERY_ENABLED === 'true',
			endpoint: env.ANALYTICS_INTELLIGENCE_DELIVERY_ENDPOINT,
			token: env.ANALYTICS_INTELLIGENCE_DELIVERY_TOKEN
		});
		const delivery = await deliverIntelligenceBriefs(client, provider);
		return json({ ok: true, jobs, delivery });
	} catch {
		return json({ ok: false, error: 'intelligence_jobs_unavailable' }, { status: 503 });
	}
};
