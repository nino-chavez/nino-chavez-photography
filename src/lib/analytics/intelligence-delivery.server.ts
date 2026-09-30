export type IntelligenceDelivery = {
	id: string;
	channel: 'dashboard' | 'email';
	sender: 'owned' | 'posthog_native';
	destinationVerified: boolean;
	preferenceEnabled: boolean;
	idempotencyKey: string;
	payload: { subject: string; body: string };
};

export interface IntelligenceDeliveryRpcClient {
	rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}
export interface IntelligenceDeliveryProvider {
	send(delivery: IntelligenceDelivery): Promise<{ state: 'accepted' | 'ambiguous' | 'failed'; providerMessageId?: string }>;
	reconcile(deliveryId: string): Promise<{ state: 'accepted' | 'missing' | 'unavailable'; providerMessageId?: string }>;
}

function isDelivery(value: unknown): value is IntelligenceDelivery {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const delivery = value as Partial<IntelligenceDelivery>;
	return typeof delivery.id === 'string' && (delivery.channel === 'dashboard' || delivery.channel === 'email')
		&& (delivery.sender === 'owned' || delivery.sender === 'posthog_native') && typeof delivery.destinationVerified === 'boolean'
		&& typeof delivery.preferenceEnabled === 'boolean' && typeof delivery.idempotencyKey === 'string'
		&& !!delivery.payload && typeof delivery.payload.subject === 'string' && typeof delivery.payload.body === 'string';
}

export function createIntelligenceDeliveryStore(client: IntelligenceDeliveryRpcClient) {
	return {
		async ambiguous(limit: number): Promise<Array<Pick<IntelligenceDelivery, 'id'>>> {
			const result = await client.rpc('analytics_list_ambiguous_intelligence_deliveries', { p_limit: Math.min(Math.max(limit, 1), 50) });
			if (result.error || !Array.isArray(result.data) || !result.data.every((row) => row && typeof row === 'object' && typeof (row as { id?: unknown }).id === 'string')) throw new Error('analytics_list_ambiguous_intelligence_deliveries failed');
			return result.data as Array<Pick<IntelligenceDelivery, 'id'>>;
		},
		async reconcile(id: string, state: 'accepted' | 'missing' | 'unavailable', providerMessageId?: string) {
			const result = await client.rpc('analytics_reconcile_intelligence_delivery', { p_delivery_id: id, p_state: state, p_provider_message_id: providerMessageId ?? null });
			if (result.error) throw new Error('analytics_reconcile_intelligence_delivery failed');
		},
		async claim(limit: number): Promise<IntelligenceDelivery[]> {
			const result = await client.rpc('analytics_claim_intelligence_deliveries', { p_limit: Math.min(Math.max(limit, 1), 20), p_lease_seconds: 180 });
			if (result.error || !Array.isArray(result.data) || !result.data.every(isDelivery)) throw new Error('analytics_claim_intelligence_deliveries failed');
			return result.data;
		},
		async finish(id: string, status: 'shown' | 'accepted' | 'suppressed' | 'failed' | 'ambiguous', errorCode: string | null, providerMessageId?: string) {
			const result = await client.rpc('analytics_finish_intelligence_delivery', { p_delivery_id: id, p_status: status, p_error_code: errorCode, p_provider_message_id: providerMessageId ?? null });
			if (result.error) throw new Error('analytics_finish_intelligence_delivery failed');
		}
	};
}

export type IntelligenceDeliveryResult = { reconciled: number; shown: number; accepted: number; suppressed: number; failed: number; ambiguous: number; native: number };

/** Does not send email unless an injected provider and both owner gates are present. */
export async function deliverIntelligenceBriefs(client: IntelligenceDeliveryRpcClient, provider: IntelligenceDeliveryProvider | null, limit = 12): Promise<IntelligenceDeliveryResult> {
	const store = createIntelligenceDeliveryStore(client);
	const result: IntelligenceDeliveryResult = { reconciled: 0, shown: 0, accepted: 0, suppressed: 0, failed: 0, ambiguous: 0, native: 0 };
	for (const row of await store.ambiguous(limit)) {
		if (!provider) break;
		const reconciliation = await provider.reconcile(row.id);
		await store.reconcile(row.id, reconciliation.state, reconciliation.providerMessageId);
		result.reconciled += 1;
	}
	for (const delivery of await store.claim(limit)) {
		if (delivery.channel === 'dashboard') { await store.finish(delivery.id, 'shown', null); result.shown += 1; continue; }
		if (delivery.sender === 'posthog_native') { await store.finish(delivery.id, 'suppressed', 'posthog_native_sender'); result.native += 1; continue; }
		if (!delivery.destinationVerified || !delivery.preferenceEnabled || !provider) { await store.finish(delivery.id, 'suppressed', !delivery.destinationVerified ? 'destination_unverified' : !delivery.preferenceEnabled ? 'preference_disabled' : 'external_delivery_disabled'); result.suppressed += 1; continue; }
		const sent = await provider.send(delivery);
		if (sent.state === 'accepted') { await store.finish(delivery.id, 'accepted', null, sent.providerMessageId); result.accepted += 1; }
		else if (sent.state === 'ambiguous') { await store.finish(delivery.id, 'ambiguous', 'submission_ambiguous', sent.providerMessageId); result.ambiguous += 1; }
		else { await store.finish(delivery.id, 'failed', 'external_delivery_failed'); result.failed += 1; }
	}
	return result;
}
