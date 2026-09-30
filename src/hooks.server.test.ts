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
 assert.equal((await request('https://analytics.ninochavez.co/')).headers.get('location'),'/sites');
 });
