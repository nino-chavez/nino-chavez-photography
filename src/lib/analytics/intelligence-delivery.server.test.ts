import assert from 'node:assert/strict';
import test from 'node:test';
import { createOwnedIntelligenceDeliveryProvider, deliverIntelligenceBriefs } from './intelligence-delivery.server';

const destination = { channel: 'email' as const, address: 'owner@example.invalid', verifiedAt: '2026-09-30T14:00:00.000Z' };

test('missing preferences suppress external delivery but retain dashboard briefs', async () => {
	const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
	const client = { rpc: async (name: string, args?: Record<string, unknown>) => {
		calls.push({ name, args });
		if (name === 'analytics_list_ambiguous_intelligence_deliveries') return { data: [], error: null };
		if (name === 'analytics_claim_intelligence_deliveries') return { data: [
			{ id: 'dash', channel: 'dashboard', sender: 'owned', destinationVerified: false, preferenceEnabled: false, idempotencyKey: 'synthetic-dash', destination: null, payload: { subject: 'Synthetic', body: 'Synthetic' } },
			{ id: 'email', channel: 'email', sender: 'owned', destinationVerified: false, preferenceEnabled: false, idempotencyKey: 'synthetic-email', destination, payload: { subject: 'Synthetic', body: 'Synthetic' } }
		], error: null };
		return { data: null, error: null };
	} };
	const result = await deliverIntelligenceBriefs(client, null);
	assert.deepEqual(result, { reconciled: 0, unresolved: 0, shown: 1, accepted: 0, suppressed: 1, failed: 0, ambiguous: 0, native: 0 });
	assert.deepEqual(calls.filter((call) => call.name === 'analytics_finish_intelligence_delivery').map((call) => call.args?.p_status), ['shown', 'suppressed']);
});

test('a thrown send is ambiguous and reconciliation failures remain unresolved', async () => {
	const calls: string[] = [];
	const client = { rpc: async (name: string) => {
		calls.push(name);
		if (name === 'analytics_list_ambiguous_intelligence_deliveries') return { data: [{ id: 'older-ambiguous' }], error: null };
		if (name === 'analytics_claim_intelligence_deliveries') return { data: [{ id: 'email', channel: 'email', sender: 'owned', destinationVerified: true, preferenceEnabled: true, idempotencyKey: 'synthetic-email', destination, payload: { subject: 'Synthetic', body: 'Synthetic' } }], error: null };
		return { data: null, error: null };
	} };
	const provider = { send: async () => { throw new Error('synthetic timeout'); }, reconcile: async () => { throw new Error('synthetic provider outage'); } };
	const result = await deliverIntelligenceBriefs(client, provider);
	assert.equal(result.unresolved, 1);
	assert.equal(result.ambiguous, 1);
	assert.equal(calls.filter((name) => name === 'analytics_reconcile_intelligence_delivery').length, 0);
	assert.equal(calls.filter((name) => name === 'analytics_finish_intelligence_delivery').length, 1);
});

test('the configured owned adapter sends the stored verified destination and idempotency key', async () => {
	let request: RequestInit | undefined;
	const provider = createOwnedIntelligenceDeliveryProvider({
		enabled: true, endpoint: 'https://delivery.example.invalid/intelligence/', token: 'synthetic-token',
		fetcher: async (_url, init) => { request = init; return Response.json({ providerMessageId: 'synthetic-1' }, { status: 202 }); }
	});
	assert.ok(provider);
	const sent = await provider.send({ id: 'delivery', channel: 'email', sender: 'owned', destinationVerified: true, preferenceEnabled: true, idempotencyKey: 'stable-key', destination, payload: { subject: 'Synthetic', body: 'Synthetic' } });
	assert.deepEqual(sent, { state: 'accepted', providerMessageId: 'synthetic-1' });
	assert.equal((request?.headers as Record<string, string>)['idempotency-key'], 'stable-key');
	assert.match(String(request?.body), /owner@example\.invalid/);
});
