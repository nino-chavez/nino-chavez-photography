import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { runIntelligenceWorker } from './index';

test('disabled worker has no side effects and public HTTP cannot invoke it', async () => {
	assert.deepEqual(await runIntelligenceWorker({}, () => { throw new Error('unexpected request'); }), { state: 'disabled' });
	assert.equal((await worker.fetch()).status, 404);
});

test('worker fails closed and uses the existing narrow scheduler credential', async () => {
	await assert.rejects(runIntelligenceWorker({ ANALYTICS_INTELLIGENCE_ENABLED: 'true' }), /secret_missing/);
	let request: RequestInit | undefined;
	const result = await runIntelligenceWorker({ ANALYTICS_INTELLIGENCE_ENABLED: 'true', ANALYTICS_POSTHOG_SCHEDULE_TOKEN: 'x'.repeat(32) }, async (url, init) => {
		assert.equal(url, 'https://analytics.ninochavez.co/photography/api/analytics/intelligence/jobs'); request = init; return Response.json({ ok: true });
	});
	assert.equal(result.state, 'ran'); assert.equal(request?.redirect, 'manual');
	assert.equal((request?.headers as Record<string, string>)['x-analytics-posthog-schedule-token'].length, 32);
});


test('manual redirects fail without forwarding the scheduler credential', async () => {
 let calls = 0;
 await assert.rejects(runIntelligenceWorker({ANALYTICS_INTELLIGENCE_ENABLED:'true',ANALYTICS_POSTHOG_SCHEDULE_TOKEN:'x'.repeat(32)}, async (_url, init) => {
  calls++; assert.equal(init?.redirect, 'manual');
  return new Response(null, {status:302,headers:{location:'https://untrusted.example/'}});
 }), /http_302/);
 assert.equal(calls,1);
});
