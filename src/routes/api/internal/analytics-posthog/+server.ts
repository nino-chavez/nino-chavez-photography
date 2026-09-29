import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { createPostHogCaptureClient, postHogRuntimeConfig } from '$lib/analytics/posthog.server';
import { deliverPostHogBatch, hasPostHogScheduleAuthorization } from '$lib/analytics/posthog-delivery.server';
import { createPostHogOutboxClient } from '$lib/analytics/posthog-outbox.server';
import { createPostHogQueryTransport, reconcileSubmittedPostHogEvents } from '$lib/analytics/posthog-queries.server';
import type { RequestHandler } from './$types';

function publicHealth(input: Record<string, unknown>): Record<string, string | number | null> {
	const allowed = new Set(['pending', 'submitted', 'confirmed', 'failed', 'oldest_pending_at', 'oldest_submitted_at', 'reconciliation_watermark']);
	return Object.fromEntries(Object.entries(input).flatMap(([key, value]) =>
		allowed.has(key) && (typeof value === 'number' || typeof value === 'string' || value === null) ? [[key, value]] : []
	));
}

/**
 * A scheduler-only relay. The request token is deliberately separate from
 * operator login and query credentials; unauthenticated callers cannot lease,
 * retry, or confirm delivery records.
 */
export const POST: RequestHandler = async ({ request, setHeaders }) => {
	setHeaders({ 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' });
	if (!hasPostHogScheduleAuthorization(request, env.ANALYTICS_POSTHOG_SCHEDULE_TOKEN)) {
		return json({ ok: false, error: 'schedule_authorization_required' }, { status: 403 });
	}
	const capture = createPostHogCaptureClient(postHogRuntimeConfig(env));
	if (!capture) return json({ ok: false, error: 'provider_unavailable' }, { status: 503 });
	try {
		const outbox = createPostHogOutboxClient(createSupabaseAdminClient());
		const delivery = await deliverPostHogBatch(capture, outbox);
		const reconciliation = await reconcileSubmittedPostHogEvents(createPostHogQueryTransport(env), outbox);
		const health = await outbox.health();
		return json({
			ok: true,
			delivery: { claimed: delivery.claimed, submitted: delivery.submitted, failed: delivery.failed, skipped: delivery.skipped, duplicateIds: delivery.duplicateIds },
			reconciliation,
			health: publicHealth(health)
		});
	} catch {
		// Do not return provider or database error text from an internal endpoint.
		return json({ ok: false, error: 'delivery_unavailable' }, { status: 503 });
	}
};
