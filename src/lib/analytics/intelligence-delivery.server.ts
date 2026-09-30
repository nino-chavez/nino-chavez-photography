export type IntelligenceDestination = { channel: 'email'; address: string; verifiedAt: string };
export type IntelligenceDelivery = {
	id: string;
	channel: 'dashboard' | 'email';
	sender: 'owned' | 'posthog_native';
	destinationVerified: boolean;
	preferenceEnabled: boolean;
	idempotencyKey: string;
	destination: IntelligenceDestination | null;
	payload: { subject: string; body: string };
};

export interface IntelligenceDeliveryRpcClient {
	rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}
export interface IntelligenceDeliveryProvider {
	send(delivery: IntelligenceDelivery): Promise<{ state: 'accepted' | 'ambiguous' | 'failed'; providerMessageId?: string }>;
	reconcile(deliveryId: string): Promise<{ state: 'accepted' | 'missing' | 'unavailable'; providerMessageId?: string }>;
}

function object(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function validInstant(value: unknown): value is string { return typeof value === 'string' && !Number.isNaN(Date.parse(value)); }
function destination(value: unknown): IntelligenceDestination | null {
	const row = object(value);
	if (!row || row.channel !== 'email' || typeof row.address !== 'string' || row.address.length < 3 || row.address.length > 320 || !validInstant(row.verifiedAt)) return null;
	return { channel: 'email', address: row.address, verifiedAt: row.verifiedAt };
}
function isDelivery(value: unknown): value is IntelligenceDelivery {
	const delivery = object(value);
	if (!delivery || typeof delivery.id !== 'string' || !['dashboard', 'email'].includes(String(delivery.channel))
		|| !['owned', 'posthog_native'].includes(String(delivery.sender)) || typeof delivery.destinationVerified !== 'boolean'
		|| typeof delivery.preferenceEnabled !== 'boolean' || typeof delivery.idempotencyKey !== 'string') return false;
	const payload = object(delivery.payload);
	if (!payload || typeof payload.subject !== 'string' || typeof payload.body !== 'string') return false;
	const resolved = delivery.destination === null ? null : destination(delivery.destination);
	return delivery.channel === 'dashboard' ? delivery.destination === null : !!resolved && (!delivery.destinationVerified || !!resolved.verifiedAt);
}

function providerMessageId(value: unknown): string | undefined {
	const row = object(value);
	return typeof row?.providerMessageId === 'string' && row.providerMessageId.length <= 300 ? row.providerMessageId : undefined;
}
function deliveryId(value: unknown): string | null {
	const row = object(value);
	return typeof row?.id === 'string' ? row.id : null;
}

/**
 * The owned adapter is activated only by an owner-provisioned endpoint and token.
 * It sends the stored verified destination and idempotency key unchanged; it never
 * chooses a recipient or treats provider acceptance as inbox delivery.
 */
export function createOwnedIntelligenceDeliveryProvider(config: {
	enabled: boolean;
	endpoint: string | undefined;
	token: string | undefined;
	fetcher?: typeof fetch;
}): IntelligenceDeliveryProvider | null {
	if (!config.enabled || !config.endpoint || !config.token) return null;
	let endpoint: URL;
	try {
		endpoint = new URL(config.endpoint);
		if (endpoint.protocol !== 'https:') return null;
	} catch { return null; }
	const fetcher = config.fetcher ?? fetch;
	const request = async (path: string, init: RequestInit) => fetcher(new URL(path, endpoint), init);
	return {
		async send(delivery) {
			if (!delivery.destination || !delivery.destinationVerified || !delivery.preferenceEnabled) return { state: 'failed' };
			try {
				const response = await request('deliveries', {
					method: 'POST',
					headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json', 'idempotency-key': delivery.idempotencyKey },
					body: JSON.stringify({ deliveryId: delivery.id, destination: delivery.destination, payload: delivery.payload })
				});
				if (response.status === 200 || response.status === 201 || response.status === 202 || response.status === 409) {
					return { state: 'accepted', providerMessageId: providerMessageId(await response.json().catch(() => null)) };
				}
				return { state: response.status >= 400 && response.status < 500 ? 'failed' : 'ambiguous' };
			} catch { return { state: 'ambiguous' }; }
		},
		async reconcile(deliveryId) {
			const response = await request(`deliveries/${encodeURIComponent(deliveryId)}`, { headers: { authorization: `Bearer ${config.token}` } });
			if (response.status === 404) return { state: 'missing' };
			if (!response.ok) return { state: 'unavailable' };
			const body = object(await response.json().catch(() => null));
			return body?.state === 'accepted' ? { state: 'accepted', providerMessageId: providerMessageId(body) } : { state: 'unavailable' };
		}
	};
}

export function createIntelligenceDeliveryStore(client: IntelligenceDeliveryRpcClient) {
	return {
		async ambiguous(limit: number): Promise<Array<Pick<IntelligenceDelivery, 'id'>>> {
			const result = await client.rpc('analytics_list_ambiguous_intelligence_deliveries', { p_limit: Math.min(Math.max(limit, 1), 50) });
			if (result.error || !Array.isArray(result.data)) throw new Error('analytics_list_ambiguous_intelligence_deliveries failed');
			const ids = result.data.map(deliveryId);
			if (ids.some((id) => id === null)) throw new Error('analytics_list_ambiguous_intelligence_deliveries failed');
			return ids.filter((id): id is string => id !== null).map((id) => ({ id }));
		},
		async reconcile(id: string, state: 'accepted' | 'missing' | 'unavailable', providerMessageId?: string) {
			const result = await client.rpc('analytics_reconcile_intelligence_delivery', { p_delivery_id: id, p_state: state, p_provider_message_id: providerMessageId ?? null });
			if (result.error) throw new Error('analytics_reconcile_intelligence_delivery failed');
		},
		async claim(limit: number): Promise<IntelligenceDelivery[]> {
			const result = await client.rpc('analytics_claim_intelligence_deliveries', { p_limit: Math.min(Math.max(limit, 1), 12), p_lease_seconds: 120 });
			if (result.error || !Array.isArray(result.data) || !result.data.every(isDelivery)) throw new Error('analytics_claim_intelligence_deliveries failed');
			return result.data;
		},
		async finish(id: string, status: 'shown' | 'accepted' | 'suppressed' | 'failed' | 'ambiguous', errorCode: string | null, providerMessageId?: string) {
			const result = await client.rpc('analytics_finish_intelligence_delivery', { p_delivery_id: id, p_status: status, p_error_code: errorCode, p_provider_message_id: providerMessageId ?? null });
			if (result.error) throw new Error('analytics_finish_intelligence_delivery failed');
		}
	};
}

export type IntelligenceDeliveryResult = { reconciled: number; unresolved: number; shown: number; accepted: number; suppressed: number; failed: number; ambiguous: number; native: number };

/** Dashboard briefs work independently. A thrown submission is always ambiguous, never retried blindly. */
export async function deliverIntelligenceBriefs(client: IntelligenceDeliveryRpcClient, provider: IntelligenceDeliveryProvider | null, limit = 8): Promise<IntelligenceDeliveryResult> {
	const store = createIntelligenceDeliveryStore(client);
	const result: IntelligenceDeliveryResult = { reconciled: 0, unresolved: 0, shown: 0, accepted: 0, suppressed: 0, failed: 0, ambiguous: 0, native: 0 };
	for (const row of await store.ambiguous(limit)) {
		if (!provider) break;
		try {
			const reconciliation = await provider.reconcile(row.id);
			await store.reconcile(row.id, reconciliation.state, reconciliation.providerMessageId);
			result.reconciled += 1;
		} catch { result.unresolved += 1; }
	}
	for (const delivery of await store.claim(limit)) {
		if (delivery.channel === 'dashboard') { await store.finish(delivery.id, 'shown', null); result.shown += 1; continue; }
		if (delivery.sender === 'posthog_native') { await store.finish(delivery.id, 'suppressed', 'posthog_native_sender'); result.native += 1; continue; }
		if (!delivery.destinationVerified || !delivery.preferenceEnabled || !provider) {
			await store.finish(delivery.id, 'suppressed', !delivery.destinationVerified ? 'destination_unverified' : !delivery.preferenceEnabled ? 'preference_disabled' : 'external_delivery_disabled');
			result.suppressed += 1;
			continue;
		}
		try {
			const sent = await provider.send(delivery);
			if (sent.state === 'accepted') { await store.finish(delivery.id, 'accepted', null, sent.providerMessageId); result.accepted += 1; }
			else if (sent.state === 'ambiguous') { await store.finish(delivery.id, 'ambiguous', 'submission_ambiguous', sent.providerMessageId); result.ambiguous += 1; }
			else { await store.finish(delivery.id, 'failed', 'external_delivery_failed'); result.failed += 1; }
		} catch {
			await store.finish(delivery.id, 'ambiguous', 'submission_ambiguous');
			result.ambiguous += 1;
		}
	}
	return result;
}
