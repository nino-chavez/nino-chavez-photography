import type { PhotoRank, ReportMeasure, ReportQuery } from './report-contract';

/**
 * The photo view's own rules, kept out of the page so they can be tested. The view reads the gallery report's
 * query unchanged (dates, measure, albums, filters, comparison), so a link, a saved view and a CSV all say the same thing.
 */

export const PHOTO_PAGE_SIZE = 12;
export const PHOTO_RANK_LABELS: Record<PhotoRank, string> = { popular: 'Popular', rising: 'Rising', recent: 'Recently active' };

/** Every filter the view reads, as an address query. The CSV takes exactly these; nothing else is in it. */
export function filterParams(query: ReportQuery): URLSearchParams {
	const params = new URLSearchParams({
		period: 'custom', start: query.start, end: query.end, measure: query.measure,
		scope: query.scope, albums: query.albumKeys.join(','), traffic: query.traffic, compare: query.compare
	});
	if (query.sport) params.set('sport', query.sport);
	if (query.category) params.set('category', query.category);
	if (query.source) params.set('source', query.source);
	if (query.eventDate) params.set('event_date', query.eventDate);
	if (query.season) params.set('season', query.season);
	if (query.albumEventType) params.set('event_type', query.albumEventType);
	if (query.compareStart) params.set('compare_start', query.compareStart);
	if (query.compareEnd) params.set('compare_end', query.compareEnd);
	return params;
}

/** The address query that reopens a photo view: the filters, the ranking and the page. */
export function photoParams(query: ReportQuery, rank: PhotoRank, page: number): URLSearchParams {
	const params = filterParams(query);
	params.set('photo_rank', rank);
	params.set('photo_page', String(page));
	return params;
}

/** "photo_opens" as a reader sees it, at the start of a sentence: "Photo opens". */
export function measureLabel(measure: ReportMeasure): string {
	const words = measure.replaceAll('_', ' ');
	return `${words[0].toUpperCase()}${words.slice(1)}`;
}

/** The period the picker shows for a pair of dates: 7, 30 or 90 complete days, otherwise custom. */
export function periodFor(start: string, end: string): '7' | '30' | '90' | 'custom' {
	const days = Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) + 1;
	return days === 7 || days === 30 || days === 90 ? String(days) as '7' | '30' | '90' : 'custom';
}

export interface ChangeInput {
	count: number | null;
	previousCount: number | null;
	difference: number | null;
	newAlbum: boolean;
}
export interface ChangeContext {
	compare: ReportQuery['compare'];
	basis: 'absolute' | 'daily_rate' | 'unavailable';
	currentDays: number;
	previousDays: number;
}

/** How a photo's count compares with the earlier period, in words that say what kind of comparison it is. */
export function changeLabel(item: ChangeInput, context: ChangeContext): string {
	if (context.compare === 'none') return 'No comparison selected';
	if (item.newAlbum) return 'New album';
	if (context.basis === 'daily_rate' && item.count !== null && item.previousCount !== null) {
		const rate = item.count / context.currentDays - item.previousCount / context.previousDays;
		return `${rate >= 0 ? '+' : ''}${rate.toLocaleString('en-US', { maximumFractionDigits: 1 })} actions/day`;
	}
	if (item.difference === null) return 'Comparison unavailable';
	if (item.previousCount === 0 && (item.count ?? 0) > 0) return 'New activity';
	return item.difference === 0 ? 'No change' : `${item.difference > 0 ? '+' : ''}${item.difference.toLocaleString('en-US')}`;
}

/** What a count counts, in the plural, for the label on a photo tile: "13 opens", "4 download requests". */
const COUNT_UNITS: Record<ReportMeasure, [string, string]> = {
	photo_opens: ['open', 'opens'], album_opens: ['open', 'opens'], downloads: ['download request', 'download requests'], favorites: ['favorite', 'favorites'], shares: ['share', 'shares']
};
/** The number with the word for what it counts, so a tile never shows a bare figure. */
export function countWithUnit(count: number | null, coverage: 'complete' | 'partial' | 'unavailable', measure: ReportMeasure): string {
	if (count === null) return 'Unavailable';
	const [one, many] = COUNT_UNITS[measure];
	return `${countLabel(count, coverage)} ${count === 1 ? one : many}`;
}

/** A count that says when it is only what was recorded, never a total it cannot prove. */
export function countLabel(count: number | null, coverage: 'complete' | 'partial' | 'unavailable'): string {
	return count === null ? 'Unavailable' : `${count.toLocaleString('en-US')}${coverage === 'complete' ? '' : ' recorded'}`;
}

/** The size of the CSV, as the button says it: photo rows, plus the album-only rows the file also holds. */
export function csvRowCount(measure: ReportMeasure, albums: number, photos: number, albumOnly: number): number {
	return measure === 'album_opens' ? albums : photos + albumOnly;
}
