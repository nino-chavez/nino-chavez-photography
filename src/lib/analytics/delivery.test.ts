import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverWithSingleRetry } from './delivery';

test('a recovered delivery reuses the exact event payload and a duplicate is not a failed write', async () => {
	const payloads: string[] = [];
	const result = await deliverWithSingleRetry('{"event_id":"stable"}', async (payload) => {
		payloads.push(payload);
		return payloads.length === 1 ? { status: 503 } : { status: 200, duplicate: true };
	});
	assert.equal(result, 'duplicate');
	assert.deepEqual(payloads, ['{"event_id":"stable"}', '{"event_id":"stable"}']);
});
