/** Explicit, privacy-bounded observations for the v2 collection path. */
export const EVENT_V2_NAMES = [
	'gallery_page_viewed', 'album_exposed', 'album_opened', 'photo_exposed', 'photo_opened',
	'photo_rendered', 'photo_load_failed', 'favorite_added', 'favorite_removed', 'share_action',
	'download_requested', 'download_item_requested', 'download_item_prepared', 'download_prepared',
	'download_handed_off', 'download_failed', 'download_cancelled', 'search_submitted',
	'search_results_shown', 'search_failed', 'search_result_selected', 'filters_applied', 'experiment_exposed'
] as const;

export type EventV2Name = (typeof EVENT_V2_NAMES)[number];
export type TrafficContextV2 = 'audience' | 'operator' | 'test' | 'self_excluded';

export interface EventV2Properties {
	album_key?: string;
	photo_id?: string;
	view_id?: string;
	result_set_id?: string;
	search_id?: string;
	download_request_id?: string;
	position?: number;
	result_count?: number;
	mode?: 'single_photo' | 'saved_photo_zip' | 'album_zip';
	stage?: 'request' | 'item_fetch' | 'prepare' | 'handoff';
	outcome?: 'clipboard_succeeded' | 'native_share_handed_off' | 'composer_opened' | 'email_link_opened' | 'cancelled' | 'failed';
	channel?: 'copy' | 'web' | 'x' | 'fb' | 'pin' | 'email';
	error_code?: string;
	[key: string]: string | number | boolean | undefined;
}

export interface AcceptedEventV2 {
	event_id: string;
	schema_version: 2;
	event_name: EventV2Name;
	occurred_at: string;
	received_at: string;
	anonymous_browser_id: string | null;
	visit_id: string | null;
	traffic_context: TrafficContextV2;
	export_eligible: boolean;
	properties: EventV2Properties;
}

export const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isEventV2Name(value: unknown): value is EventV2Name {
	return typeof value === 'string' && (EVENT_V2_NAMES as readonly string[]).includes(value);
}

export function isSafeEventProperty(key: string, value: unknown): value is string | number | boolean {
	if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) return false;
	if (['query', 'query_text', 'ip', 'user_agent', 'session_hash', 'email', 'caption', 'url'].includes(key)) return false;
	if (typeof value === 'string') return value.length > 0 && value.length <= 160;
	return typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}
