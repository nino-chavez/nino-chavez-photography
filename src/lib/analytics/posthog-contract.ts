import type { PostHogEnvelope, PostHogEventName } from './posthog.types';
import { POSTHOG_EVENT_NAMES } from './posthog.types';
import { EVENT_V2_CONTRACT } from './events-v2';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

/** Only these scalar properties may cross the provider boundary. */
export const POSTHOG_PROPERTY_ALLOWLIST = new Set([
	'album_sport', 'event_date', 'photo_category', 'tagged_source', 'surface', 'release', 'environment',
	...Object.values(EVENT_V2_CONTRACT).flatMap((rule) => [
		...rule.required,
		...(rule.optional ?? []),
		...(rule.oneOf ?? [])
	])
]);

const SENSITIVE_PROPERTY = /(?:email|name|query|search_text|caption|note|ip|user.?agent|fingerprint|hash|url|contact|cookie|token|authorization)/i;

/** Capture and provider reads stay off unless the deployment names production explicitly. */
export function isPostHogProductionRuntime(source: Record<string, string | undefined>): boolean {
	return source.POSTHOG_ENABLED === 'true' && source.POSTHOG_TARGET_ENVIRONMENT === 'production';
}

function isEventName(value: string): value is PostHogEventName {
	return (POSTHOG_EVENT_NAMES as readonly string[]).includes(value);
}

function scalar(value: unknown): string | number | boolean | string[] | null {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= 1_000_000_000 ? value : null;
	if (typeof value === 'string') return value.length <= 160 && !/[\r\n]/.test(value) ? value : null;
	if (Array.isArray(value) && value.length <= 20 && value.every((item) => typeof item === 'string' && item.length <= 80 && !/[\r\n]/.test(item))) return value as string[];
	return null;
}

/** Removes unknown and sensitive properties before the SDK receives the event. */
export function scrubPostHogProperties(envelope: PostHogEnvelope): Record<string, string | number | boolean | string[]> | null {
	if (!UUID.test(envelope.event_id) || !ISO_INSTANT.test(envelope.occurred_at) || !ISO_INSTANT.test(envelope.received_at) || !Number.isFinite(Date.parse(envelope.occurred_at)) || !Number.isFinite(Date.parse(envelope.received_at))) return null;
	if (!isEventName(envelope.event_name) || !envelope.anonymous_browser_id || envelope.anonymous_browser_id.length > 128 || !envelope.visit_id || envelope.visit_id.length > 128) return null;
	if (!envelope.export_eligible || envelope.traffic_context !== 'audience') return null;
	const properties: Record<string, string | number | boolean | string[]> = {
		$process_person_profile: false, $session_id: envelope.visit_id, event_id: envelope.event_id,
		schema_version: envelope.schema_version, received_at: envelope.received_at,
		visit_id: envelope.visit_id, traffic_context: 'audience'
	};
	for (const [key, value] of Object.entries(envelope.properties)) {
		if (!POSTHOG_PROPERTY_ALLOWLIST.has(key) || SENSITIVE_PROPERTY.test(key)) continue;
		const accepted = scalar(value);
		if (accepted !== null) properties[key] = accepted;
	}
	return properties;
}
