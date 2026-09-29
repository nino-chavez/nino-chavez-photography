import type {
	JourneyAggregate,
	PostHogEventName,
	PostHogJourneyQuery,
	PostHogJourneyReport,
	PostHogOutboxClient,
	PostHogQueryTransport
} from './posthog.types';
import type { SourceReturnBreakdownRow } from './posthog.types';
import { POSTHOG_EVENT_NAMES, POSTHOG_JOURNEY_REPORTS } from './posthog.types';
import { isPostHogProductionRuntime } from './posthog-contract';

const CHICAGO = 'America/Chicago' as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SITEWIDE_EVENTS: readonly PostHogEventName[] = [
	'gallery_page_viewed', 'search_submitted', 'search_results_shown', 'search_failed',
	'filters_applied', 'experiment_exposed'
];
const DOWNLOAD_LIFECYCLE_EVENTS: readonly PostHogEventName[] = [
	'download_requested', 'download_prepared', 'download_handed_off', 'download_failed', 'download_cancelled'
];

export interface PostHogFixtureEvent {
	event: PostHogEventName | 'analytics_classification_changed';
	eventId?: string;
	timestamp: string;
	distinctId: string;
	properties: Record<string, string | number | boolean>;
}

function quoted(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

function eventProperty(name: string): string {
	return `properties.${name}`;
}

function boundedText(value: string, maxLength = 160): boolean {
	return value.length > 0 && value.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(value);
}

function validDate(value: string): boolean {
	if (!DATE.test(value)) return false;
	const parsed = new Date(`${value}T12:00:00Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function emptyTotals(report: PostHogJourneyReport): Record<string, number | null> {
	const reportTotals: Record<PostHogJourneyReport, string[]> = {
		discovery: ['eligible_visits', 'album_exposed_visits', 'album_opened_after_exposure', 'direct_album_open_visits'],
		album_use: ['album_open_visits', 'photo_render_visits', 'album_action_visits'],
		search_usefulness: ['searches_shown', 'zero_result_searches', 'selected_searches', 'selection_duration_ms'],
		download_reliability: [
			'requests', 'prepared', 'handed_off', 'failed', 'cancelled', 'unknown_terminal_outcome',
			'single_photo_requests', 'saved_photo_zip_requests', 'album_zip_requests',
			'requested_items', 'prepared_items',
			'single_photo_requested_items', 'single_photo_prepared_items',
			'saved_photo_zip_requested_items', 'saved_photo_zip_prepared_items',
			'album_zip_requested_items', 'album_zip_prepared_items'
		],
		photo_response: ['eligible_photo_exposures', 'later_photo_actions'],
		sources_return: [
			'measured_browsers', 'before_window_returning_browsers', 'repeated_visit_browsers_in_window',
			'tagged_arrival_visits', 'tagged_arrival_browsers',
			'subsequent_album_open_visits', 'subsequent_photo_open_visits',
			'subsequent_download_request_visits', 'subsequent_favorite_visits'
		],
		experiments: ['observed_exposures', 'outcome_visits', 'guardrail_failures']
	};
	return Object.fromEntries(reportTotals[report].map((key) => [key, null]));
}

function validReport(report: string): report is PostHogJourneyReport {
	return (POSTHOG_JOURNEY_REPORTS as readonly string[]).includes(report);
}

function validatedQuery(query: PostHogJourneyQuery, allowedAlbumKeys: string[]): { value: PostHogJourneyQuery; albumKeys: string[] } | null {
	if (!validReport(query.report) || !validDate(query.start) || !validDate(query.end) || query.start > query.end) return null;
	const range = (Date.parse(`${query.end}T12:00:00Z`) - Date.parse(`${query.start}T12:00:00Z`)) / 86_400_000;
	if (range > 366 || !allowedAlbumKeys.every((key) => boundedText(key))) return null;
	if (query.report === 'sources_return' && range > 89) return null;
	if ([query.source, query.sport, query.category].some(value => value != null && !boundedText(value))) return null;
	const requested = query.albumKeys ?? allowedAlbumKeys;
	if (!requested.every((key) => boundedText(key)) || requested.some((key) => !allowedAlbumKeys.includes(key))) return null;
	return { value: query, albumKeys: [...new Set(requested)] };
}

/**
 * Every report first applies the latest provider correction for each original
 * UUID. A correction is ordered by its positive classification version, never
 * by its delivery time. Only audience and unclassified originals remain.
 * Target filters apply to the event row itself; a source filter applies only to
 * a tagged gallery arrival for the same visit. Neither rule widens to an
 * arbitrary action elsewhere in that visit.
 */
function scopedEvents(query: PostHogJourneyQuery, albumKeys: string[]): string {
	const albumPredicate = albumKeys.length
		? `album_key IN (${albumKeys.map(quoted).join(', ')})`
		: '1 = 0';
	const localDate = `toDate(toTimeZone(timestamp, ${quoted(CHICAGO)}))`;
	const datePredicate = query.report === 'sources_return'
		? `${localDate} BETWEEN addDays(toDate(${quoted(query.start)}), -90) AND toDate(${quoted(query.end)})`
		: `${localDate} BETWEEN toDate(${quoted(query.start)}) AND toDate(${quoted(query.end)})`;
	const activityFilters = [
		`event IN (${POSTHOG_EVENT_NAMES.map(quoted).join(', ')})`,
		`toString(${eventProperty('schema_version')}) = '2'`,
		`${eventProperty('traffic_context')} = 'audience'`,
		`${eventProperty('visit_id')} != ''`,
		datePredicate
	];
	const targetFilters = [
		albumPredicate,
		...(query.sport ? [`album_sport = ${quoted(query.sport)}`] : []),
		...(query.category ? [`photo_category = ${quoted(query.category)}`] : [])
	];
	const targetPredicate = `album_key != '' AND ${targetFilters.join(' AND ')}`;
	const hasTargetSlice = query.albumKeys !== undefined || !!query.sport || !!query.category;
	const sourceVisitPredicate = query.source
		? `visit_id IN (SELECT visit_id FROM tagged_arrivals WHERE source = ${quoted(query.source)})`
		: '1 = 1';
	const sitewide = SITEWIDE_EVENTS.map(quoted).join(', ');
	const downloadLifecycle = DOWNLOAD_LIFECYCLE_EVENTS.map(quoted).join(', ');
	return `WITH activity_candidates AS (SELECT uuid AS event_id, event, timestamp, ${localDate} AS local_date, coalesce(toString(${eventProperty('visit_id')}), '') AS visit_id, coalesce(toString(${eventProperty('album_key')}), '') AS album_key, coalesce(toString(${eventProperty('photo_id')}), '') AS photo_id, coalesce(toString(${eventProperty('search_id')}), '') AS search_id, coalesce(toString(${eventProperty('result_set_id')}), '') AS result_set_id, coalesce(toString(${eventProperty('download_request_id')}), '') AS download_request_id, coalesce(toString(${eventProperty('tagged_source')}), '') AS tagged_source, coalesce(toString(${eventProperty('album_sport')}), '') AS album_sport, coalesce(toString(${eventProperty('photo_category')}), '') AS photo_category, distinct_id AS browser_id, coalesce(toString(${eventProperty('mode')}), '') AS mode, toIntOrZero(toString(${eventProperty('result_count')})) AS result_count, coalesce(toString(${eventProperty('experiment_key')}), '') AS experiment_key, coalesce(toString(${eventProperty('variant')}), '') AS variant FROM events WHERE ${activityFilters.join(' AND ')}), latest_classifications AS (SELECT toString(properties.target_event_id) AS target_event_id, argMax(toString(properties.classification), toIntOrZero(toString(properties.classification_version))) AS classification FROM events WHERE event = 'analytics_classification_changed' AND toString(properties.target_event_id) IN (SELECT event_id FROM activity_candidates) AND toIntOrZero(toString(properties.classification_version)) > 0 GROUP BY target_event_id), base AS (SELECT activity_candidates.* FROM activity_candidates LEFT JOIN latest_classifications ON activity_candidates.event_id = latest_classifications.target_event_id WHERE coalesce(latest_classifications.classification, 'audience') IN ('audience', 'unclassified')), tagged_arrivals AS (SELECT visit_id, tagged_source AS source, min(timestamp) AS arrived_at FROM base WHERE event = 'gallery_page_viewed' AND tagged_source != '' GROUP BY visit_id, source), source_scoped AS (SELECT * FROM base WHERE ${sourceVisitPredicate}), target_events AS (SELECT * FROM source_scoped WHERE ${targetPredicate}), visible_search_selections AS (SELECT * FROM target_events WHERE event = 'search_result_selected' AND search_id != '' AND result_set_id != ''), visible_download_keys AS (SELECT visit_id, download_request_id FROM target_events WHERE event IN ('download_item_requested', 'download_item_prepared') AND download_request_id != '' GROUP BY visit_id, download_request_id), scoped AS (SELECT * FROM source_scoped WHERE ${targetPredicate} OR (${hasTargetSlice ? '1 = 0' : `event IN (${sitewide}) AND album_key = ''`}) OR (event IN (${downloadLifecycle}) AND album_key = '' AND (visit_id, download_request_id) IN (SELECT visit_id, download_request_id FROM visible_download_keys))), sequenced AS (SELECT *, minOrNull(if(event = 'album_exposed', timestamp, NULL)) OVER (PARTITION BY visit_id, album_key) AS album_exposed_at, minOrNull(if(event = 'album_opened', timestamp, NULL)) OVER (PARTITION BY visit_id, album_key) AS album_opened_at, minOrNull(if(event = 'photo_rendered', timestamp, NULL)) OVER (PARTITION BY visit_id, album_key) AS photo_rendered_at, minOrNull(if(event = 'photo_exposed', timestamp, NULL)) OVER (PARTITION BY visit_id, album_key, photo_id) AS photo_exposed_at, minOrNull(if(event = 'search_results_shown', timestamp, NULL)) OVER (PARTITION BY visit_id, search_id, result_set_id) AS search_results_at, minOrNull(if(event = 'download_requested', timestamp, NULL)) OVER (PARTITION BY visit_id, download_request_id) AS download_requested_at FROM scoped)`;
}

function reportSql(query: PostHogJourneyQuery): string {
	const searchScreenPredicate = query.albumKeys !== undefined || query.sport || query.category
		? `(visit_id, search_id, result_set_id) IN (SELECT visit_id, search_id, result_set_id FROM visible_search_selections)`
		: '1 = 1';
	const sql: Record<PostHogJourneyReport, string> = {
		discovery: `SELECT uniqExact(visit_id) AS eligible_visits, uniqExactIf(visit_id, event = 'album_exposed') AS album_exposed_visits, uniqExactIf(visit_id, event = 'album_opened' AND album_exposed_at IS NOT NULL AND timestamp > album_exposed_at) AS album_opened_after_exposure, uniqExactIf(visit_id, event = 'album_opened' AND (album_exposed_at IS NULL OR timestamp <= album_exposed_at)) AS direct_album_open_visits FROM sequenced`,
		album_use: `, album_opens AS (SELECT visit_id, album_key, min(timestamp) AS opened_at FROM scoped WHERE event = 'album_opened' GROUP BY visit_id, album_key), album_renders AS (SELECT opened.visit_id, opened.album_key, opened.opened_at, min(event.timestamp) AS rendered_at FROM album_opens opened INNER JOIN scoped event ON event.visit_id = opened.visit_id AND event.album_key = opened.album_key AND event.event = 'photo_rendered' AND event.timestamp > opened.opened_at GROUP BY opened.visit_id, opened.album_key, opened.opened_at), album_actions AS (SELECT rendered.visit_id, rendered.album_key FROM album_renders rendered INNER JOIN scoped event ON event.visit_id = rendered.visit_id AND event.album_key = rendered.album_key AND event.event IN ('favorite_added', 'download_requested', 'download_item_requested') AND event.timestamp > rendered.rendered_at GROUP BY rendered.visit_id, rendered.album_key) SELECT (SELECT uniqExact(visit_id) FROM album_opens) AS album_open_visits, (SELECT uniqExact(visit_id) FROM album_renders) AS photo_render_visits, (SELECT uniqExact(visit_id) FROM album_actions) AS album_action_visits`,
		search_usefulness: `, searches AS (SELECT visit_id, search_id, result_set_id AS shown_result_set_id, min(timestamp) AS shown_at, argMin(result_count, timestamp) AS shown_result_count FROM source_scoped WHERE event = 'search_results_shown' AND search_id != '' AND result_set_id != '' AND ${searchScreenPredicate} GROUP BY visit_id, search_id, result_set_id), selected_searches AS (SELECT search.visit_id, search.search_id, search.shown_result_set_id, search.shown_at, min(selection.timestamp) AS selected_at FROM searches search INNER JOIN visible_search_selections selection ON selection.visit_id = search.visit_id AND selection.search_id = search.search_id AND selection.result_set_id = search.shown_result_set_id AND selection.timestamp > search.shown_at GROUP BY search.visit_id, search.search_id, search.shown_result_set_id, search.shown_at) SELECT count() AS searches_shown, countIf(shown_result_count = 0) AS zero_result_searches, (SELECT count() FROM selected_searches) AS selected_searches, (SELECT avg(dateDiff('millisecond', shown_at, selected_at)) FROM selected_searches) AS selection_duration_ms FROM searches`,
		download_reliability: `, download_timeline AS (SELECT *, minOrNull(if(event = 'download_requested', timestamp, NULL)) OVER (PARTITION BY visit_id, download_request_id) AS requested_at FROM scoped WHERE download_request_id != ''), download_outcomes AS (SELECT visit_id, download_request_id, min(requested_at) AS request_at, argMin(if(event = 'download_requested', mode, NULL), timestamp) AS request_mode, countIf(event = 'download_prepared' AND timestamp >= requested_at) > 0 AS seen_prepared, countIf(event = 'download_handed_off' AND timestamp >= requested_at) > 0 AS seen_handed_off, countIf(event = 'download_failed' AND timestamp >= requested_at) > 0 AS seen_failed, countIf(event = 'download_cancelled' AND timestamp >= requested_at) > 0 AS seen_cancelled, uniqExactIf((album_key, photo_id), event = 'download_item_requested' AND timestamp >= requested_at) AS request_item_count, uniqExactIf((album_key, photo_id), event = 'download_item_prepared' AND timestamp >= requested_at) AS prepared_item_count FROM download_timeline WHERE requested_at IS NOT NULL GROUP BY visit_id, download_request_id) SELECT count() AS requests, countIf(seen_prepared) AS prepared, countIf(seen_handed_off) AS handed_off, countIf(seen_failed) AS failed, countIf(seen_cancelled) AS cancelled, countIf(NOT seen_handed_off AND NOT seen_failed AND NOT seen_cancelled) AS unknown_terminal_outcome, countIf(request_mode = 'single_photo') AS single_photo_requests, countIf(request_mode = 'saved_photo_zip') AS saved_photo_zip_requests, countIf(request_mode = 'album_zip') AS album_zip_requests, sum(request_item_count) AS requested_items, sum(prepared_item_count) AS prepared_items, sumIf(request_item_count, request_mode = 'single_photo') AS single_photo_requested_items, sumIf(prepared_item_count, request_mode = 'single_photo') AS single_photo_prepared_items, sumIf(request_item_count, request_mode = 'saved_photo_zip') AS saved_photo_zip_requested_items, sumIf(prepared_item_count, request_mode = 'saved_photo_zip') AS saved_photo_zip_prepared_items, sumIf(request_item_count, request_mode = 'album_zip') AS album_zip_requested_items, sumIf(prepared_item_count, request_mode = 'album_zip') AS album_zip_prepared_items FROM download_outcomes`,
		photo_response: `SELECT uniqExactIf((visit_id, album_key, photo_id), event = 'photo_exposed') AS eligible_photo_exposures, uniqExactIf((visit_id, album_key, photo_id), event IN ('photo_opened', 'favorite_added', 'download_requested', 'download_item_requested') AND photo_exposed_at IS NOT NULL AND timestamp > photo_exposed_at) AS later_photo_actions FROM sequenced`,
		sources_return: `, current_visits AS (SELECT browser_id, visit_id FROM scoped WHERE local_date BETWEEN toDate(${quoted(query.start)}) AND toDate(${quoted(query.end)}) GROUP BY browser_id, visit_id), current_browsers AS (SELECT browser_id, uniqExact(visit_id) AS visit_count FROM current_visits GROUP BY browser_id), before_window AS (SELECT browser_id FROM scoped WHERE local_date < toDate(${quoted(query.start)}) GROUP BY browser_id), current_arrivals AS (SELECT arrivals.visit_id, arrivals.source, arrivals.arrived_at, any(source_scoped.browser_id) AS browser_id FROM tagged_arrivals arrivals INNER JOIN source_scoped ON source_scoped.visit_id = arrivals.visit_id WHERE source_scoped.local_date BETWEEN toDate(${quoted(query.start)}) AND toDate(${quoted(query.end)}) GROUP BY arrivals.visit_id, arrivals.source, arrivals.arrived_at), source_actions AS (SELECT arrivals.visit_id, arrivals.source, arrivals.browser_id, event.event FROM current_arrivals arrivals INNER JOIN scoped event ON event.visit_id = arrivals.visit_id AND event.timestamp > arrivals.arrived_at WHERE event.event IN ('album_opened', 'photo_opened', 'download_requested', 'download_item_requested', 'favorite_added')), source_breakdown AS (SELECT arrival.source, uniqExact(arrival.visit_id) AS tagged_arrival_visits, uniqExact(arrival.browser_id) AS measured_browsers, uniqExactIf(arrival.browser_id, arrival.browser_id IN (SELECT browser_id FROM before_window)) AS before_window_returning_browsers, uniqExactIf(arrival.browser_id, arrival.browser_id IN (SELECT browser_id FROM current_browsers WHERE visit_count > 1)) AS repeated_visit_browsers_in_window, uniqExactIf(arrival.visit_id, action.event = 'album_opened') AS subsequent_album_open_visits, uniqExactIf(arrival.visit_id, action.event = 'photo_opened') AS subsequent_photo_open_visits, uniqExactIf(arrival.visit_id, action.event IN ('download_requested', 'download_item_requested')) AS subsequent_download_request_visits, uniqExactIf(arrival.visit_id, action.event = 'favorite_added') AS subsequent_favorite_visits FROM current_arrivals arrival LEFT JOIN scoped action ON action.visit_id = arrival.visit_id AND action.timestamp > arrival.arrived_at AND action.event IN ('album_opened', 'photo_opened', 'download_requested', 'download_item_requested', 'favorite_added') GROUP BY arrival.source ORDER BY tagged_arrival_visits DESC, arrival.source ASC LIMIT 20) SELECT 'overall' AS row_kind, '' AS source, (SELECT count() FROM current_browsers) AS measured_browsers, (SELECT countIf(browser_id IN (SELECT browser_id FROM before_window)) FROM current_browsers) AS before_window_returning_browsers, (SELECT countIf(visit_count > 1) FROM current_browsers) AS repeated_visit_browsers_in_window, (SELECT uniqExact(visit_id) FROM current_arrivals) AS tagged_arrival_visits, (SELECT uniqExact(browser_id) FROM current_arrivals) AS tagged_arrival_browsers, (SELECT uniqExact(visit_id) FROM source_actions WHERE event = 'album_opened') AS subsequent_album_open_visits, (SELECT uniqExact(visit_id) FROM source_actions WHERE event = 'photo_opened') AS subsequent_photo_open_visits, (SELECT uniqExact(visit_id) FROM source_actions WHERE event IN ('download_requested', 'download_item_requested')) AS subsequent_download_request_visits, (SELECT uniqExact(visit_id) FROM source_actions WHERE event = 'favorite_added') AS subsequent_favorite_visits UNION ALL SELECT 'source' AS row_kind, source, measured_browsers, before_window_returning_browsers, repeated_visit_browsers_in_window, tagged_arrival_visits, measured_browsers AS tagged_arrival_browsers, subsequent_album_open_visits, subsequent_photo_open_visits, subsequent_download_request_visits, subsequent_favorite_visits FROM source_breakdown`,
		experiments: `, exposures AS (SELECT visit_id, experiment_key, variant, min(timestamp) AS exposed_at FROM scoped WHERE event = 'experiment_exposed' AND experiment_key != '' AND variant != '' GROUP BY visit_id, experiment_key, variant), outcome_exposures AS (SELECT exposure.visit_id, exposure.experiment_key, exposure.variant FROM exposures exposure INNER JOIN scoped event ON event.visit_id = exposure.visit_id AND event.event IN ('album_opened', 'photo_opened', 'download_requested', 'download_item_requested') AND event.timestamp > exposure.exposed_at GROUP BY exposure.visit_id, exposure.experiment_key, exposure.variant), guardrail_exposures AS (SELECT exposure.visit_id, exposure.experiment_key, exposure.variant FROM exposures exposure INNER JOIN scoped event ON event.visit_id = exposure.visit_id AND event.event IN ('photo_load_failed', 'download_failed') AND event.timestamp > exposure.exposed_at GROUP BY exposure.visit_id, exposure.experiment_key, exposure.variant) SELECT count() AS observed_exposures, (SELECT count() FROM outcome_exposures) AS outcome_visits, (SELECT count() FROM guardrail_exposures) AS guardrail_failures FROM exposures`
	};
	return sql[query.report];
}

function chicagoDate(timestamp: string): string | null {
	const instant = new Date(timestamp);
	if (Number.isNaN(instant.getTime())) return null;
	return new Intl.DateTimeFormat('en-CA', { timeZone: CHICAGO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

function textProperty(event: PostHogFixtureEvent, name: string): string {
	const value = event.properties[name];
	return typeof value === 'string' ? value : '';
}

function fixtureScope(events: PostHogFixtureEvent[], query: PostHogJourneyQuery, albumKeys: string[]): PostHogFixtureEvent[] {
	const earliest = query.report === 'sources_return' ? (() => {
		const day = new Date(`${query.start}T12:00:00Z`);
		day.setUTCDate(day.getUTCDate() - 90);
		return day.toISOString().slice(0, 10);
	})() : query.start;
	const classifications = new Map<string, { version: number; classification: string }>();
	for (const event of events) {
		if (event.event !== 'analytics_classification_changed') continue;
		const target = textProperty(event, 'target_event_id');
		const version = Number(event.properties.classification_version);
		const classification = textProperty(event, 'classification');
		if (!target || !Number.isInteger(version) || version <= 0) continue;
		const current = classifications.get(target);
		if (!current || version > current.version) classifications.set(target, { version, classification });
	}
	const base = events.filter((event, index) => {
		const date = chicagoDate(event.timestamp);
		const correction = classifications.get(event.eventId ?? `fixture-${index}`);
		return event.event !== 'analytics_classification_changed'
			&& (POSTHOG_EVENT_NAMES as readonly string[]).includes(event.event)
			&& event.properties.schema_version === 2
			&& event.properties.traffic_context === 'audience'
			&& (!correction || correction.classification === 'audience' || correction.classification === 'unclassified')
			&& textProperty(event, 'visit_id') !== ''
			&& date !== null && date >= earliest && date <= query.end;
	});
	const sourceArrivals = new Map<string, Set<string>>();
	for (const event of base) {
		if (event.event !== 'gallery_page_viewed') continue;
		const source = textProperty(event, 'tagged_source');
		if (!source) continue;
		const visits = sourceArrivals.get(source) ?? new Set<string>();
		visits.add(textProperty(event, 'visit_id'));
		sourceArrivals.set(source, visits);
	}
	const sourceVisits = query.source ? sourceArrivals.get(query.source) ?? new Set<string>() : null;
	const inSourceVisit = (event: PostHogFixtureEvent) => !sourceVisits || sourceVisits.has(textProperty(event, 'visit_id'));
	const hasTargetSlice = query.albumKeys !== undefined || !!query.sport || !!query.category;
	const isTarget = (event: PostHogFixtureEvent) => inSourceVisit(event)
		&& albumKeys.includes(textProperty(event, 'album_key'))
		&& (!query.sport || textProperty(event, 'album_sport') === query.sport)
		&& (!query.category || textProperty(event, 'photo_category') === query.category);
	const visibleRequests = new Set(base.filter((event) =>
		(event.event === 'download_item_requested' || event.event === 'download_item_prepared')
		&& isTarget(event)
	).map((event) => `${textProperty(event, 'visit_id')}\u0000${textProperty(event, 'download_request_id')}`));
	const visible = base.filter((event) => {
		const albumKey = textProperty(event, 'album_key');
		if (!inSourceVisit(event)) return false;
		if (isTarget(event)) return true;
		if (query.report === 'sources_return' && event.event === 'gallery_page_viewed' && textProperty(event, 'tagged_source') !== '') return true;
		if (!hasTargetSlice && (SITEWIDE_EVENTS as readonly string[]).includes(event.event)) return albumKey === '';
		return (DOWNLOAD_LIFECYCLE_EVENTS as readonly string[]).includes(event.event) && albumKey === ''
			&& visibleRequests.has(`${textProperty(event, 'visit_id')}\u0000${textProperty(event, 'download_request_id')}`);
	});
	if (!hasTargetSlice) return visible;
	const selectedResultSets = new Set(base.filter((event) => event.event === 'search_result_selected' && isTarget(event)).map((event) =>
		`${textProperty(event, 'visit_id')}\u0000${textProperty(event, 'search_id')}\u0000${textProperty(event, 'result_set_id')}`
	));
	return [...visible, ...base.filter((event) => event.event === 'search_results_shown' && inSourceVisit(event)
		&& selectedResultSets.has(`${textProperty(event, 'visit_id')}\u0000${textProperty(event, 'search_id')}\u0000${textProperty(event, 'result_set_id')}`))];
}

/** Executes the source-owned report plan over synthetic events for semantic regression tests. */
export function evaluatePostHogJourneyFixtures(
	query: PostHogJourneyQuery,
	allowedAlbumKeys: string[],
	events: PostHogFixtureEvent[]
): Record<string, number | null> | null {
	const checked = validatedQuery(query, allowedAlbumKeys);
	if (!checked) return null;
	const scoped = fixtureScope(events, checked.value, checked.albumKeys);
	if (query.report === 'discovery') {
		const paths = new Map<string, { visit: string; exposedAt?: number; openedAt?: number }>();
		for (const event of [...scoped].sort((left, right) => left.timestamp.localeCompare(right.timestamp))) {
			if (event.event !== 'album_exposed' && event.event !== 'album_opened') continue;
			const visit = textProperty(event, 'visit_id');
			const key = `${visit}\u0000${textProperty(event, 'album_key')}`;
			const path = paths.get(key) ?? { visit };
			const at = Date.parse(event.timestamp);
			if (event.event === 'album_exposed' && path.exposedAt === undefined) path.exposedAt = at;
			if (event.event === 'album_opened' && path.openedAt === undefined) path.openedAt = at;
			paths.set(key, path);
		}
		const values = [...paths.values()];
		return {
			eligible_visits: new Set(scoped.map((event) => textProperty(event, 'visit_id'))).size,
			album_exposed_visits: new Set(values.filter((path) => path.exposedAt !== undefined).map((path) => path.visit)).size,
			album_opened_after_exposure: new Set(values.filter((path) => path.openedAt !== undefined && path.exposedAt !== undefined && path.openedAt > path.exposedAt).map((path) => path.visit)).size,
			direct_album_open_visits: new Set(values.filter((path) => path.openedAt !== undefined && (path.exposedAt === undefined || path.openedAt <= path.exposedAt)).map((path) => path.visit)).size
		};
	}
	if (query.report === 'album_use') {
		const paths = new Map<string, { visit: string; opened?: number; rendered?: number; action?: number }>();
		for (const event of scoped.sort((left, right) => left.timestamp.localeCompare(right.timestamp))) {
			const visit = textProperty(event, 'visit_id');
			const key = `${visit}\u0000${textProperty(event, 'album_key')}`;
			const path = paths.get(key) ?? { visit };
			const at = Date.parse(event.timestamp);
			if (event.event === 'album_opened' && path.opened === undefined) path.opened = at;
			if (event.event === 'photo_rendered' && path.opened !== undefined && at > path.opened && path.rendered === undefined) path.rendered = at;
			if (['favorite_added', 'download_requested', 'download_item_requested'].includes(event.event) && path.rendered !== undefined && at > path.rendered && path.action === undefined) path.action = at;
			paths.set(key, path);
		}
		return {
			album_open_visits: new Set([...paths.values()].filter((path) => path.opened !== undefined).map((path) => path.visit)).size,
			photo_render_visits: new Set([...paths.values()].filter((path) => path.rendered !== undefined).map((path) => path.visit)).size,
			album_action_visits: new Set([...paths.values()].filter((path) => path.action !== undefined).map((path) => path.visit)).size
		};
	}
	if (query.report === 'search_usefulness') {
		const searches = new Map<string, { visit: string; search: string; resultSet: string; shownAt: number; resultCount: number; selectedAt?: number }>();
		for (const event of scoped.sort((left, right) => left.timestamp.localeCompare(right.timestamp))) {
			const visit = textProperty(event, 'visit_id');
			const search = textProperty(event, 'search_id');
			const key = `${visit}\u0000${search}`;
			if (event.event === 'search_results_shown' && !searches.has(key)) {
				searches.set(key, { visit, search, resultSet: textProperty(event, 'result_set_id'), shownAt: Date.parse(event.timestamp), resultCount: Number(event.properties.result_count) });
			} else if (event.event === 'search_result_selected') {
				const found = searches.get(key);
				const at = Date.parse(event.timestamp);
				if (found && found.resultSet === textProperty(event, 'result_set_id') && at > found.shownAt && found.selectedAt === undefined) found.selectedAt = at;
			}
		}
		const selected = [...searches.values()].filter((search) => search.selectedAt !== undefined);
		return {
			searches_shown: searches.size,
			zero_result_searches: [...searches.values()].filter((search) => search.resultCount === 0).length,
			selected_searches: selected.length,
			selection_duration_ms: selected.length ? selected.reduce((total, search) => total + search.selectedAt! - search.shownAt, 0) / selected.length : null
		};
	}
	if (query.report === 'download_reliability') {
		type Mode = 'single_photo' | 'saved_photo_zip' | 'album_zip';
		type RequestState = { visit: string; request: string; mode: Mode; requestedAt: number; prepared: boolean; handedOff: boolean; failed: boolean; cancelled: boolean; requestedItems: Set<string>; preparedItems: Set<string> };
		const requests = new Map<string, RequestState>();
		const ordered = [...scoped].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
		for (const event of ordered) {
			if (event.event !== 'download_requested') continue;
			const visit = textProperty(event, 'visit_id');
			const request = textProperty(event, 'download_request_id');
			const mode = textProperty(event, 'mode');
			if (!request || !['single_photo', 'saved_photo_zip', 'album_zip'].includes(mode)) continue;
			const key = `${visit}\u0000${request}`;
			if (!requests.has(key)) requests.set(key, { visit, request, mode: mode as Mode, requestedAt: Date.parse(event.timestamp), prepared: false, handedOff: false, failed: false, cancelled: false, requestedItems: new Set(), preparedItems: new Set() });
		}
		for (const event of ordered) {
			const key = `${textProperty(event, 'visit_id')}\u0000${textProperty(event, 'download_request_id')}`;
			const request = requests.get(key);
			const at = Date.parse(event.timestamp);
			if (!request || at <= request.requestedAt) continue;
			if (event.event === 'download_prepared') request.prepared = true;
			if (event.event === 'download_handed_off') request.handedOff = true;
			if (event.event === 'download_failed') request.failed = true;
			if (event.event === 'download_cancelled') request.cancelled = true;
			const itemKey = `${textProperty(event, 'album_key')}\u0000${textProperty(event, 'photo_id')}`;
			if (event.event === 'download_item_requested') request.requestedItems.add(itemKey);
			if (event.event === 'download_item_prepared') request.preparedItems.add(itemKey);
		}
		const values = [...requests.values()];
		const itemCount = (mode: Mode, state: 'requestedItems' | 'preparedItems') => values.filter((request) => request.mode === mode).reduce((sum, request) => sum + request[state].size, 0);
		return {
			requests: values.length,
			prepared: values.filter((request) => request.prepared).length,
			handed_off: values.filter((request) => request.handedOff).length,
			failed: values.filter((request) => request.failed).length,
			cancelled: values.filter((request) => request.cancelled).length,
			unknown_terminal_outcome: values.filter((request) => !request.handedOff && !request.failed && !request.cancelled).length,
			single_photo_requests: values.filter((request) => request.mode === 'single_photo').length,
			saved_photo_zip_requests: values.filter((request) => request.mode === 'saved_photo_zip').length,
			album_zip_requests: values.filter((request) => request.mode === 'album_zip').length,
			requested_items: values.reduce((sum, request) => sum + request.requestedItems.size, 0),
			prepared_items: values.reduce((sum, request) => sum + request.preparedItems.size, 0),
			single_photo_requested_items: itemCount('single_photo', 'requestedItems'),
			single_photo_prepared_items: itemCount('single_photo', 'preparedItems'),
			saved_photo_zip_requested_items: itemCount('saved_photo_zip', 'requestedItems'),
			saved_photo_zip_prepared_items: itemCount('saved_photo_zip', 'preparedItems'),
			album_zip_requested_items: itemCount('album_zip', 'requestedItems'),
			album_zip_prepared_items: itemCount('album_zip', 'preparedItems')
		};
	}
	if (query.report === 'photo_response') {
		const exposures = new Map<string, { exposedAt: number; action: boolean }>();
		for (const event of [...scoped].sort((left, right) => left.timestamp.localeCompare(right.timestamp))) {
			const key = `${textProperty(event, 'visit_id')}\u0000${textProperty(event, 'album_key')}\u0000${textProperty(event, 'photo_id')}`;
			const at = Date.parse(event.timestamp);
			if (event.event === 'photo_exposed' && !exposures.has(key)) exposures.set(key, { exposedAt: at, action: false });
			if (['photo_opened', 'favorite_added', 'download_requested', 'download_item_requested'].includes(event.event)) {
				const exposure = exposures.get(key);
				if (exposure && at > exposure.exposedAt) exposure.action = true;
			}
		}
		return {
			eligible_photo_exposures: exposures.size,
			later_photo_actions: [...exposures.values()].filter((exposure) => exposure.action).length
		};
	}
	if (query.report === 'experiments') {
		const exposures = new Map<string, { visit: string; exposedAt: number; outcome: boolean; guardrail: boolean }>();
		for (const event of [...scoped].sort((left, right) => left.timestamp.localeCompare(right.timestamp))) {
			if (event.event !== 'experiment_exposed') continue;
			const visit = textProperty(event, 'visit_id');
			const key = `${visit}\u0000${textProperty(event, 'experiment_key')}\u0000${textProperty(event, 'variant')}`;
			if (!exposures.has(key)) exposures.set(key, { visit, exposedAt: Date.parse(event.timestamp), outcome: false, guardrail: false });
		}
		for (const event of scoped) {
			const at = Date.parse(event.timestamp);
			for (const exposure of exposures.values()) {
				if (textProperty(event, 'visit_id') !== exposure.visit || at <= exposure.exposedAt) continue;
				if (['album_opened', 'photo_opened', 'download_requested', 'download_item_requested'].includes(event.event)) exposure.outcome = true;
				if (['photo_load_failed', 'download_failed'].includes(event.event)) exposure.guardrail = true;
			}
		}
		return {
			observed_exposures: exposures.size,
			outcome_visits: [...exposures.values()].filter((exposure) => exposure.outcome).length,
			guardrail_failures: [...exposures.values()].filter((exposure) => exposure.guardrail).length
		};
	}
	if (query.report === 'sources_return') {
		const current = scoped.filter((event) => {
			const date = chicagoDate(event.timestamp);
			return date !== null && date >= query.start && date <= query.end;
		});
		const before = new Set(scoped.filter((event) => {
			const date = chicagoDate(event.timestamp);
			return date !== null && date < query.start;
		}).map((event) => event.distinctId));
		const visitsByBrowser = new Map<string, Set<string>>();
		for (const event of current) {
			const visits = visitsByBrowser.get(event.distinctId) ?? new Set<string>();
			visits.add(textProperty(event, 'visit_id'));
			visitsByBrowser.set(event.distinctId, visits);
		}
		const arrivals = new Map<string, { source: string; visit: string; browser: string; at: number }>();
		for (const event of current) {
			if (event.event !== 'gallery_page_viewed') continue;
			const source = textProperty(event, 'tagged_source');
			if (!source) continue;
			const key = `${textProperty(event, 'visit_id')}\u0000${source}`;
			const at = Date.parse(event.timestamp);
			const prior = arrivals.get(key);
			if (!prior || at < prior.at) arrivals.set(key, { source, visit: textProperty(event, 'visit_id'), browser: event.distinctId, at });
		}
		const actionVisits = {
			album: new Set<string>(), photo: new Set<string>(), download: new Set<string>(), favorite: new Set<string>()
		};
		for (const arrival of arrivals.values()) {
			for (const event of scoped) {
				if (textProperty(event, 'visit_id') !== arrival.visit || Date.parse(event.timestamp) <= arrival.at) continue;
				if (event.event === 'album_opened') actionVisits.album.add(arrival.visit);
				if (event.event === 'photo_opened') actionVisits.photo.add(arrival.visit);
				if (event.event === 'download_requested' || event.event === 'download_item_requested') actionVisits.download.add(arrival.visit);
				if (event.event === 'favorite_added') actionVisits.favorite.add(arrival.visit);
			}
		}
		return {
			measured_browsers: visitsByBrowser.size,
			before_window_returning_browsers: [...visitsByBrowser.keys()].filter((browser) => before.has(browser)).length,
			repeated_visit_browsers_in_window: [...visitsByBrowser.values()].filter((visits) => visits.size > 1).length,
			tagged_arrival_visits: new Set([...arrivals.values()].map((arrival) => arrival.visit)).size,
			tagged_arrival_browsers: new Set([...arrivals.values()].map((arrival) => arrival.browser)).size,
			subsequent_album_open_visits: actionVisits.album.size,
			subsequent_photo_open_visits: actionVisits.photo.size,
			subsequent_download_request_visits: actionVisits.download.size,
			subsequent_favorite_visits: actionVisits.favorite.size
		};
	}
	return null;
}

export function buildPostHogJourneyQuery(query: PostHogJourneyQuery, allowedAlbumKeys: string[]): { kind: 'HogQLQuery'; query: string } | null {
	const checked = validatedQuery(query, allowedAlbumKeys);
	if (!checked) return null;
	return { kind: 'HogQLQuery', query: `${scopedEvents(checked.value, checked.albumKeys)} ${reportSql(checked.value)}` };
}

/** Builds the rolling 30-day saved-insight query from the same reviewed report definition. */
export function buildPostHogDashboardQuery(
	report: PostHogJourneyReport,
	allowedAlbumKeys: string[]
): { kind: 'HogQLQuery'; query: string } | null {
	const start = '2000-01-01';
	const end = '2000-01-30';
	const fixed = buildPostHogJourneyQuery({ report, start, end }, allowedAlbumKeys);
	if (!fixed) return null;
	const today = `toDate(toTimeZone(now(), ${quoted(CHICAGO)}))`;
	return {
		kind: fixed.kind,
		query: fixed.query
			.replaceAll(`toDate(${quoted(start)})`, `addDays(${today}, -29)`)
			.replaceAll(`toDate(${quoted(end)})`, today)
	};
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

function sourceReturnBreakdownFromResponse(response: unknown): SourceReturnBreakdownRow[] {
	if (!response || typeof response !== 'object') return [];
	const source = response as { columns?: unknown; results?: unknown };
	if (!Array.isArray(source.columns) || !Array.isArray(source.results)) return [];
	const columns = source.columns as unknown[];
	const index = (name: string) => columns.indexOf(name);
	const rowKind = index('row_kind');
	const sourceName = index('source');
	const metric = (row: unknown[], name: keyof Omit<SourceReturnBreakdownRow, 'source'>) => {
		const value = row[index(name as string)];
		return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
	};
	if (rowKind < 0 || sourceName < 0) return [];
	return source.results.flatMap((row): SourceReturnBreakdownRow[] => {
		if (!Array.isArray(row) || row[rowKind] !== 'source' || typeof row[sourceName] !== 'string' || !boundedText(row[sourceName], 32)) return [];
		const values = {
			tagged_arrival_visits: metric(row, 'tagged_arrival_visits'),
			measured_browsers: metric(row, 'measured_browsers'),
			before_window_returning_browsers: metric(row, 'before_window_returning_browsers'),
			repeated_visit_browsers_in_window: metric(row, 'repeated_visit_browsers_in_window'),
			subsequent_album_open_visits: metric(row, 'subsequent_album_open_visits'),
			subsequent_photo_open_visits: metric(row, 'subsequent_photo_open_visits'),
			subsequent_download_request_visits: metric(row, 'subsequent_download_request_visits'),
			subsequent_favorite_visits: metric(row, 'subsequent_favorite_visits')
		};
		return Object.values(values).some((value) => value === null) ? [] : [{ source: row[sourceName], ...values } as SourceReturnBreakdownRow];
	}).slice(0, 20);
}

export async function queryGalleryJourneys(
	client: PostHogQueryTransport | null,
	query: PostHogJourneyQuery,
	options: { publicOnly: boolean; allowedAlbumKeys: string[] }
): Promise<JourneyAggregate> {
	const base = {
		report: query.report,
		asOf: null,
		coverage: { start: query.start, end: query.end, timezone: CHICAGO, definitionVersion: 2 as const, cohort: 'eligible audience or unclassified originals with a linked visit; source slices require a tagged gallery arrival' as const, excluded: 'latest operator, test, crawler, suspected-automation, self-excluded, ineligible, and unlinked classifications' as const, metadata: 'event snapshots only; missing snapshots remain unknown; no PostHog catalogue join' as const },
		totals: emptyTotals(query.report),
		breakdown: [] as SourceReturnBreakdownRow[]
	};
	if (!options.publicOnly) return { ...base, available: false, error: 'invalid_query' };
	const fixed = buildPostHogJourneyQuery(query, options.allowedAlbumKeys);
	if (!fixed) return { ...base, available: false, error: 'invalid_query' };
	if (!client) return { ...base, available: false, error: 'provider_unavailable' };
	try {
		const response = await client.query({ query: fixed });
		const totals = aggregateFromResponse(query.report, response);
		if (!totals) return { ...base, available: false, error: 'provider_query_failed' };
		return { ...base, available: true, asOf: new Date().toISOString(), totals, breakdown: query.report === 'sources_return' ? sourceReturnBreakdownFromResponse(response) : [] };
	} catch {
		return { ...base, available: false, error: 'provider_query_failed' };
	}
}

/** Query credentials are separate from capture credentials and never leave server code. */
export function createPostHogQueryTransport(source: Record<string, string | undefined>): PostHogQueryTransport | null {
	if (!isPostHogProductionRuntime(source)) return null;
	const apiKey = source.POSTHOG_QUERY_API_KEY?.trim();
	const projectId = source.POSTHOG_PROJECT_ID?.trim();
	const host = source.POSTHOG_HOST?.trim();
	if (!apiKey || !projectId || !host || !/^\d+$/.test(projectId)) return null;
	let origin: string;
	try {
		const parsed = new URL(host);
		if (parsed.protocol !== 'https:') return null;
		origin = parsed.origin.replace('.i.posthog.com', '.posthog.com');
	} catch { return null; }
	return {
		async query(body) {
			const headers = { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' };
			const endpoint = `${origin}/api/projects/${projectId}/query/`;
			const response = await fetch(endpoint, {
				method: 'POST', headers,
				body: JSON.stringify({ refresh: 'async', ...(body as object) }), signal: AbortSignal.timeout(10000)
			});
			if (!response.ok) throw new Error(`PostHog query failed with ${response.status}`);
			let result = await response.json() as {results?: unknown; query_status?: {id?: string; complete?: boolean; error?: boolean; results?: unknown}};
			if (Array.isArray(result.results)) return result;
			const id = result.query_status?.id;
			if (!id) throw new Error('PostHog query status unavailable');
			for (let attempt = 0; attempt < 12; attempt++) {
				await new Promise((resolve) => setTimeout(resolve, 600));
				const poll = await fetch(`${endpoint}${encodeURIComponent(id)}/`, {headers, signal: AbortSignal.timeout(10000)});
				if (!poll.ok) throw new Error(`PostHog query status failed with ${poll.status}`);
				result = await poll.json() as typeof result;
				if (result.query_status?.error) throw new Error('PostHog query failed');
				if (result.query_status?.complete) return result.query_status.results;
			}
			throw new Error('PostHog query pending');
		}
	};
}

/** Reconciliation only confirms provider-returned UUIDs; it never treats capture success as confirmation. */
export async function reconcilePostHogEventIds(
	transport: PostHogQueryTransport | null,
	eventIds: string[],
	confirm: (ids: string[]) => Promise<void>,
	requeueMissing?: (ids: string[]) => Promise<void>
): Promise<{ available: boolean; requested: number; confirmed: number; missing: number }> {
	const ids = [...new Set(eventIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 100);
	if (!transport || ids.length === 0) return { available: !!transport, requested: ids.length, confirmed: 0, missing: ids.length };
	const query = `SELECT uuid FROM events WHERE uuid IN (${ids.map(quoted).join(', ')}) LIMIT 100`;
	try {
		const result = await transport.query({ refresh: 'force_async', query: { kind: 'HogQLQuery', query } }) as { results?: unknown };
		const confirmed = Array.isArray(result.results) ? result.results.map((row) => Array.isArray(row) ? row[0] : null).filter((id): id is string => typeof id === 'string' && ids.includes(id)) : [];
		if (confirmed.length) await confirm(confirmed);
		const missingIds = ids.filter((id) => !confirmed.includes(id));
		// A successful provider read is the only point at which a missing ID may
		// be requeued. The database RPC keeps grace, consent, retention, and
		// attempt guards authoritative; a requeue failure does not erase the read.
		if (missingIds.length && requeueMissing) {
			try { await requeueMissing(missingIds); } catch { /* retry remains durable */ }
		}
		return { available: true, requested: ids.length, confirmed: confirmed.length, missing: ids.length - confirmed.length };
	} catch {
		return { available: false, requested: ids.length, confirmed: 0, missing: ids.length };
	}
}

/** Reconciles the durable submitted backlog, including rows from earlier scheduler runs. */
export async function reconcileSubmittedPostHogEvents(
	transport: PostHogQueryTransport | null,
	outbox: PostHogOutboxClient,
	limit = 100
): Promise<{ available: boolean; requested: number; confirmed: number; missing: number }> {
	const ids = await outbox.submitted(Math.min(Math.max(limit, 1), 100));
	return reconcilePostHogEventIds(transport, ids, (confirmed) => outbox.confirm(confirmed), outbox.requeueMissing);
}
