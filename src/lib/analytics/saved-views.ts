import type { Parsed } from './parsed';
import { parseReportQuery, REPORT_MEASURES, type ReportMeasure, type ReportQuery } from './report-contract';

/**
 * Saved views: a name and the gallery filters it stands for. The stored shape is the one the old gallery
 * report wrote to `analytics_saved_reports.query` and the photo explorer reads and writes today; this file
 * is its single owner, so a view saved in settings and a view saved in the explorer are the same row.
 * Copy here is reader-facing.
 */

export const SAVED_VIEW_NAME_MAX = 100;

export function savedQueryState(query: ReportQuery) {
	return {
		period: 'custom', start: query.start, end: query.end, measure: query.measure, scope: query.scope,
		albums: query.albumKeys, traffic: query.traffic,
		...(query.sport ? { sport: query.sport } : {}),
		...(query.category ? { category: query.category } : {}),
		...(query.source ? { source: query.source } : {}),
		...(query.eventDate ? { event_date: query.eventDate } : {}),
		...(query.season ? { season: query.season } : {}),
		...(query.albumEventType ? { event_type: query.albumEventType } : {}),
		compare: query.compare,
		...(query.compareStart ? { compare_start: query.compareStart } : {}),
		...(query.compareEnd ? { compare_end: query.compareEnd } : {})
	};
}

export const MEASURE_WORDS: Record<ReportMeasure, string> = {
	photo_opens: 'photo opens', album_opens: 'album opens', downloads: 'download requests', favorites: 'favorites', shares: 'shares'
};
export const SAVED_VIEW_PERIODS = [7, 30, 90] as const;

function cleanName(value: FormDataEntryValue | null): string | null {
	const name = typeof value === 'string' ? value.trim() : '';
	return name.length >= 1 && name.length <= SAVED_VIEW_NAME_MAX ? name : null;
}
const NAME_ERROR = `Give this view a name of 1–${SAVED_VIEW_NAME_MAX} characters.`;

/**
 * A new view from the settings page. It has no filter bar, so it saves the whole gallery over the last
 * 7, 30 or 90 complete days for one measure. A view with album or other filters is saved from the
 * photo explorer, which has the filters; both write the same stored shape.
 */
export function savedViewFromForm(form: FormData, now = new Date()): Parsed<{ name: string; query: ReturnType<typeof savedQueryState> }> {
	const name = cleanName(form.get('name'));
	if (!name) return { ok: false, error: NAME_ERROR };
	const period = Number(form.get('period'));
	const measure = String(form.get('measure') ?? '');
	if (!(SAVED_VIEW_PERIODS as readonly number[]).includes(period)) return { ok: false, error: 'Choose 7, 30 or 90 days.' };
	if (!(REPORT_MEASURES as readonly string[]).includes(measure)) return { ok: false, error: 'Choose what to count.' };
	const query = parseReportQuery(new URLSearchParams({ period: String(period), measure, traffic: 'conservative', compare: 'previous' }), now);
	return { ok: true, name, query: savedQueryState(query) };
}

/** A new name for a view. The filters it stands for are not touched. */
export function renamedViewFromForm(form: FormData): Parsed<{ id: string; name: string }> {
	const id = form.get('id')?.toString();
	if (!id) return { ok: false, error: 'Choose a view to rename.' };
	const name = cleanName(form.get('name'));
	if (!name) return { ok: false, error: NAME_ERROR };
	return { ok: true, id, name };
}

function isObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** The photo explorer's query string that reopens a saved view, or null when what was stored is not a view. */
export function savedViewParams(query: unknown): URLSearchParams | null {
	if (!isObject(query)) return null;
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (Array.isArray(value)) params.set(key, value.join(','));
		else if (typeof value === 'string') params.set(key, value);
	}
	return [...params].length ? params : null;
}

const day = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));

/** What a stored view stands for, in words: dates, what is counted, and how far the filters narrow it. */
export function describeSavedView(query: unknown): string {
	if (!isObject(query)) return 'Its filters could not be read.';
	const parts: string[] = [];
	if (isDay(query.start) && isDay(query.end)) parts.push(`${day(query.start)} to ${day(query.end)}`);
	parts.push(typeof query.measure === 'string' && query.measure in MEASURE_WORDS ? MEASURE_WORDS[query.measure as ReportMeasure] : 'an unknown measure');
	const albums = Array.isArray(query.albums) ? query.albums.length : 0;
	parts.push(query.scope === 'all' || !albums ? 'all albums' : albums === 1 ? 'one album' : `${albums} albums`);
	for (const [key, label] of [['sport', 'sport'], ['category', 'category'], ['source', 'source'], ['season', 'season'], ['event_type', 'event type']] as const) {
		if (typeof query[key] === 'string' && query[key]) parts.push(`${label}: ${query[key]}`);
	}
	parts.push(query.traffic === 'inclusive' ? 'all traffic' : 'audience traffic');
	return parts.join(' · ');
}
