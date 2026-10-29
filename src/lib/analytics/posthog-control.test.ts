import assert from 'node:assert/strict';
import test from 'node:test';
import { POSTHOG_CLASSIFICATION_CONTROL_EVENT, preparePostHogDelivery } from './posthog-contract';
import { requeueMissingPostHogEvents } from './posthog-outbox.server';

test('classification controls use one system identity and carry no visitor identity or private evidence', () => {
	const control = preparePostHogDelivery({
		event_id: '20000000-0000-4000-8000-000000000001', event_name: POSTHOG_CLASSIFICATION_CONTROL_EVENT,
		occurred_at: '2026-09-29T12:00:00.000Z', target_event_id: '20000000-0000-4000-8000-000000000002',
		classification_version: 3, classification: 'suspected_automation', server_provenance: 'classification_correction',
		anonymous_browser_id: 'must-not-cross', visit_id: 'must-not-cross', note: 'must-not-cross'
	});
	assert.ok(control);
	assert.equal(control?.distinctId, 'analytics-system-classification-v2');
	assert.deepEqual(control?.properties, {
		$process_person_profile: false, target_event_id: '20000000-0000-4000-8000-000000000002',
		classification_version: 3, classification: 'suspected_automation', schema_version: 2
	});
});

test('the public event shape cannot impersonate a classification control', () => {
	assert.equal(preparePostHogDelivery({ event_name: POSTHOG_CLASSIFICATION_CONTROL_EVENT, event_id: 'bad' }), null);
});

test('reconciliation only sends bounded UUIDs to the requeue RPC', async () => {
	const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
	const requeued = await requeueMissingPostHogEvents({ rpc: async (name, args) => {
		calls.push({ name, args });
		return { data: [{ event_id: '20000000-0000-4000-8000-000000000003' }], error: null };
	} }, ['bad', '20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003']);
	assert.deepEqual(requeued, ['20000000-0000-4000-8000-000000000003']);
	assert.deepEqual(calls, [{ name: 'analytics_requeue_missing_posthog_events', args: { p_event_ids: ['20000000-0000-4000-8000-000000000003'] } }]);
});
