import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handle } from './hooks.server';
import { isAnalyticsWorkspace } from './lib/analytics/report-paths';

async function request(url: string, method = 'GET') {
	const event = { url: new URL(url), request: new Request(url, { method }) };
	return handle({ event: event as Parameters<typeof handle>[0]['event'], resolve: async () => new Response('resolved') });
}

test('clean report URLs use dashboard chrome even without the internal route ID', () => {
	for (const pathname of ['/sites', '/photos']) {
		assert.equal(isAnalyticsWorkspace(null, 'analytics.ninochavez.co', pathname), true);
		assert.equal(isAnalyticsWorkspace('/photography/analytics/photos', 'analytics.ninochavez.co', pathname), true);
		assert.equal(isAnalyticsWorkspace(null, 'ninochavez.co', pathname), false);
	}
	assert.equal(isAnalyticsWorkspace('/analytics/photos', 'localhost', '/photography/analytics/photos'), true);
	// The old gallery report is gone: its clean address is no longer a workspace page, so nothing renders it.
	assert.equal(isAnalyticsWorkspace(null, 'analytics.ninochavez.co', '/gallery'), false);
	assert.equal(isAnalyticsWorkspace('/albums/[slug]', 'ninochavez.co', '/photography/albums/example'), false);
});

test('the old gallery report addresses move to their new homes on the analytics hostname in one hop', async () => {
	for (const [path, location] of [
		['/photography/analytics', 'https://analytics.ninochavez.co/'],
		['/photography/analytics/operator', 'https://analytics.ninochavez.co/'],
		['/photography/analytics/operator/export.csv', 'https://analytics.ninochavez.co/photos/export.csv?period=30']
	] as const) {
		const response = await request(`https://ninochavez.co${path}?period=30`);
		assert.equal(response.status, 308);
		assert.equal(response.headers.get('location'), location);
		// The same address asked of the report host itself is also one hop, not a hop to /gallery and a second.
		assert.equal((await request(`https://analytics.ninochavez.co${path}?period=30`)).headers.get('location'), location);
	}
	assert.equal((await request('https://analytics.ninochavez.co/gallery?section=photos&period=7&photo_rank=rising')).headers.get('location'), 'https://analytics.ninochavez.co/photos?period=7&photo_rank=rising');
	assert.equal((await request('https://analytics.ninochavez.co/gallery/export.csv?scope=album&albums=Re7kho&measure=downloads')).headers.get('location'), 'https://analytics.ninochavez.co/photos/export.csv?measure=downloads&scope=album&albums=Re7kho');
	assert.equal((await request('https://analytics.ninochavez.co/gallery?section=measurement&period=7')).headers.get('location'), 'https://analytics.ninochavez.co/data?period=7');
	// HEAD is a read too.
	assert.equal((await request('https://analytics.ninochavez.co/gallery', 'HEAD')).status, 308);
});

test('on a local server an old address goes to the internal route of its new home', async () => {
	assert.equal((await request('http://127.0.0.1:5189/photography/analytics/operator?section=photos&period=7')).headers.get('location'), 'http://127.0.0.1:5189/photography/analytics/photos?period=7');
	assert.equal((await request('http://127.0.0.1:5189/photography/analytics/operator')).headers.get('location'), 'http://127.0.0.1:5189/photography/analytics/home');
	assert.equal((await request('http://127.0.0.1:5189/photography/analytics/operator?section=albums&scope=album&albums=Re7kho')).headers.get('location'), 'http://127.0.0.1:5189/photography/analytics/albums/Re7kho');
});

test('an old address is never redirected on a gallery path that is not the report', async () => {
	// The public gallery has its own /gallery-like paths; only the report host owns /gallery.
	assert.equal((await request('https://ninochavez.co/gallery')).status, 200);
	assert.equal((await request('https://ninochavez.co/photography/gallery')).status, 200);
});

test('analytics writes cannot run on the gallery hostname', async () => {
	for (const path of ['/photography/analytics/operator?/saveReport', '/photography/analytics/photos?/saveView']) {
		assert.equal((await request(`https://ninochavez.co${path}`, 'POST')).status, 404, path);
	}
	// And a post to an old address is not replayed on its new home: it is not redirected at all.
	const posted = await request('https://analytics.ninochavez.co/gallery?/saveReport', 'POST');
	assert.equal(posted.headers.get('location'), null);
});

test('gallery collection and local analytics preview remain available', async () => {
	assert.equal((await request('https://ninochavez.co/photography/api/analytics/engagement')).status, 200);
	assert.equal((await request('http://127.0.0.1:5189/photography/analytics/photos')).status, 200);
});

 test('clean reports keep their public URL and old subdomain links redirect once', async () => {
 assert.equal((await request('https://analytics.ninochavez.co/sites?period=7')).status,200);
 assert.equal((await request('https://analytics.ninochavez.co/photography/analytics/sites?period=7')).headers.get('location'),'https://analytics.ninochavez.co/sites?period=7');
 // Home: the root of the report host is a page now, not a redirect to /sites.
	{
		const home = await request('https://analytics.ninochavez.co/?x=1');
		assert.equal(home.status, 200);
		assert.equal(home.headers.get('location'), null);
	}
	// Its internal address, on any host, goes to the clean root and keeps the query.
	assert.equal((await request('https://analytics.ninochavez.co/photography/analytics/home?x=1')).headers.get('location'), 'https://analytics.ninochavez.co/?x=1');
	assert.equal((await request('https://ninochavez.co/photography/analytics/home')).headers.get('location'), 'https://analytics.ninochavez.co/');
	assert.equal((await request('http://127.0.0.1:5189/photography/analytics/home')).status, 200);
	assert.equal((await request('https://ninochavez.co/photography/analytics/home?/anything', 'POST')).status, 404);
	// The older addresses still work.
	assert.equal((await request('https://analytics.ninochavez.co/photos')).status, 200);
	assert.equal((await request('https://ninochavez.co/photography/analytics')).headers.get('location'), 'https://analytics.ninochavez.co/');
 });

test('an album launch report keeps its clean address and the internal one redirects to it', async () => {
	assert.equal((await request('https://analytics.ninochavez.co/albums/Re7kho')).status, 200);
	assert.equal((await request('https://analytics.ninochavez.co/photography/analytics/albums/Re7kho?x=1')).headers.get('location'), 'https://analytics.ninochavez.co/albums/Re7kho?x=1');
	assert.equal((await request('https://ninochavez.co/photography/analytics/albums/Re7kho')).headers.get('location'), 'https://analytics.ninochavez.co/albums/Re7kho');
	assert.equal((await request('http://127.0.0.1:5189/photography/analytics/albums/Re7kho')).status, 200);
	assert.equal((await request('https://ninochavez.co/photography/analytics/albums/Re7kho?/addAnnotation', 'POST')).status, 404);
});

test('the album index keeps its clean address, its CSV, and the internal addresses redirect to them', async () => {
	assert.equal((await request('https://analytics.ninochavez.co/albums?compare=Re7kho')).status, 200);
	assert.equal((await request('https://analytics.ninochavez.co/albums/export.csv')).status, 200);
	assert.equal((await request('https://analytics.ninochavez.co/photography/analytics/albums?compare=Re7kho')).headers.get('location'), 'https://analytics.ninochavez.co/albums?compare=Re7kho');
	assert.equal((await request('https://ninochavez.co/photography/analytics/albums')).headers.get('location'), 'https://analytics.ninochavez.co/albums');
	assert.equal((await request('https://ninochavez.co/photography/analytics/albums/export.csv')).headers.get('location'), 'https://analytics.ninochavez.co/albums/export.csv');
	assert.equal((await request('http://127.0.0.1:5189/photography/analytics/albums')).status, 200);
	assert.equal((await request('https://ninochavez.co/photography/analytics/albums', 'POST')).status, 404);
});

test('an album address with anything but one key is never redirected into a report', async () => {
	for (const path of ['/photography/analytics/albums/..', '/photography/analytics/albums/a%2Fb', '/photography/analytics/albums/Re7kho/extra']) {
		const response = await request(`https://ninochavez.co${path}`);
		// It may be sent on to the report host unchanged, but never rewritten to a clean /albums/<key> address.
		assert.ok(!(response.headers.get('location') ?? '').startsWith('https://analytics.ninochavez.co/albums/'), path);
	}
});

test('the data quality page and settings keep their clean addresses and the internal ones redirect to them', async () => {
	for (const clean of ['/data', '/settings']) {
		assert.equal((await request(`https://analytics.ninochavez.co${clean}?period=7`)).status, 200);
		assert.equal((await request(`https://analytics.ninochavez.co/photography/analytics${clean}?period=7`)).headers.get('location'), `https://analytics.ninochavez.co${clean}?period=7`);
		assert.equal((await request(`https://ninochavez.co/photography/analytics${clean}`)).headers.get('location'), `https://analytics.ninochavez.co${clean}`);
		assert.equal((await request(`http://127.0.0.1:5189/photography/analytics${clean}`)).status, 200);
		// Writes (saved views, corrections) are only accepted on the report host.
		assert.equal((await request(`https://ninochavez.co/photography/analytics${clean}?/anything`, 'POST')).status, 404);
	}
});

test('a root address with the old site report query goes to /sites once; a bare root and other hosts are left alone', async () => {
	const where = async (url: string, method = 'GET') => (await request(url, method)).headers.get('location');
	assert.equal(await where('https://analytics.ninochavez.co/?period=30'), 'https://analytics.ninochavez.co/sites?period=30');
	assert.equal(await where('https://analytics.ninochavez.co/?period=7&section=writing&evil=1'), 'https://analytics.ninochavez.co/sites?period=7&section=writing');
	assert.equal((await request('https://analytics.ninochavez.co/?period=30', 'HEAD')).status, 308);
	assert.equal(await where('https://analytics.ninochavez.co/'), null);
	assert.equal(await where('https://analytics.ninochavez.co/?x=1'), null);
	// A post is never redirected, and the apex site's own root is not a report address.
	assert.equal(await where('https://analytics.ninochavez.co/?period=30', 'POST'), null);
	assert.equal(await where('https://ninochavez.co/?period=30'), null);
	assert.equal(await where('http://127.0.0.1:5189/?period=30'), null);
});
