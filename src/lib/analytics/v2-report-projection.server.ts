import { dateOnly, type ReportQuery } from './report-contract';
import { POSTHOG_EVENT_NAMES, type PostHogEventName, type PostHogTrafficContext } from './posthog.types';
import type { SupabaseClient } from '@supabase/supabase-js';

type Dimensions = Record<string, unknown>;

/** Identifier-free raw input. This shape never leaves the server module. */
export interface V2ReportEvent {
	event_id?: string;
	event_name: PostHogEventName;
	occurred_at: string;
	album_key: string | null;
	photo_id: string | null;
	traffic_context: PostHogTrafficContext | 'self_excluded';
	classification?: string | null;
	properties: Dimensions;
}

/** Identifier-free archive input. Archive rows are aggregate snapshots, not visits. */
export interface V2ArchivedTotal {
	bucket_date: string;
	event_name: PostHogEventName;
	traffic_context: PostHogTrafficContext | 'self_excluded' | 'known_crawler' | 'suspected_automation' | 'unclassified';
	album_key: string | null;
	photo_id: string | null;
	dimensions: Dimensions;
	event_count: number;
	export_eligible_count: number;
	last_recorded_at: string;
}

export interface V2ReportProjection {
	available: boolean;
	coverage: {
		start: string;
		end: string;
		firstRecordedAt: string | null;
		rawRetainedFrom: string | null;
		archivedFrom: string | null;
		archivedThrough: string | null;
		label: string;
	};
	counts: Array<{ event: PostHogEventName; label: string; count: number }>;
}

export interface V2ProjectionOptions {
	/** Resolved from current visibility before aggregation. Visibility is the one current fact. */
	publicAlbumKeys: readonly string[];
}

export interface V2CoverageBounds {
	firstRecordedAt: string | null;
	rawRetainedFrom: string | null;
	archivedFrom: string | null;
	archivedThrough: string | null;
}

const labels: Record<PostHogEventName, string> = {
	site_page_viewed: 'Site pages viewed', site_link_clicked: 'Site links clicked', content_progressed: 'Reading progress signals', content_active_time: 'Active reading time signals', demo_section_viewed: 'Demo sections reached',
	gallery_page_viewed: 'Gallery pages viewed', album_exposed: 'Albums exposed', album_opened: 'Albums opened',
	photo_exposed: 'Photos exposed', photo_opened: 'Photos opened', photo_rendered: 'Photos rendered', photo_load_failed: 'Photo loads failed',
	favorite_added: 'Favorites added', favorite_removed: 'Favorites removed', share_action: 'Share actions (all outcomes)',
	download_requested: 'Download requests', download_item_requested: 'Download items requested', download_item_prepared: 'Download items prepared',
	download_prepared: 'Downloads prepared', download_handed_off: 'Downloads handed off', download_failed: 'Downloads failed', download_cancelled: 'Downloads cancelled',
	search_submitted: 'Searches submitted', search_results_shown: 'Search results shown', search_failed: 'Searches failed',
	search_result_selected: 'Search results selected', filters_applied: 'Filters applied', experiment_exposed: 'Experiment exposures'
};

function text(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

function includesTraffic(context: CountableObservation['trafficContext'], traffic: ReportQuery['traffic']): boolean {
	if (context === 'self_excluded') return false;
	return traffic === 'inclusive'
		? ['audience', 'unclassified', 'operator', 'test', 'known_crawler', 'suspected_automation'].includes(context)
		: context === 'audience' || context === 'unclassified';
}

type CountableObservation = {
	eventName: PostHogEventName;
	date: string;
	albumKey: string | null;
	photoId: string | null;
	trafficContext: PostHogTrafficContext | 'self_excluded' | 'known_crawler' | 'suspected_automation' | 'unclassified';
	dimensions: Dimensions;
	count: number;
};

function rawObservation(row: V2ReportEvent): CountableObservation {
	const original = row.traffic_context;
	const effective = original === 'audience'
		? row.classification ?? original
		: original;
	return {
		eventName: row.event_name, date: dateOnly(new Date(row.occurred_at)), albumKey: row.album_key,
		photoId: row.photo_id, trafficContext: effective as CountableObservation['trafficContext'], dimensions: row.properties, count: 1
	};
}

function archivedObservation(row: V2ArchivedTotal): CountableObservation {
	return {
		eventName: row.event_name, date: row.bucket_date, albumKey: row.album_key,
		photoId: row.photo_id, trafficContext: row.traffic_context, dimensions: row.dimensions, count: Number(row.event_count)
	};
}

function dimension(row: CountableObservation, key: string): string | null {
	return text(row.dimensions[key]);
}

function matchesScope(row: CountableObservation, query: ReportQuery, publicAlbumKeys: Set<string>): boolean {
	if (row.eventName.startsWith('site_') || row.eventName.startsWith('content_') || row.eventName === 'demo_section_viewed') return false;
	// A photo without an album cannot be checked against current visibility, so it cannot enter public output.
	if (row.photoId && !row.albumKey) return false;
	if (row.albumKey && !publicAlbumKeys.has(row.albumKey)) return false;
	// Gallery and search events legitimately have no album. They belong only in an all-album report.
	if (!row.albumKey && query.scope !== 'all') return false;
	if (row.albumKey && query.scope !== 'all' && !query.albumKeys.includes(row.albumKey)) return false;
	if (!includesTraffic(row.trafficContext, query.traffic)) return false;
	if (row.date < query.start || row.date > query.end) return false;
	// Recorded dimensions are snapshots. Never reclassify historic observations from today's catalogue.
	if (query.sport && dimension(row, 'album_sport') !== query.sport) return false;
	if (query.eventDate && dimension(row, 'event_date') !== query.eventDate) return false;
	if (query.season && dimension(row, 'event_date')?.slice(0, 4) !== query.season) return false;
	if (query.albumEventType && dimension(row, 'album_event_type') !== query.albumEventType) return false;
	if (query.category && dimension(row, 'photo_category') !== query.category) return false;
	if (query.source && (dimension(row, 'tagged_source') ?? dimension(row, 'source') ?? 'direct') !== query.source) return false;
	return true;
}

function coverageLabel(bounds: V2CoverageBounds): string {
	if (!bounds.firstRecordedAt) {
		return 'No collection-bound record is available. This report cannot call the interval complete; a zero count means no matching public observation, not that nothing happened.';
	}
	const raw = bounds.rawRetainedFrom ? ` Raw retained observations begin ${dateOnly(new Date(bounds.rawRetainedFrom))}.` : '';
	const archive = bounds.archivedFrom && bounds.archivedThrough
		? ` Archived aggregate snapshots cover ${bounds.archivedFrom} through ${bounds.archivedThrough}.`
		: '';
	return `Detailed event counts begin ${dateOnly(new Date(bounds.firstRecordedAt))}.${raw}${archive} Counts are observations, not people or a conversion funnel.`;
}

/**
 * Builds public aggregate counts. Raw and archived rows are disjoint by the archive contract;
 * neither identifiers nor inferred people/visit sequences enter the returned shape.
 */
export function buildV2ReportProjection(
	rawRows: readonly V2ReportEvent[],
	archivedRows: readonly V2ArchivedTotal[],
	query: ReportQuery,
	options: V2ProjectionOptions,
	bounds: V2CoverageBounds = { firstRecordedAt: null, rawRetainedFrom: null, archivedFrom: null, archivedThrough: null }
): V2ReportProjection {
	const publicAlbumKeys = new Set(options.publicAlbumKeys);
	const counts = new Map(POSTHOG_EVENT_NAMES.map((event) => [event, 0]));
	const shareOutcomes = new Map([
		['clipboard_succeeded', {label: 'Share links copied', count: 0}],
		['native_share_handed_off', {label: 'Native shares handed off', count: 0}],
		['composer_opened', {label: 'Share composers opened', count: 0}],
		['email_link_opened', {label: 'Share email links opened', count: 0}],
		['cancelled', {label: 'Share actions cancelled', count: 0}],
		['failed', {label: 'Share actions failed', count: 0}]
	]);
	for (const row of [...rawRows.map(rawObservation), ...archivedRows.map(archivedObservation)]) {
		if (!matchesScope(row, query, publicAlbumKeys)) continue;
		counts.set(row.eventName, (counts.get(row.eventName) ?? 0) + row.count);
		if (row.eventName === 'share_action') {
			const outcome = shareOutcomes.get(String(row.dimensions.outcome));
			if (outcome) outcome.count += row.count;
		}
	}
	return {
		available: true,
		coverage: { start: query.start, end: query.end, ...bounds, label: coverageLabel(bounds) },
		counts: [...POSTHOG_EVENT_NAMES.filter((event) => !event.startsWith('site_') && !event.startsWith('content_') && event !== 'demo_section_viewed').map((event) => ({ event, label: labels[event], count: counts.get(event) ?? 0 })), ...[...shareOutcomes.values()].map((outcome) => ({event: 'share_action' as const, ...outcome}))]
	};
}

export function unavailableV2ReportProjection(query: ReportQuery, label = 'Detailed event counts could not be read. This is not a zero-result or complete-coverage report.'): V2ReportProjection {
	return {
		available: false,
		coverage: {
			start: query.start, end: query.end, firstRecordedAt: null, rawRetainedFrom: null, archivedFrom: null, archivedThrough: null,
			label
		},
		counts: POSTHOG_EVENT_NAMES.map((event) => ({ event, label: labels[event], count: 0 }))
	};
}

async function readAll<T>(page: (from: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
	const rows: T[] = [];
	for (let from = 0; ; from += 1000) {
		const { data, error } = await page(from);
		if (error) throw error;
		rows.push(...(data ?? []));
		if ((data ?? []).length < 1000) return rows;
	}
}

/** Classification history is private and identifier-bearing; read it only for raw events already selected for this projection. */
export async function fetchLatestV2Classifications(client: SupabaseClient, eventIds: readonly string[]): Promise<Map<string, string>> {
	const ids = [...new Set(eventIds.filter(Boolean))];
	const batches = Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) => ids.slice(index * 100, index * 100 + 100));
	const rows: Array<{ event_id: string; classification: string; classification_version?: number }> = [];
	let next = 0;
	await Promise.all(Array.from({ length: Math.min(4, batches.length) }, async () => {
		while (next < batches.length) {
			const batch = batches[next++];
			rows.push(...await readAll((from) => client.from('analytics_event_v2_classifications')
				.select('event_id, classification, classification_version').in('event_id', batch)
				.order('event_id').order('classification_version', { ascending: false }).range(from, from + 999)));
		}
	}));
	const latest = new Map<string, string>();
	for (const row of rows.sort((a, b) => a.event_id.localeCompare(b.event_id) || Number(b.classification_version ?? 0) - Number(a.classification_version ?? 0))) {
		if (!latest.has(row.event_id)) latest.set(row.event_id, row.classification);
	}
	return latest;
}

/** Reads raw and archive sources server-side; raw and archive buckets are disjoint by migration contract. */
export async function fetchV2ReportProjection(client: SupabaseClient, query: ReportQuery, options: V2ProjectionOptions): Promise<V2ReportProjection> {
	try {
		const first = new Date(`${query.start}T00:00:00Z`); first.setUTCDate(first.getUTCDate() - 1);
		const last = new Date(`${query.end}T00:00:00Z`); last.setUTCDate(last.getUTCDate() + 2);
		const [rawRows, archivedRows, rawStart, archiveStart, archiveEnd] = await Promise.all([
			readAll<V2ReportEvent>((from) => client.from('analytics_events_v2')
				.select('event_id, event_name, occurred_at, album_key, photo_id, traffic_context, properties')
				.gte('occurred_at', first.toISOString()).lt('occurred_at', last.toISOString())
				.order('occurred_at', { ascending: true }).range(from, from + 999)),
			readAll<V2ArchivedTotal>((from) => client.from('analytics_v2_archived_totals')
				.select('bucket_date, event_name, traffic_context, album_key, photo_id, dimensions, event_count, export_eligible_count, last_recorded_at')
				.gte('bucket_date', query.start).lte('bucket_date', query.end)
				.order('bucket_date', { ascending: true }).range(from, from + 999)),
			client.from('analytics_events_v2').select('occurred_at').order('occurred_at', { ascending: true }).limit(1),
			client.from('analytics_v2_archived_totals').select('bucket_date').order('bucket_date', { ascending: true }).limit(1),
			client.from('analytics_v2_archived_totals').select('bucket_date').order('bucket_date', { ascending: false }).limit(1)
		]);
		if (rawStart.error || archiveStart.error || archiveEnd.error) throw rawStart.error ?? archiveStart.error ?? archiveEnd.error;
		const latestClassification = await fetchLatestV2Classifications(client, rawRows.flatMap((row) => row.event_id ? [row.event_id] : []));
		for (const row of rawRows) row.classification = row.event_id ? latestClassification.get(row.event_id) ?? null : null;
		const rawRetainedFrom = rawStart.data?.[0]?.occurred_at ?? null;
		const archivedFrom = archiveStart.data?.[0]?.bucket_date ?? null;
		const archivedThrough = archiveEnd.data?.[0]?.bucket_date ?? null;
		const firstRecordedAt = [rawRetainedFrom, archivedFrom].filter((value): value is string => !!value).sort()[0] ?? null;
		return buildV2ReportProjection(rawRows, archivedRows, query, options, { firstRecordedAt, rawRetainedFrom, archivedFrom, archivedThrough });
	} catch (cause) {
		console.error('[analytics v2 report] unavailable:', cause);
		return unavailableV2ReportProjection(query);
	}
}
