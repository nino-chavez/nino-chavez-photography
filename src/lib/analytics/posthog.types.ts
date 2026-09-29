/** The collection contract owns names, traffic classes, and accepted envelopes. */
import { EVENT_V2_NAMES } from './events-v2';
import type { AcceptedEventV2, EventV2Name, TrafficContextV2 } from './events-v2';

export const POSTHOG_EVENT_NAMES = EVENT_V2_NAMES;
export type PostHogEventName = EventV2Name;
export type PostHogTrafficContext = TrafficContextV2;
export type PostHogEnvelope = AcceptedEventV2;

export interface PostHogOutboxRow {
	event_id: string;
	payload: PostHogEnvelope;
	attempts: number;
}

export interface PostHogOutboxClient {
	claim(limit: number, leaseSeconds: number): Promise<PostHogOutboxRow[]>;
	/** Atomically returns the current envelope or suppresses an ineligible row. */
	recheck(eventId: string): Promise<PostHogEnvelope | null>;
	finish(eventId: string, status: 'submitted' | 'failed', errorCode: string | null): Promise<void>;
	submitted(limit: number): Promise<string[]>;
	confirm(eventIds: string[]): Promise<void>;
	/** Reopens provider-missing submitted rows only when the database RPC says they remain eligible. */
	requeueMissing?(eventIds: string[]): Promise<void>;
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
	query(body: { refresh?: 'force_async' | 'async'; query: { kind: 'HogQLQuery'; query: string } }): Promise<unknown>;
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
		cohort: string;
		excluded: string;
		metadata: string;
	};
	totals: Record<string, number | null>;
	/** Bounded aggregate rows. They contain source tags, never browser or visit identifiers. */
	breakdown: SourceReturnBreakdownRow[];
	error?: 'provider_unavailable' | 'provider_query_failed' | 'invalid_query';
}

export interface SourceReturnBreakdownRow {
	source: string;
	tagged_arrival_visits: number;
	measured_browsers: number;
	before_window_returning_browsers: number;
	repeated_visit_browsers_in_window: number;
	subsequent_album_open_visits: number;
	subsequent_photo_open_visits: number;
	subsequent_download_request_visits: number;
	subsequent_favorite_visits: number;
}

export interface PostHogFlagClient {
	getFeatureFlag(key: string, distinctId: string, options?: { disableGeoip?: boolean; sendFeatureFlagEvents?: boolean }): Promise<string | boolean | undefined>;
}
