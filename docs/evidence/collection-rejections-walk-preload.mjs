// Dev-server-only preload for the rejection-reasons walk (2026-10-07), from the acceptance-fix harness plus one planted state.
// Everything runs against production data, read-only:
//   - any Supabase REST write, any non-read RPC, any auth call other than the user check aborts the process;
//   - any non-GET to another host aborts the process unless it is a known read-only query (PostHog query, Cloudflare GraphQL);
//   - every outbound request the server process makes is appended to OUTBOUND_LOG (host, method, path).
// With scenario {owner:true} the auth user check is answered by a harness owner (not a real sign-in).
import { readFileSync, statSync, appendFileSync } from 'node:fs';

const SCENARIO_FILE = process.env.WALK_SCENARIO_FILE;
const OUTBOUND_LOG = process.env.OUTBOUND_LOG;
let cache = { at: 0, mtime: 0, value: {} };
function scenario() {
	const t = performance.now();
	if (t - cache.at < 150) return cache.value;
	try {
		const m = statSync(SCENARIO_FILE).mtimeMs;
		if (m !== cache.mtime) cache = { at: t, mtime: m, value: JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) };
		else cache.at = t;
	} catch { cache.at = t; }
	return cache.value;
}

const realFetch = globalThis.fetch.bind(globalThis);
const json = (body, init = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
const READ_RPC = /analytics_read_|analytics_count_|analytics_posthog_delivery_health|analytics_site_actions|analytics_category_facets/;
const READ_POST_HOSTS = [
	{ host: /posthog\.com$/, path: /\/api\/(projects|environments)\/[^/]+\/query\/?$/ },
	{ host: /^api\.cloudflare\.com$/, path: /\/client\/v4\/graphql$/ }
];
const die = (code, why) => { console.error(`[walk] BLOCKED ${why}`); try { appendFileSync(OUTBOUND_LOG, `BLOCKED ${why}\n`); } catch {} process.exit(code); };

globalThis.fetch = async (input, init) => {
	const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
	const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
	const isSupabase = url.hostname.endsWith('.supabase.co');
	try { if (OUTBOUND_LOG) appendFileSync(OUTBOUND_LOG, `${method} ${url.hostname}${isSupabase ? url.pathname.replace(/\/[0-9a-f-]{20,}.*/, '') : ''}\n`); } catch {}
	const s = scenario();
	if (isSupabase && url.pathname === '/auth/v1/user' && method === 'GET' && s.owner) {
		return json({ id: '00000000-0000-4000-8000-000000000042', aud: 'authenticated', role: 'authenticated', email: 'walk-owner@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
	}
	if (isSupabase && url.pathname.startsWith('/auth/') && !(url.pathname === '/auth/v1/user' && method === 'GET')) die(96, `AUTH ${method} ${url.pathname}`);
	if (isSupabase && url.pathname.startsWith('/rest/v1/rpc/')) {
		if (!READ_RPC.test(url.pathname)) die(98, `RPC ${url.pathname}`);
	} else if (isSupabase && url.pathname.startsWith('/rest/v1/') && !['GET', 'HEAD'].includes(method)) {
		die(97, `WRITE ${method} ${url.pathname}`);
	} else if (isSupabase && !['GET', 'HEAD'].includes(method) && !url.pathname.startsWith('/rest/v1/rpc/')) {
		die(95, `SUPABASE ${method} ${url.pathname}`);
	} else if (!isSupabase && !['GET', 'HEAD'].includes(method)) {
		const ok = READ_POST_HOSTS.some((r) => r.host.test(url.hostname) && r.path.test(url.pathname) && method === 'POST');
		if (!ok) die(99, `OTHER ${method} ${url.hostname}${url.pathname}`);
	}
	// Planted state for this walk only: the health read carries the day list the 20261007180000 migration adds,
	// built from the real counter totals. Production has no such list until the migration is applied.
	if (isSupabase && url.pathname === '/rest/v1/rpc/analytics_posthog_delivery_health' && s.rejectedDays) {
		const response = await realFetch(input, init);
		const body = await response.json();
		return json({ ...body, collection_rejected_days: s.rejectedDays });
	}
	return realFetch(input, init);
};
