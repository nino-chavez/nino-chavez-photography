/**
 * Counts the outbound requests (Cloudflare "subrequests") that one wake-up of the intelligence jobs endpoint makes, by
 * running its read paths against production through a counting fetch. READ-ONLY: it calls only the evidence loaders, the
 * snapshot read and the recap reads; it never calls a refresh, a store or a delivery function. The writes those would make
 * are not run and are added by hand from the code (stated in the output), so a number here is reads measured plus writes counted.
 *
 *   node --env-file=<path to .env.local> --import tsx scripts/measure-intelligence-subrequests.ts [--json <file>]
 *
 * Why it exists: a Pages Function on the Workers Free plan may make 50 subrequests per request, on Paid 10,000
 * (https://developers.cloudflare.com/workers/platform/limits/, "Subrequests", fetched 2026-10-07). Every Supabase call and every
 * PostHog query is one. Recaps run inside the same request as the refresh jobs.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { GALLERY_LAUNCH_SCOPE, launchScope, standardIntelligenceScopes, type IntelligenceScope } from '../src/lib/analytics/intelligence-contract';
import { loadIntelligenceEvidence } from '../src/lib/analytics/intelligence-source.server';
import { fetchLaunches } from '../src/lib/analytics/launch-read-model.server';
import { buildSlotDocument, slotReads } from '../src/lib/analytics/launch-recap.server';
import { recapSlot } from '../src/lib/analytics/launch-recap-schedule';
import { POSTHOG_JOURNEY_REPORTS } from '../src/lib/analytics/posthog.types';

const url = process.env.VITE_SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (for example with node --env-file).');
const jsonAt = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;

let counter = new Map<string, number>();
const counted: typeof fetch = async (input, init) => {
	const target = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
	const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
	if (!['GET', 'HEAD'].includes(method) && !target.pathname.startsWith('/rest/v1/rpc/')) throw new Error(`measure script refuses a write: ${method} ${target.pathname}`);
	if (target.pathname.startsWith('/rest/v1/rpc/') && !/analytics_read_|analytics_count_|analytics_posthog_delivery_health|analytics_site_actions|analytics_category_facets/.test(target.pathname)) throw new Error(`measure script refuses a non-read RPC: ${target.pathname}`);
	const label = `${method} ${target.pathname.replace('/rest/v1/', '')}`;
	counter.set(label, (counter.get(label) ?? 0) + 1);
	return fetch(input, init);
};
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: counted } });
const total = () => [...counter.values()].reduce((a, b) => a + b, 0);
async function measure<T>(label: string, run: () => Promise<T>): Promise<{ label: string; supabase: number; detail: Record<string, number> }> {
	counter = new Map();
	try { await run(); } catch (cause) { console.error(`  (${label}: ${cause instanceof Error ? cause.message : cause})`); }
	return { label, supabase: total(), detail: Object.fromEntries(counter) };
}

const now = new Date();
const standard = standardIntelligenceScopes(now);
const gallery30 = standard.find((scope) => scope.kind === 'gallery') as IntelligenceScope;
const sites = standard.find((scope) => scope.kind === 'sites') as IntelligenceScope;
const list = await fetchLaunches(client, { asOf: now, days: 14, traffic: 'conservative', publicOnly: true });
const newest = [...list.launches].sort((x, y) => Date.parse(y.firstPublishedAt) - Date.parse(x.firstPublishedAt))[0];

/** A refresh job: its evidence reads are measured; the snapshot reads and the writes are counted by hand (store.server imports the app's server environment, which a script cannot load). */
async function job(scope: IntelligenceScope) {
	return measure(JSON.stringify(scope).slice(0, 60), async () => {
		await loadIntelligenceEvidence(client as never, scope, now, {});
	});
}
const results = {
	gallery: await job(gallery30), sites: await job(sites), launchHome: await job(GALLERY_LAUNCH_SCOPE), launchAlbum: await job(launchScope(newest.albumKey))
};
// Provider queries (PostHog, one request per query at least): gallery runs the fixed journeys plus the decision query, sites one.
const provider = { gallery: POSTHOG_JOURNEY_REPORTS.length + 1, sites: 1, launch: 0 };
// Hand-counted writes of one refresh job: snapshot insert (changed) or none, pointer upsert, lifecycle RPC (not launch scopes), finish RPC.
// Reads of refreshIntelligence outside the evidence loaders: currentSnapshotIfUnchanged (1), then loadIntelligence's snapshot read (1) and
// its public-target checks (at most 3: albums, album settings, photos). Writes: snapshot insert (when changed), pointer upsert,
// lifecycle RPC (not for launch scopes) and the finish RPC.
const snapshotReads = 1 + 1 + 3;
const writes = { galleryOrSites: snapshotReads + 1 + 1 + 1 + 1, launch: snapshotReads + 1 + 1 + 1 };
const fixed = { cleanupRpc: 1, launchList: 1, prepareRpc: 1, claimRpc: 1, deliveryAmbiguousList: 1, deliveryClaim: 1 };
const fixedTotal = Object.values(fixed).reduce((a, b) => a + b, 0);

// A recap built at 08:00: the scheduler's own reads for the newest launch's day 3 slot, read as of its due instant.
const slot = recapSlot(newest, 3, new Date(Date.parse(recapSlot(newest, 3, now).dueAt) + 60_000));
const recap = await measure('recap build', async () => { await buildSlotDocument(slotReads(client), slot, new Date(Date.parse(slot.dueAt) + 60_000)); });
const recapFixed = { cleanupRpc: 1, launchList: 1, existingCheck: 1, recapInsert: 1, emailOwnersRead: 1, deliveryAmbiguousList: 1, deliveryClaim: 1 };
const recapFixedTotal = Object.values(recapFixed).reduce((a, b) => a + b, 0);
const perEmailOwner = 2;

const jobCost = {
	gallery: results.gallery.supabase + provider.gallery + writes.galleryOrSites,
	sites: results.sites.supabase + provider.sites + writes.galleryOrSites,
	launchHome: results.launchHome.supabase + provider.launch + writes.launch,
	launchAlbum: results.launchAlbum.supabase + provider.launch + writes.launch
};
const dearestFour = [jobCost.gallery, jobCost.gallery, jobCost.sites, jobCost.sites];
const report = {
	measuredAt: now.toISOString(),
	limit: { free: 50, paid: 10000, source: 'https://developers.cloudflare.com/workers/platform/limits/' },
	perJob: { ...jobCost, detail: Object.fromEntries(Object.entries(results).map(([name, result]) => [name, { supabaseReads: result.supabase, detail: result.detail }])) },
	fixedPerRequest: { ...fixed, total: fixedTotal },
	jobsWakeUp: { claimedAtMost: 4, worstFour: `2 gallery + 2 site = ${dearestFour.join(' + ')}`, worstTotal: fixedTotal + dearestFour.reduce((a, b) => a + b, 0), typicalOneJob: fixedTotal + jobCost.launchAlbum },
	recapWakeUp: { build: recap.supabase, detail: recap.detail, fixed: { ...recapFixed, total: recapFixedTotal }, perEmailOwner, total: recapFixedTotal + recap.supabase, totalWithOneEmailOwner: recapFixedTotal + recap.supabase + perEmailOwner }
};
console.log(JSON.stringify(report, null, 2));
if (jsonAt) { mkdirSync(dirname(jsonAt), { recursive: true }); writeFileSync(jsonAt, JSON.stringify(report, null, 2)); }
