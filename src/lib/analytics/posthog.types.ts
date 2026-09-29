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
		excluded: 'operator, test, self-excluded, ineligible, and unlinked events';
		metadata: 'event snapshots only; no PostHog catalogue join';
	};
	totals: Record<string, number | null>;
	error?: 'provider_unavailable' | 'provider_query_failed' | 'invalid_query';
}

export interface PostHogFlagClient {
	getFeatureFlag(key: string, distinctId: string, options?: { disableGeoip?: boolean; sendFeatureFlagEvents?: boolean }): Promise<string | boolean | undefined>;
}
