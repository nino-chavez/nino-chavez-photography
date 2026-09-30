import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { hasPostHogScheduleAuthorization } from '$lib/analytics/posthog-delivery.server';
import { createPostHogQueryTransport, queryGalleryJourneys } from '$lib/analytics/posthog-queries.server';
import { loadFixedIntelligenceJourneys, runIntelligenceJobs } from '$lib/analytics/intelligence-jobs.server';
import { deliverIntelligenceBriefs } from '$lib/analytics/intelligence-delivery.server';
import { refreshIntelligence } from '$lib/analytics/intelligence-store.server';
import type { RequestHandler } from './$types';

/** Scheduler-only endpoint. It reveals no job, provider, or recipient identifiers. */
export const POST: RequestHandler = async ({ request, setHeaders }) => {
	setHeaders({ 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' });
	if (!hasPostHogScheduleAuthorization(request, env.ANALYTICS_POSTHOG_SCHEDULE_TOKEN)) {
		return json({ ok: false, error: 'schedule_authorization_required' }, { status: 403 });
	}
	try {
		const client = createSupabaseAdminClient();
		const transport = createPostHogQueryTransport(env);
		const jobs = await runIntelligenceJobs(client, { refreshIntelligence }, async (scope) => loadFixedIntelligenceJourneys(scope, (report, current) => {
			if (current.kind !== 'gallery') throw new Error('unsupported provider scope');
			const query = current.query;
			return queryGalleryJourneys(transport, {
				report, start: query.start, end: query.end, albumKeys: query.albumKeys,
				source: query.source ?? null, sport: query.sport ?? null, category: query.category ?? null
			}, { publicOnly: true, allowedAlbumKeys: query.albumKeys });
		}));
		// No provider is injected here. Dashboard delivery remains functional; external delivery is inert.
		const delivery = await deliverIntelligenceBriefs(client, null);
		return json({ ok: true, jobs, delivery });
	} catch {
		return json({ ok: false, error: 'intelligence_jobs_unavailable' }, { status: 503 });
	}
};
