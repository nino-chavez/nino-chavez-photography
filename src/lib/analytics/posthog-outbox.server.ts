import type { PostHogEnvelope, PostHogOutboxClient, PostHogOutboxRow } from './posthog.types';

type RpcResult = { data: unknown; error: { message?: string } | null };
export interface PostHogRpcClient {
	rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcResult>;
}

function failure(name: string, error: { message?: string } | null): never {
	throw new Error(`${name} failed${error?.message ? `: ${error.message}` : ''}`);
}

function isOutboxRow(row: unknown): row is PostHogOutboxRow {
	if (!row || typeof row !== 'object') return false;
	const value = row as Partial<PostHogOutboxRow>;
	return typeof value.event_id === 'string' && typeof value.attempts === 'number' && !!value.payload && typeof value.payload === 'object';
}

/** The only adapter allowed to invoke the delivery RPCs supplied by the collection migration. */
export function createPostHogOutboxClient(client: PostHogRpcClient): PostHogOutboxClient {
	return {
		async claim(limit, leaseSeconds) {
			const result = await client.rpc('analytics_claim_posthog_events', { p_limit: limit, p_lease_seconds: leaseSeconds });
			if (result.error) failure('analytics_claim_posthog_events', result.error);
			if (!Array.isArray(result.data) || !result.data.every(isOutboxRow)) throw new Error('analytics_claim_posthog_events returned an invalid payload');
			return result.data;
		},
		async recheck(eventId) {
			const result = await client.rpc('analytics_recheck_posthog_event_eligibility', { p_event_id: eventId });
			if (result.error) failure('analytics_recheck_posthog_event_eligibility', result.error);
			if (result.data === null) return null;
			if (!isOutboxRow({ event_id: eventId, attempts: 0, payload: result.data })) throw new Error('analytics_recheck_posthog_event_eligibility returned an invalid payload');
			return result.data as PostHogEnvelope;
		},
		async finish(eventId, status, errorCode) {
			const result = await client.rpc('analytics_finish_posthog_delivery', { p_event_id: eventId, p_status: status, p_error_code: errorCode });
			if (result.error) failure('analytics_finish_posthog_delivery', result.error);
		},
		async submitted(limit) {
			const result = await client.rpc('analytics_list_submitted_posthog_event_ids', { p_limit: Math.min(Math.max(limit, 1), 100) });
			if (result.error) failure('analytics_list_submitted_posthog_event_ids', result.error);
			if (!Array.isArray(result.data)) throw new Error('analytics_list_submitted_posthog_event_ids returned an invalid payload');
			const ids = result.data.map((entry) => typeof entry === 'string' ? entry : entry && typeof entry === 'object' ? (entry as { event_id?: unknown }).event_id : null);
			if (!ids.every((id): id is string => typeof id === 'string')) throw new Error('analytics_list_submitted_posthog_event_ids returned an invalid payload');
			return ids;
		},
		async confirm(eventIds) {
			const result = await client.rpc('analytics_confirm_posthog_events', { p_event_ids: eventIds });
			if (result.error) failure('analytics_confirm_posthog_events', result.error);
		},
		async health() {
			const result = await client.rpc('analytics_posthog_delivery_health');
			if (result.error) failure('analytics_posthog_delivery_health', result.error);
			return result.data && typeof result.data === 'object' && !Array.isArray(result.data) ? result.data as Record<string, unknown> : {};
		}
	};
}
