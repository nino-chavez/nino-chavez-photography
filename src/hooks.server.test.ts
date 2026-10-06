import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handle } from './hooks.server';
import { isAnalyticsWorkspace } from './lib/analytics/report-paths';

async function request(url: string, method = 'GET') {
	const event = { url: new URL(url), request: new Request(url, { method }) };
	return handle({ event: event as Parameters<typeof handle>[0]['event'], resolve: async () => new Response('resolved') });
}

test('clean report URLs use dashboard chrome even without the internal route ID', () => {
	for (const pathname of ['/sites', '/gallery']) {
		assert.equal(isAnalyticsWorkspace(null, 'analytics.ninochavez.co', pathname), true);
		assert.equal(isAnalyticsWorkspace('/photography/analytics/operator', 'analytics.ninochavez.co', pathname), true);
		assert.equal(isAnalyticsWorkspace(null, 'ninochavez.co', pathname), false);
	}
	assert.equal(isAnalyticsWorkspace('/analytics/operator', 'localhost', '/photography/analytics/operator'), true);
	assert.equal(isAnalyticsWorkspace('/albums/[slug]', 'ninochavez.co', '/photography/albums/example'), false);
});

test('old analytics links and CSV exports move to the analytics hostname', async () => {
	for (const path of ['/photography/analytics', '/photography/analytics/operator', '/photography/analytics/operator/export.csv']) {
		const response = await request(`https://ninochavez.co${path}?period=30`);
		assert.equal(response.status, 308);
		assert.equal(response.headers.get('location'), `https://analytics.ninochavez.co${path.endsWith('/export.csv') ? '/gallery/export.csv' : '/gallery'}?period=30`);
	}
});

test('analytics writes cannot run on the gallery hostname', async () => {
	const response = await request('https://ninochavez.co/photography/analytics/operator?/saveReport', 'POST');
	assert.equal(response.status, 404);
});

test('gallery collection and local analytics preview remain available', async () => {
	assert.equal((await request('https://ninochavez.co/photography/api/analytics/engagement')).status, 200);
	assert.equal((await request('http://127.0.0.1:5189/photography/analytics/operator')).status, 200);
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
	assert.equal((await request('https://analytics.ninochavez.co/gallery')).status, 200);
	assert.equal((await request('https://ninochavez.co/photography/analytics')).headers.get('location'), 'https://analytics.ninochavez.co/gallery');
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
