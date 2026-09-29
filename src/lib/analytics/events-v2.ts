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

export type EventV2Properties = Record<string, string | number | boolean | undefined>;

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

type PropertyRule = { required: readonly string[]; optional?: readonly string[]; oneOf?: readonly string[]; targets?: 'photo' | 'album' | 'subject' | 'none' };

/** The only event property keys the collector will accept. */
export const EVENT_V2_CONTRACT: Record<EventV2Name, PropertyRule> = {
	gallery_page_viewed: { required: ['route_kind', 'canonical_path', 'view_id', 'layout_class'], targets: 'none' },
	album_exposed: { required: ['album_key', 'position', 'result_set_id'], targets: 'album' },
	album_opened: { required: ['album_key', 'view_id', 'entry_surface'], targets: 'album' },
	photo_exposed: { required: ['photo_id', 'album_key', 'position', 'result_set_id'], targets: 'photo' },
	photo_opened: { required: ['photo_id', 'album_key', 'view_id', 'entry_surface'], targets: 'photo' },
	photo_rendered: { required: ['photo_id', 'album_key', 'view_id', 'load_duration_ms'], targets: 'photo' },
	photo_load_failed: { required: ['photo_id', 'album_key', 'view_id', 'error_code'], targets: 'photo' },
	favorite_added: { required: ['photo_id', 'album_key', 'surface'], targets: 'photo' },
	favorite_removed: { required: ['photo_id', 'album_key', 'surface'], targets: 'photo' },
	share_action: { required: ['channel', 'outcome'], oneOf: ['photo_id', 'album_key'], targets: 'subject' },
	download_requested: { required: ['download_request_id', 'mode', 'requested_item_count'], oneOf: ['photo_id', 'album_key'], targets: 'subject' },
	download_item_requested: { required: ['download_request_id', 'photo_id', 'album_key'], optional: ['mode'], targets: 'photo' },
	download_item_prepared: { required: ['download_request_id', 'photo_id', 'album_key', 'byte_count'], optional: ['mode'], targets: 'photo' },
	download_prepared: { required: ['download_request_id', 'mode', 'requested_item_count', 'prepared_item_count', 'byte_count', 'duration_ms'], optional: ['item_count_known'], oneOf: ['photo_id', 'album_key'], targets: 'subject' },
	download_handed_off: { required: ['download_request_id', 'mode', 'prepared_item_count'], optional: ['item_count_known'], oneOf: ['photo_id', 'album_key'], targets: 'subject' },
	download_failed: { required: ['download_request_id', 'mode', 'stage', 'error_code', 'retry_attempt'], oneOf: ['photo_id', 'album_key'], targets: 'subject' },
	download_cancelled: { required: ['download_request_id', 'mode', 'stage', 'requested_item_count', 'prepared_item_count'], oneOf: ['photo_id', 'album_key'], targets: 'subject' },
	search_submitted: { required: ['search_id'], optional: ['sport', 'category', 'play_type', 'division', 'level', 'sort'], targets: 'none' },
	search_results_shown: { required: ['search_id', 'result_set_id', 'result_count'], optional: ['duration_ms'], targets: 'none' },
	search_failed: { required: ['search_id', 'error_code'], targets: 'none' },
	search_result_selected: { required: ['search_id', 'result_set_id', 'position'], oneOf: ['photo_id', 'album_key'], targets: 'subject' },
	filters_applied: { required: ['result_set_id', 'result_count'], optional: ['sport', 'category', 'play_type', 'division', 'level', 'sort'], targets: 'none' },
	experiment_exposed: { required: ['experiment_key', 'variant', 'release', 'surface'], targets: 'none' }
};

export function isEventV2Name(value: unknown): value is EventV2Name {
	return typeof value === 'string' && (EVENT_V2_NAMES as readonly string[]).includes(value);
}

export function isSafeEventProperty(key: string, value: unknown): value is string | number | boolean {
	if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) return false;
	if (typeof value === 'string') return value.length > 0 && value.length <= 160;
	return typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}

export function eventPropertiesMatchContract(eventName: EventV2Name, properties: EventV2Properties): boolean {
	const rule = EVENT_V2_CONTRACT[eventName];
	const allowed = new Set([...rule.required, ...(rule.optional ?? []), ...(rule.oneOf ?? []), 'album_key', 'photo_id', 'surface', 'tagged_source', 'release']);
	if (Object.keys(properties).some((key) => properties[key] !== undefined && !allowed.has(key))) return false;
	if (rule.required.some((key) => key !== 'album_key' && !(key === 'prepared_item_count' && properties.item_count_known === false) && properties[key] === undefined)) return false;
	if (rule.oneOf && properties.mode !== 'saved_photo_zip' && !rule.oneOf.some((key) => properties[key] !== undefined)) return false;
	if (rule.targets === 'photo' && !properties.photo_id) return false;
	if (rule.targets === 'album' && !properties.album_key) return false;
	if (rule.targets === 'subject' && properties.mode !== 'saved_photo_zip' && !properties.photo_id && !properties.album_key) return false;
	return validPropertyValues(properties);
}

function validPropertyValues(properties: EventV2Properties): boolean {
	for (const [key, value] of Object.entries(properties)) {
		if (value === undefined) continue;
		if (['photo_id', 'album_key', 'surface', 'entry_surface', 'route_kind', 'error_code', 'release', 'experiment_key', 'variant'].includes(key) && (typeof value !== 'string' || !value.trim() || value.length > 160)) return false;
		if (key === 'tagged_source' && (typeof value !== 'string' || !/^[a-z0-9_-]{1,32}$/.test(value))) return false;
		if (key === 'item_count_known' && typeof value !== 'boolean') return false;
		if (['position', 'result_count', 'requested_item_count', 'prepared_item_count', 'byte_count', 'duration_ms', 'load_duration_ms', 'retry_attempt'].includes(key) &&
			(typeof value !== 'number' || !Number.isInteger(value) || value < 0)) return false;
		if (key === 'mode' && !['single_photo', 'saved_photo_zip', 'album_zip'].includes(String(value))) return false;
		if (key === 'outcome' && !['clipboard_succeeded', 'native_share_handed_off', 'composer_opened', 'email_link_opened', 'cancelled', 'failed'].includes(String(value))) return false;
		if (key === 'channel' && !['copy', 'web', 'x', 'fb', 'linkedin', 'pin', 'email'].includes(String(value))) return false;
		if (key === 'stage' && !['request', 'item_fetch', 'prepare', 'handoff'].includes(String(value))) return false;
		if (['view_id', 'search_id', 'result_set_id', 'download_request_id'].includes(key) && (typeof value !== 'string' || !ID_PATTERN.test(value))) return false;
		if (key === 'canonical_path' && (typeof value !== 'string' || !value.startsWith('/') || value.includes('?') || value.includes('#'))) return false;
		if (typeof value === 'string' && ['unknown', 'none', 'n/a', 'placeholder'].includes(value.toLowerCase())) return false;
	}
	return true;
}
