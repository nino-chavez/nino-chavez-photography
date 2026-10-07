import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { createOwnedIntelligenceDeliveryProvider, deliverIntelligenceBriefs } from '$lib/analytics/intelligence-delivery.server';
import { launchIntelligenceScopes, loadFixedIntelligenceJourneys, runIntelligenceJobs } from '$lib/analytics/intelligence-jobs.server';
import { fetchLaunches, type LaunchList } from '$lib/analytics/launch-read-model.server';
import { recapRunDeps, runRecapGeneration, type RecapRunResult } from '$lib/analytics/launch-recap.server';
import { createPostHogQueryTransport, queryGalleryJourneys, queryGalleryDecisionEvidence } from '$lib/analytics/posthog-queries.server';
import { hasPostHogScheduleAuthorization } from '$lib/analytics/posthog-delivery.server';
import { createProviderCache } from '$lib/analytics/provider-cache.server';
import { loadSiteJourneys } from '$lib/analytics/site-journeys.server';
import { refreshIntelligence } from '$lib/analytics/intelligence-store.server';
import type { IntelligenceScope } from '$lib/analytics/intelligence-contract';
import type { RequestHandler } from './$types';

const providerCache = createProviderCache({ ttlMs: 12 * 60_000, maxEntries: 96, maxInFlight: 10, maxBytes: 2 * 1024 * 1024 });
const MAX_PUBLIC_ALBUM_KEYS = 500;

/** Current public catalogue includes albums with no recorded opens. Never infer visibility from activity. */
async function publicGalleryAlbumKeys(client: ReturnType<typeof createSupabaseAdminClient>): Promise<string[]> {
 const [albums, settings] = await Promise.all([
  client.from('albums').select('album_key').order('album_key').limit(MAX_PUBLIC_ALBUM_KEYS + 1),
  client.from('album_settings').select('album_key, visibility').order('album_key').limit(MAX_PUBLIC_ALBUM_KEYS + 1)
 ]);
 if (albums.error || settings.error) throw new Error('public catalogue unavailable');
 if ((albums.data?.length ?? 0) > MAX_PUBLIC_ALBUM_KEYS || (settings.data?.length ?? 0) > MAX_PUBLIC_ALBUM_KEYS) throw new Error('public catalogue exceeds the bounded limit');
 const hidden = new Set((settings.data ?? []).filter(row => row.visibility === 'unlisted').map(row => row.album_key));
 return (albums.data ?? []).map(row => row.album_key).filter(key => !hidden.has(key));
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
  const cleanup = await client.rpc('analytics_cleanup_intelligence_private', {p_now:new Date().toISOString()}); if(cleanup.error) throw new Error('private retention cleanup unavailable');
		const now = new Date();
		const transport = createPostHogQueryTransport(env, { totalDeadlineMs: 7_000 });
		// One read of the public launches per wake-up: the launch scopes to refresh and the recaps that are due both use it.
		let launchRead: Promise<LaunchList> | undefined;
		const launches = () => (launchRead ??= fetchLaunches(client, { asOf: now, days: 14, traffic: 'conservative', publicOnly: true }));
		let catalogue: Promise<string[]> | undefined;
		const keysFor = async (scope: Extract<IntelligenceScope, { kind: 'gallery' }>) => {
			const keys = await (catalogue ??= publicGalleryAlbumKeys(client));
			if (scope.query.albumKeys.some(key => !keys.includes(key))) throw new Error('requested album is not public');
			return keys;
		};
		// Launch recaps replaced the daily and weekly briefs. A recap that is due is built here, one per wake-up, and that
		// wake-up skips the refresh jobs: a request that built a recap measured 16 outbound requests in all, and the refresh
		// jobs can spend more than the Free plan's 50 on their own (see the README's subrequest arithmetic). The jobs run again the
		// next minute, so a refresh is late by one minute on the few mornings a recap is due. A wake-up that finds nothing
		// to build, or only has to wait for records, costs a few reads and runs the jobs as always. A failure here is
		// counted and never stops the delivery below; the recap is tried again until its checkpoint lapses.
		let recaps: RecapRunResult | { error: 'launches_unavailable' };
		try {
			const list = await launches().catch(() => null);
			recaps = list ? await runRecapGeneration(recapRunDeps(client), list.launches, now) : { error: 'launches_unavailable' };
		} catch { recaps = { error: 'launches_unavailable' }; }
		const recapWakeUp = 'built' in recaps && recaps.built > 0;
		const jobs = recapWakeUp ? { skipped: 'recap_wake_up' as const } : await runIntelligenceJobs(client, { refreshIntelligence }, async (scope) => !transport ? { journeys: {}, providerQueries: 0, providerPending: false } : loadFixedIntelligenceJourneys(scope, {
			gallery: async (report, current) => {
				const albumKeys = await keysFor(current);
				const query = current.query;
				return queryGalleryJourneys(transport, {
					report, start: query.start, end: query.end, ...(query.scope === 'all' ? {} : { albumKeys: query.albumKeys }),
					source: query.source ?? null, sport: query.sport ?? null, category: query.category ?? null
				}, { publicOnly: true, allowedAlbumKeys: albumKeys, cache: providerCache });
			},
			decision: async (current) => {
				const allowed = await keysFor(current); const query = current.query;
				return queryGalleryDecisionEvidence(transport, { start: query.start, end: query.end, ...(query.scope === 'all' ? {} : { albumKeys: query.albumKeys }), source: query.source ?? null, sport: query.sport ?? null, category: query.category ?? null }, allowed, { cache: providerCache });
			},
			site: (current) => {
				const window = utcCompletedWindow(current.period, now);
				return loadSiteJourneys(transport, window.start, window.end, current.section, { cache: providerCache });
			}
		}), {
			now, deadlineMs: 25_000, concurrency: 2,
			// Public launches only, the same list Home reads. One bounded read per wake-up.
			launchScopes: async () => launchIntelligenceScopes(await launches(), now)
		});
		const provider = createOwnedIntelligenceDeliveryProvider({
			enabled: env.ANALYTICS_INTELLIGENCE_DELIVERY_ENABLED === 'true',
			from: env.ANALYTICS_INTELLIGENCE_EMAIL_FROM,
			token: env.ANALYTICS_INTELLIGENCE_DELIVERY_TOKEN
		});
		const delivery = await deliverIntelligenceBriefs(client, provider);
		return json({ ok: true, jobs, recaps, delivery });
	} catch (failure) {
  if(dev) console.error('[intelligence local jobs]',failure instanceof Error ? failure.message : 'unavailable');
		return json({ ok: false, error: 'intelligence_jobs_unavailable' }, { status: 503 });
	}
};
