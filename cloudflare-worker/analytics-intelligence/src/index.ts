interface Env { ANALYTICS_INTELLIGENCE_ENABLED?: string; ANALYTICS_POSTHOG_SCHEDULE_TOKEN?: string; }
const ENDPOINT = 'https://ninochavez.co/photography/api/analytics/intelligence/jobs';

/** The database owns 08:00 Chicago and period deduplication; UTC cron only wakes bounded work. */
export async function runIntelligenceWorker(env: Env, fetcher: typeof fetch = fetch): Promise<{ state: 'disabled' | 'ran' }> {
	if (env.ANALYTICS_INTELLIGENCE_ENABLED !== 'true') return { state: 'disabled' };
	const token = env.ANALYTICS_POSTHOG_SCHEDULE_TOKEN;
	if (!token || token.length < 32) throw new Error('analytics_intelligence_secret_missing');
	const response = await fetcher(ENDPOINT, {
		method: 'POST', redirect: 'error', headers: { 'x-analytics-posthog-schedule-token': token }, signal: AbortSignal.timeout(90_000)
	});
	if (!response.ok) throw new Error(`analytics_intelligence_http_${response.status}`);
	const result = await response.json() as { ok?: boolean };
	if (result.ok !== true) throw new Error('analytics_intelligence_unavailable');
	return { state: 'ran' };
}

export default {
	async scheduled(_event: unknown, env: Env) { console.log(JSON.stringify(await runIntelligenceWorker(env))); },
	async fetch() { return new Response('Not found', { status: 404 }); }
};
