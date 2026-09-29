import { timingSafeEqual } from 'node:crypto';
import { scrubPostHogProperties } from './posthog-contract';
import type { PostHogCaptureClient, PostHogOutboxClient } from './posthog.types';

export interface DeliveryResult {
	claimed: number;
	submitted: number;
	submittedEventIds: string[];
	failed: number;
	skipped: number;
	duplicateIds: number;
}

/** Keep retry ownership in the durable outbox; the SDK itself has retries disabled. */
export async function deliverPostHogBatch(
	client: PostHogCaptureClient,
	outbox: PostHogOutboxClient,
	options: { limit?: number; leaseSeconds?: number } = {}
): Promise<DeliveryResult> {
	const rows = await outbox.claim(Math.min(Math.max(options.limit ?? 50, 1), 100), Math.min(Math.max(options.leaseSeconds ?? 60, 15), 300));
	const result: DeliveryResult = { claimed: rows.length, submitted: 0, submittedEventIds: [], failed: 0, skipped: 0, duplicateIds: 0 };
	const seen = new Set<string>();
	for (const row of rows) {
		if (seen.has(row.event_id)) { result.duplicateIds += 1; continue; }
		seen.add(row.event_id);
		const properties = scrubPostHogProperties(row.payload);
		if (!properties) {
			await outbox.finish(row.event_id, 'failed', 'invalid_or_ineligible_envelope');
			result.skipped += 1;
			continue;
		}
		try {
			await client.capture({
				distinctId: row.payload.anonymous_browser_id!, event: row.payload.event_name,
				timestamp: new Date(row.payload.occurred_at), uuid: row.payload.event_id, properties
			});
			await outbox.finish(row.event_id, 'submitted', null);
			result.submitted += 1;
			result.submittedEventIds.push(row.event_id);
		} catch {
			await outbox.finish(row.event_id, 'failed', 'posthog_capture_failed');
			result.failed += 1;
		}
	}
	return result;
}

/** Schedules require a separate scoped token; a browser session cannot authorize mutation. */
export function hasPostHogScheduleAuthorization(request: Request, token: string | undefined): boolean {
	const supplied = request.headers.get('x-analytics-posthog-schedule-token') ?? '';
	const expected = token?.trim() ?? '';
	if (!supplied || !expected) return false;
	const left = Buffer.from(supplied);
	const right = Buffer.from(expected);
	return left.length === right.length && timingSafeEqual(left, right);
}
