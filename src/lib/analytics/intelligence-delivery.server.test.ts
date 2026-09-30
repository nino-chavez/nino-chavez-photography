import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverIntelligenceBriefs } from './intelligence-delivery.server';

test('synthetic missing owner preferences suppress external delivery but retain dashboard briefs', async () => {
	const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
	const client = { rpc: async (name: string, args?: Record<string, unknown>) => {
		calls.push({ name, args });
		if (name === 'analytics_list_ambiguous_intelligence_deliveries') return { data: [], error: null };
		if (name === 'analytics_claim_intelligence_deliveries') return { data: [
			{ id: 'dash', channel: 'dashboard', sender: 'owned', destinationVerified: false, preferenceEnabled: false, idempotencyKey: 'synthetic-dash', payload: { subject: 'Synthetic', body: 'Synthetic' } },
			{ id: 'email', channel: 'email', sender: 'owned', destinationVerified: false, preferenceEnabled: false, idempotencyKey: 'synthetic-email', payload: { subject: 'Synthetic', body: 'Synthetic' } }
		], error: null };
		return { data: null, error: null };
	} };
	const result = await deliverIntelligenceBriefs(client, null);
	assert.deepEqual(result, { reconciled: 0, shown: 1, accepted: 0, suppressed: 1, failed: 0, ambiguous: 0, native: 0 });
	assert.deepEqual(calls.filter((call) => call.name === 'analytics_finish_intelligence_delivery').map((call) => call.args?.p_status), ['shown', 'suppressed']);
});

test('ambiguous submission is reconciled before any retry and native PostHog has one sender', async () => {
	const calls: string[] = [];
	const client = { rpc: async (name: string) => {
		calls.push(name);
		if (name === 'analytics_list_ambiguous_intelligence_deliveries') return { data: [{ id: 'ambiguous' }], error: null };
		if (name === 'analytics_claim_intelligence_deliveries') return { data: [{ id: 'native', channel: 'email', sender: 'posthog_native', destinationVerified: true, preferenceEnabled: true, idempotencyKey: 'native', payload: { subject: 'Synthetic', body: 'Synthetic' } }], error: null };
		return { data: null, error: null };
	} };
	const provider = { send: async () => { throw new Error('must not resend'); }, reconcile: async () => ({ state: 'accepted' as const, providerMessageId: 'provider-1' }) };
	const result = await deliverIntelligenceBriefs(client, provider);
	assert.equal(result.reconciled, 1); assert.equal(result.native, 1);
	assert.ok(calls.indexOf('analytics_reconcile_intelligence_delivery') < calls.indexOf('analytics_claim_intelligence_deliveries'));
});
