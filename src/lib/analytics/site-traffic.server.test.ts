import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSiteTraffic, periodBounds, summarizeSiteTraffic } from './site-traffic.server';
import { sectionForPath } from './site-traffic';
import { createProviderCache } from './provider-cache.server';

function row(date: string, requestPath: string, count: number, visits: number, refererHost = '') {
	return { count, dimensions: { date, requestPath, refererHost, deviceType: 'desktop' }, sum: { visits } };
}

test('route sections keep writing, demos, and gallery separate', () => {
	assert.equal(sectionForPath('/'), 'profile');
	assert.equal(sectionForPath('/work/blueprint'), 'profile');
	assert.equal(sectionForPath('/blog/post'), 'writing');
	assert.equal(sectionForPath('/demos/example'), 'demos');
	assert.equal(sectionForPath('/photography/albums/example'), 'photography');
	assert.equal(sectionForPath('/unknown'), 'other');
});

test('UTC reporting excludes the partial current day', () => {
	assert.deepEqual(periodBounds(7, new Date('2026-09-29T20:00:00Z')), {
		start: '2026-09-22', end: '2026-09-28', previousStart: '2026-09-15', previousEnd: '2026-09-21'
	});
});

test('summaries count measured page loads and entry visits without inventing people', () => {
	const result = summarizeSiteTraffic([
		row('2026-09-27', '/', 5, 2, 'example.com'),
		row('2026-09-27', '/blog/post', 3, 1, 'example.com'),
		row('2026-09-28', '/demos/item', 4, 1),
		row('2026-09-28', '/photography/albums/a', 6, 2),
		row('2026-09-28', '/photography/analytics/operator', 10, 5),
		row('2026-09-28', '/share/private-token', 10, 5),
		row('2026-09-28', '/photography/share/private-token', 10, 5),
		row('2026-09-28', '/%20photography/bad-path', 10, 5),
		row('2026-09-28', '/privacy', 2, 1),
		row('2026-09-28', '/unknown/capability', 10, 5)
	], 7, '2026-09-22', '2026-09-28', [row('2026-09-20', '/', 3, 1)], '2026-09-29T20:00:00Z');
	assert.equal(result.pageviews, 20);
	assert.equal(result.entryVisits, 7);
	assert.equal(result.previousPageviews, 3);
	assert.equal(result.daily.length, 7);
	assert.equal(result.daily.at(-1)?.pageviews, 12);
	assert.deepEqual(result.sections.map(({ key, pageviews }) => [key, pageviews]), [
		['profile', 5], ['writing', 3], ['demos', 4], ['photography', 6], ['other', 2]
	]);
	assert.equal(result.topPages.some(({ path }) => path.includes('analytics/operator')), false);
	assert.equal(result.topPages.some(({ path }) => path.includes('private-token') || path.includes('%20')), false);
	assert.equal(result.sections.find(({ key }) => key === 'writing')?.daily.at(-1)?.pageviews, 0);
	assert.deepEqual(result.sections.find(({ key }) => key === 'writing')?.referrers.map(({ host }) => host), ['example.com']);
});

test('missing credentials and incomplete provider responses never display zero traffic', async () => {
	const missing = await loadSiteTraffic(7, undefined, undefined);
	assert.equal(missing.available, false);
	const invalid = await loadSiteTraffic(7, 'a'.repeat(32), 'test-token', async () => new Response(JSON.stringify({ data: { viewer: { accounts: [{ rumPageloadEventsAdaptiveGroups: [{ count: 1 }] }] } } }), { status: 200 }));
	assert.equal(invalid.available, false);
});

test('reach cache deduplicates exact provider scopes, expires, and retries errors', async () => {
	let now = Date.parse('2026-09-29T20:00:00Z');
	let calls = 0;
	const cache = createProviderCache({ ttlMs: 100, maxEntries: 8, maxInFlight: 4, maxBytes: 50_000, now: () => now });
	const validPayload = { data: { viewer: { accounts: [{ rumPageloadEventsAdaptiveGroups: [] }] } } };
	const fetcher = async () => { calls += 1; await Promise.resolve(); return new Response(JSON.stringify(validPayload), { status: 200 }); };
	const options = { cache, now: () => now };
	await Promise.all([
		loadSiteTraffic(7, 'a'.repeat(32), 'token-a', fetcher, options),
		loadSiteTraffic(7, 'a'.repeat(32), 'token-a', fetcher, options)
	]);
	assert.equal(calls, 2);
	await loadSiteTraffic(7, 'b'.repeat(32), 'token-a', fetcher, options);
	await loadSiteTraffic(7, 'a'.repeat(32), 'token-b', fetcher, options);
	await loadSiteTraffic(30, 'a'.repeat(32), 'token-a', fetcher, options);
	assert.equal(calls, 8);
	now += 101;
	await loadSiteTraffic(7, 'a'.repeat(32), 'token-a', fetcher, options);
	assert.equal(calls, 10);

	let retryCalls = 0;
	const retryCache = createProviderCache({ ttlMs: 100, maxEntries: 2, maxInFlight: 2, maxBytes: 10_000 });
	const retryFetcher = async () => {
		retryCalls += 1;
		return new Response(JSON.stringify(retryCalls <= 2 ? { data: { viewer: { accounts: [{ rumPageloadEventsAdaptiveGroups: [{ count: 1 }] }] } } } : validPayload), { status: 200 });
	};
	assert.equal((await loadSiteTraffic(7, 'a'.repeat(32), 'retry-token', retryFetcher, { cache: retryCache, now: () => now })).available, false);
	assert.equal((await loadSiteTraffic(7, 'a'.repeat(32), 'retry-token', retryFetcher, { cache: retryCache, now: () => now })).available, true);
	assert.equal(retryCalls, 4);
});

test('Cloudflare reads receive an abort signal and report timeout as unavailable', async () => {
	let abortedRequests = 0;
	const controller = new AbortController();
	controller.abort();
	const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
		if (init?.signal?.aborted) abortedRequests += 1;
		throw new DOMException('aborted', 'AbortError');
	};
	const result = await loadSiteTraffic(7, 'a'.repeat(32), 'test-token', fetcher, {
		cache: null,
		signalFactory: () => controller.signal
	});
	assert.equal(result.available, false);
	assert.equal(abortedRequests, 2);
});
