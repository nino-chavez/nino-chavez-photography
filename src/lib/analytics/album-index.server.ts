import type { SupabaseClient } from '@supabase/supabase-js';
import { buildAlbumIndex, statusText, undatedReasonShort, QUIET_DAYS, type AlbumActivity, type AlbumIndex, type AlbumSetting, type CatalogueAlbum } from './album-index';
import { fetchLaunches, type LaunchList } from './launch-read-model.server';
import { buildOperatorReport, formulaSafe } from './operator-report.server';
import { dateOnly, parseReportQuery } from './report-contract';

/**
 * Reads behind the album index: one catalogue read, one settings read, one launch-list call
 * (`analytics_read_launches`) and one 30-day report call. No query per album. Everything is read
 * with the service role, so the visibility rule is applied here and in `buildAlbumIndex`: only
 * public albums are returned.
 */

async function readAll<T>(page: (from: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
	const rows: T[] = [];
	for (let from = 0; ; from += 1000) {
		const { data, error } = await page(from);
		if (error) throw error;
		rows.push(...(data ?? []));
		if ((data ?? []).length < 1000) return rows;
	}
}

function addDays(date: string, days: number): string {
	const d = new Date(`${date}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/** Launch days read for the overlay: the first two weeks, as the album report reads them. */
const LAUNCH_DAYS = 14;

export async function loadAlbumIndex(admin: SupabaseClient, asOf: Date = new Date()): Promise<AlbumIndex> {
	const [albums, settingRows] = await Promise.all([
		readAll<{ album_key: string; album_name: string | null; photo_count: number | null }>((from) => admin.from('albums_summary').select('album_key, album_name, photo_count').order('album_key').range(from, from + 999)),
		readAll<{ album_key: string; visibility: string | null; first_published_at_basis: 'recorded' | 'inferred' | 'unobserved' | null }>((from) => admin.from('album_settings').select('album_key, visibility, first_published_at_basis').order('album_key').range(from, from + 999))
	]);
	const catalogue: CatalogueAlbum[] = albums.map((row) => ({ albumKey: row.album_key, name: row.album_name || row.album_key, photos: Number(row.photo_count ?? 0) }));
	const settings: AlbumSetting[] = settingRows.map((row) => ({ albumKey: row.album_key, visibility: row.visibility, basis: row.first_published_at_basis }));
	const asOfIso = asOf.toISOString();
	const lastCompleteDay = addDays(dateOnly(asOf), -1);
	const window = { start: addDays(lastCompleteDay, -(QUIET_DAYS - 1)), end: lastCompleteDay };

	const params = new URLSearchParams({ period: 'custom', start: window.start, end: window.end, scope: 'all', measure: 'photo_opens', traffic: 'conservative', compare: 'none' });
	const [list, report] = await Promise.all([
		fetchLaunches(admin, { asOf: asOfIso, days: LAUNCH_DAYS, traffic: 'conservative', publicOnly: true }),
		buildOperatorReport(admin, parseReportQuery(params, asOf), { publicOnly: true, photoWindow: { page: 0, pageSize: 0, rank: 'popular' }, includeDiagnostics: false, includeVisitorEstimate: false, includeToday: false, cacheRole: 'service_role' })
	]);
	return indexFromReads(list, report.available ? report.albums.map((row): AlbumActivity => ({ albumKey: row.albumKey, count: row.count, lastActivity: row.lastActivity, measures: row.measures })) : null, { catalogue, settings, window });
}

/** The two reads agree on the day, or the counts would not describe the same 30 days. */
export function indexFromReads(list: LaunchList, activity: AlbumActivity[] | null, base: { catalogue: CatalogueAlbum[]; settings: AlbumSetting[]; window: { start: string; end: string } }): AlbumIndex {
	if (list.lastCompleteDay !== base.window.end) throw new Error(`The launch read and the 30-day window disagree about the last complete day (${list.lastCompleteDay} against ${base.window.end}).`);
	return buildAlbumIndex({ asOf: list.asOf, today: list.today, window: base.window, launches: list.launches, catalogue: base.catalogue, settings: base.settings, activity });
}

const CSV_HEADER = [
	'list', 'album_name', 'album_key', 'photos', 'first_published', 'first_published_basis', 'status',
	'photo_opens_first_3_days', 'photo_opens_first_3_days_state', 'photo_opens_week_1', 'photo_opens_week_1_state', 'rank_at_day_7', 'rank_tied', 'launches_ranked',
	'download_requests_week_1', 'download_requests_week_1_state',
	'photo_opens_last_30_days', 'last_activity', 'why_no_launch_date', 'window_start', 'window_end', 'as_of'
];

/**
 * The index as CSV, one row per visible row and one column per visible column. Numbers stay numbers and
 * unknown stays empty. Whether a figure is complete, partial or incomplete is its own column, never
 * written into the number. Text that could be read as a spreadsheet formula is neutralised.
 */
export function indexCsv(index: AlbumIndex): string {
	const cell = (value: string | number | null) => `"${formulaSafe(value).replaceAll('"', '""')}"`;
	const state = (value: string) => (value === 'ok' ? 'complete' : value);
	const rows: Array<Array<string | number | null>> = [];
	for (const row of index.launches) {
		rows.push([
			'launch', row.name, row.albumKey, row.photos, row.published, row.inferred ? 'inferred' : 'recorded', statusText(row.status).toLowerCase().replaceAll(' ', '_'),
			row.day3.value, state(row.day3.state), row.week1.value, state(row.week1.state), row.rank.rank, row.rank.state === 'ranked' ? String(row.rank.tied) : null, row.rank.state === 'ranked' ? row.rank.compared : null,
			row.downloads.value, state(row.downloads.state),
			null, null, null, index.window.start, index.window.end, index.asOf
		]);
	}
	for (const row of index.undated) {
		rows.push([
			'no_launch_date', row.name, row.albumKey, row.photos, null, null, 'no_launch_date',
			null, null, null, null, null, null, null, null, null,
			row.photoOpens, row.lastActivity, undatedReasonShort(row.reason), index.window.start, index.window.end, index.asOf
		]);
	}
	return [CSV_HEADER, ...rows].map((row) => row.map((value) => (typeof value === 'number' ? String(value) : cell(value))).join(',')).join('\n');
}
