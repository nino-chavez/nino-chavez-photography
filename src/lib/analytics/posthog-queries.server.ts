import type {
	JourneyAggregate,
	PostHogJourneyQuery,
	PostHogJourneyReport,
	PostHogQueryTransport
} from './posthog.types';
import { POSTHOG_JOURNEY_REPORTS } from './posthog.types';

const CHICAGO = 'America/Chicago' as const;
const SAFE_KEY = /^[A-Za-z0-9_-]{1,128}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function quoted(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

function eventProperty(name: string): string {
	return `properties.${name}`;
}

function emptyTotals(report: PostHogJourneyReport): Record<string, number | null> {
	const reportTotals: Record<PostHogJourneyReport, string[]> = {
		discovery: ['eligible_visits', 'album_exposed_visits', 'album_opened_after_exposure', 'direct_album_open_visits'],
		album_use: ['album_open_visits', 'photo_render_visits', 'album_action_visits'],
		search_usefulness: ['searches_shown', 'zero_result_searches', 'selected_searches', 'selection_duration_ms'],
		download_reliability: ['requests', 'prepared', 'handed_off', 'failed', 'unknown_terminal_outcome'],
		photo_response: ['eligible_photo_exposures', 'later_photo_actions'],
		sources_return: ['tagged_arrival_visits', 'tagged_arrival_action_visits', 'returning_measured_browsers'],
		experiments: ['observed_exposures', 'outcome_visits', 'guardrail_failures']
	};
	return Object.fromEntries(reportTotals[report].map((key) => [key, null]));
}

function validReport(report: string): report is PostHogJourneyReport {
	return (POSTHOG_JOURNEY_REPORTS as readonly string[]).includes(report);
}

function validatedQuery(query: PostHogJourneyQuery, allowedAlbumKeys: string[]): { value: PostHogJourneyQuery; albumKeys: string[] } | null {
	if (!validReport(query.report) || !DATE.test(query.start) || !DATE.test(query.end) || query.start > query.end) return null;
	const range = (Date.parse(`${query.end}T12:00:00Z`) - Date.parse(`${query.start}T12:00:00Z`)) / 86_400_000;
	if (range > 366 || !allowedAlbumKeys.every((key) => SAFE_KEY.test(key))) return null;
	const requested = query.albumKeys ?? allowedAlbumKeys;
	if (!requested.every((key) => SAFE_KEY.test(key)) || requested.some((key) => !allowedAlbumKeys.includes(key))) return null;
	for (const value of [query.source, query.sport, query.category]) {
		if (value !== null && value !== undefined && (!SAFE_KEY.test(value) || value.length > 128)) return null;
	}
	return { value: query, albumKeys: requested };
}

/**
 * Every saved report starts from this CTE. It applies version, audience, date,
 * album visibility and optional source/metadata filters before any aggregation.
 * Metadata is the v2 event snapshot; no provider-side catalogue join exists.
 */
function scopedEvents(query: PostHogJourneyQuery, albumKeys: string[]): string {
	const albumPredicate = albumKeys.length
		? `${eventProperty('album_key')} IN (${albumKeys.map(quoted).join(', ')})`
		: '1 = 0';
	const filters = [
		`event IN (${['album_exposed', 'album_opened', 'photo_exposed', 'photo_rendered', 'photo_opened', 'photo_load_failed', 'favorite_added', 'download_requested', 'download_prepared', 'download_handed_off', 'download_failed', 'search_results_shown', 'search_result_selected', 'experiment_exposed', 'gallery_page_viewed'].map(quoted).join(', ')})`,
		`toString(${eventProperty('schema_version')}) = '2'`,
		`${eventProperty('traffic_context')} = 'audience'`,
		`${eventProperty('visit_id')} != ''`,
		`toDate(toTimeZone(timestamp, ${quoted(CHICAGO)})) BETWEEN toDate(${quoted(query.start)}) AND toDate(${quoted(query.end)})`,
		albumPredicate
	];
	if (query.source) filters.push(`${eventProperty('tagged_source')} = ${quoted(query.source)}`);
	if (query.sport) filters.push(`${eventProperty('album_sport')} = ${quoted(query.sport)}`);
	if (query.category) filters.push(`${eventProperty('photo_category')} = ${quoted(query.category)}`);
	return `WITH scoped AS (SELECT event, timestamp, ${eventProperty('visit_id')} AS visit_id, ${eventProperty('album_key')} AS album_key, ${eventProperty('photo_id')} AS photo_id, ${eventProperty('search_id')} AS search_id, ${eventProperty('download_request_id')} AS download_request_id, distinct_id AS browser_id, ${eventProperty('tagged_source')} AS tagged_source, ${eventProperty('result_count')} AS result_count, ${eventProperty('duration_ms')} AS duration_ms, ${eventProperty('experiment_key')} AS experiment_key, ${eventProperty('variant')} AS variant FROM events WHERE ${filters.join(' AND ')}), sequenced AS (SELECT *, minIfOrNull(timestamp, event = 'album_exposed') OVER (PARTITION BY visit_id, album_key) AS album_exposed_at, minIfOrNull(timestamp, event = 'album_opened') OVER (PARTITION BY visit_id, album_key) AS album_opened_at, minIfOrNull(timestamp, event = 'photo_rendered') OVER (PARTITION BY visit_id, album_key) AS photo_rendered_at, minIfOrNull(timestamp, event = 'photo_exposed') OVER (PARTITION BY visit_id, photo_id) AS photo_exposed_at, minIfOrNull(timestamp, event = 'search_results_shown') OVER (PARTITION BY visit_id, search_id) AS search_results_at, minIfOrNull(timestamp, event = 'download_requested') OVER (PARTITION BY download_request_id) AS download_requested_at, minIfOrNull(timestamp, event = 'gallery_page_viewed' AND tagged_source != '') OVER (PARTITION BY visit_id) AS tagged_arrival_at, minIfOrNull(timestamp, event = 'experiment_exposed') OVER (PARTITION BY visit_id, experiment_key, variant) AS experiment_exposed_at FROM scoped)`;
}

function reportSql(report: PostHogJourneyReport): string {
	const sql: Record<PostHogJourneyReport, string> = {
		discovery: `SELECT uniqExact(visit_id) AS eligible_visits, uniqExactIf(visit_id, event = 'album_exposed') AS album_exposed_visits, uniqExactIf(visit_id, event = 'album_opened' AND timestamp > album_exposed_at) AS album_opened_after_exposure, uniqExactIf(visit_id, event = 'album_opened' AND album_exposed_at IS NULL) AS direct_album_open_visits FROM sequenced`,
		album_use: `SELECT uniqExactIf(visit_id, event = 'album_opened') AS album_open_visits, uniqExactIf(visit_id, event = 'photo_rendered' AND timestamp > album_opened_at) AS photo_render_visits, uniqExactIf(visit_id, event IN ('favorite_added', 'download_requested') AND timestamp > photo_rendered_at) AS album_action_visits FROM sequenced`,
		search_usefulness: `SELECT countIf(event = 'search_results_shown') AS searches_shown, countIf(event = 'search_results_shown' AND toInt64OrZero(result_count) = 0) AS zero_result_searches, countIf(event = 'search_result_selected' AND timestamp > search_results_at) AS selected_searches, avgIf(toFloat64OrNull(duration_ms), event = 'search_result_selected' AND timestamp > search_results_at) AS selection_duration_ms FROM sequenced`,
		download_reliability: `SELECT uniqExactIf(download_request_id, event = 'download_requested') AS requests, uniqExactIf(download_request_id, event = 'download_prepared' AND timestamp > download_requested_at) AS prepared, uniqExactIf(download_request_id, event = 'download_handed_off' AND timestamp > download_requested_at) AS handed_off, uniqExactIf(download_request_id, event = 'download_failed' AND timestamp > download_requested_at) AS failed, uniqExactIf(download_request_id, event = 'download_requested' AND download_request_id NOT IN (SELECT download_request_id FROM scoped WHERE event IN ('download_handed_off', 'download_failed'))) AS unknown_terminal_outcome FROM sequenced`,
		photo_response: `SELECT uniqExactIf(concat(visit_id, ':', photo_id), event = 'photo_exposed') AS eligible_photo_exposures, uniqExactIf(concat(visit_id, ':', photo_id), event IN ('photo_opened', 'favorite_added', 'download_requested') AND timestamp > photo_exposed_at) AS later_photo_actions FROM sequenced`,
		sources_return: `SELECT uniqExactIf(visit_id, event = 'gallery_page_viewed' AND tagged_source != '') AS tagged_arrival_visits, uniqExactIf(visit_id, event IN ('album_opened', 'photo_opened', 'favorite_added', 'download_requested') AND timestamp > tagged_arrival_at) AS tagged_arrival_action_visits, uniqExactIf(browser_id, browser_id IN (SELECT browser_id FROM scoped GROUP BY browser_id HAVING uniqExact(visit_id) > 1)) AS returning_measured_browsers FROM sequenced`,
		experiments: `SELECT uniqExactIf(concat(visit_id, ':', experiment_key, ':', variant), event = 'experiment_exposed') AS observed_exposures, uniqExactIf(visit_id, event IN ('album_opened', 'photo_opened', 'download_requested') AND timestamp > experiment_exposed_at) AS outcome_visits, uniqExactIf(visit_id, event IN ('photo_load_failed', 'download_failed') AND timestamp > experiment_exposed_at) AS guardrail_failures FROM sequenced`
	};
	return sql[report];
}

export function buildPostHogJourneyQuery(query: PostHogJourneyQuery, allowedAlbumKeys: string[]): { kind: 'HogQLQuery'; query: string } | null {
	const checked = validatedQuery(query, allowedAlbumKeys);
	if (!checked) return null;
	return { kind: 'HogQLQuery', query: `${scopedEvents(checked.value, checked.albumKeys)} ${reportSql(checked.value.report)}` };
}

function aggregateFromResponse(report: PostHogJourneyReport, response: unknown): Record<string, number | null> | null {
	if (!response || typeof response !== 'object') return null;
	const source = response as { columns?: unknown; results?: unknown };
	if (!Array.isArray(source.columns) || !Array.isArray(source.results) || !Array.isArray(source.results[0])) return null;
	const totals = emptyTotals(report);
	for (const [index, column] of source.columns.entries()) {
		if (typeof column !== 'string' || !(column in totals)) continue;
		const value = source.results[0][index];
		totals[column] = typeof value === 'number' && Number.isFinite(value) ? value : null;
	}
	return totals;
}

export async function queryGalleryJourneys(
	client: PostHogQueryTransport | null,
	query: PostHogJourneyQuery,
	options: { publicOnly: boolean; allowedAlbumKeys: string[] }
): Promise<JourneyAggregate> {
	const base = {
		report: query.report,
		asOf: null,
		coverage: { start: query.start, end: query.end, timezone: CHICAGO, definitionVersion: 2 as const, cohort: 'eligible audience events with a linked visit' as const, excluded: 'operator, test, crawler, suspected automation, opted-out, and unlinked events' as const, metadata: 'event snapshots only; no PostHog catalogue join' as const },
		totals: emptyTotals(query.report)
	};
	const fixed = buildPostHogJourneyQuery(query, options.allowedAlbumKeys);
	if (!fixed) return { ...base, available: false, error: 'invalid_query' };
	if (!client) return { ...base, available: false, error: 'provider_unavailable' };
	try {
		const response = await client.query({ query: fixed });
		const totals = aggregateFromResponse(query.report, response);
		if (!totals) return { ...base, available: false, error: 'provider_query_failed' };
		return { ...base, available: true, asOf: new Date().toISOString(), totals };
	} catch {
		return { ...base, available: false, error: 'provider_query_failed' };
	}
}

/** Query credentials are separate from capture credentials and never leave server code. */
export function createPostHogQueryTransport(source: Record<string, string | undefined>): PostHogQueryTransport | null {
	const apiKey = source.POSTHOG_QUERY_API_KEY?.trim();
	const projectId = source.POSTHOG_PROJECT_ID?.trim();
	const host = source.POSTHOG_HOST?.trim();
	if (!apiKey || !projectId || !host || !/^\d+$/.test(projectId)) return null;
	let origin: string;
	try { origin = new URL(host).origin; } catch { return null; }
	return {
		async query(body) {
			const response = await fetch(`${origin}/api/projects/${projectId}/query/`, {
				method: 'POST',
				headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
				body: JSON.stringify(body), signal: AbortSignal.timeout(5_000)
			});
			if (!response.ok) throw new Error(`PostHog query failed with ${response.status}`);
			return response.json();
		}
	};
}

/** Reconciliation only confirms provider-returned UUIDs; it never treats capture success as confirmation. */
export async function reconcilePostHogEventIds(
	transport: PostHogQueryTransport | null,
	eventIds: string[], confirm: (ids: string[]) => Promise<void>
): Promise<{ available: boolean; confirmed: number }> {
	const ids = [...new Set(eventIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 100);
	if (!transport || ids.length === 0) return { available: !!transport, confirmed: 0 };
	const query = `SELECT uuid FROM events WHERE uuid IN (${ids.map(quoted).join(', ')}) LIMIT 100`;
	try {
		const result = await transport.query({ query: { kind: 'HogQLQuery', query } }) as { results?: unknown };
		const confirmed = Array.isArray(result.results) ? result.results.map((row) => Array.isArray(row) ? row[0] : null).filter((id): id is string => typeof id === 'string' && ids.includes(id)) : [];
		if (confirmed.length) await confirm(confirmed);
		return { available: true, confirmed: confirmed.length };
	} catch {
		return { available: false, confirmed: 0 };
	}
}
