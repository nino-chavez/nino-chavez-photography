/**
 * Server-side boundary for the version-2 analytics export.  The collection
 * worker owns the durable schema; these structural types deliberately let this
 * module compile before that migration lands.
 */

export const POSTHOG_EVENT_NAMES = [
	'gallery_page_viewed',
	'album_exposed',
	'album_opened',
	'photo_exposed',
	'photo_opened',
	'photo_rendered',
	'photo_load_failed',
	'favorite_added',
	'favorite_removed',
	'share_action',
	'download_requested',
	'download_item_requested',
	'download_item_prepared',
	'download_prepared',
	'download_handed_off',
	'download_failed',
	'download_cancelled',
	'search_submitted',
	'search_results_shown',
	'search_failed',
	'search_result_selected',
	'filters_applied',
	'experiment_exposed'
] as const;

export type PostHogEventName = (typeof POSTHOG_EVENT_NAMES)[number];
export type PostHogTrafficContext = 'audience' | 'operator' | 'test' | 'crawler' | 'suspected_automation';

export interface PostHogEnvelope {
	event_id: string;
	schema_version: 2;
	event_name: PostHogEventName;
	occurred_at: string;
	received_at: string;
	anonymous_browser_id: string | null;
	visit_id: string | null;
	traffic_context: PostHogTrafficContext | { classification?: PostHogTrafficContext; reason_flags?: string[] };
	export_eligible: boolean;
	properties: Record<string, unknown>;
}

export interface PostHogOutboxRow {
	event_id: string;
	payload: PostHogEnvelope;
	attempts: number;
}

export interface PostHogOutboxClient {
	claim(limit: number, leaseSeconds: number): Promise<PostHogOutboxRow[]>;
	finish(eventId: string, status: 'submitted' | 'failed', errorCode: string | null): Promise<void>;
	confirm(eventIds: string[]): Promise<void>;
	health(): Promise<Record<string, unknown>>;
}

export interface PostHogCaptureClient {
	capture(event: {
		distinctId: string;
		event: PostHogEventName;
		timestamp: Date;
		uuid: string;
		properties: Record<string, string | number | boolean | string[]>;
	}): Promise<void>;
}

export const POSTHOG_JOURNEY_REPORTS = [
	'discovery',
	'album_use',
	'search_usefulness',
	'download_reliability',
	'photo_response',
	'sources_return',
	'experiments'
] as const;

export type PostHogJourneyReport = (typeof POSTHOG_JOURNEY_REPORTS)[number];

export interface PostHogJourneyQuery {
	report: PostHogJourneyReport;
	start: string;
	end: string;
	albumKeys?: string[];
	source?: string | null;
	sport?: string | null;
	category?: string | null;
}

export interface PostHogQueryTransport {
	query(body: { query: { kind: 'HogQLQuery'; query: string } }): Promise<unknown>;
}

export interface JourneyAggregate {
	report: PostHogJourneyReport;
	available: boolean;
	asOf: string | null;
	coverage: {
		start: string;
		end: string;
		timezone: 'America/Chicago';
		definitionVersion: 2;
		cohort: 'eligible audience events with a linked visit';
		excluded: 'operator, test, crawler, suspected automation, opted-out, and unlinked events';
		metadata: 'event snapshots only; no PostHog catalogue join';
	};
	totals: Record<string, number | null>;
	error?: 'provider_unavailable' | 'provider_query_failed' | 'invalid_query';
}

export interface PostHogFlagClient {
	getFeatureFlag(key: string, distinctId: string, options?: { disableGeoip?: boolean; sendFeatureFlagEvents?: boolean }): Promise<string | boolean | undefined>;
}
