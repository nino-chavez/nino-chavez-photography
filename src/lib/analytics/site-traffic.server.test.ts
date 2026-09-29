import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSiteTraffic, periodBounds, summarizeSiteTraffic } from './site-traffic.server';
import { sectionForPath } from './site-traffic';

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
