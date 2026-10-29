import type { Launch, LaunchPhoto, LaunchReadModel } from './launch-read-model.server';
import { chicagoDate, earlierLaunches, formatDay, median } from './launch-recap';

/**
 * Chart and table data for the album launch report. Pure functions over the launch read model.
 * Unknown stays unknown: a day that is not complete is a gap, never a zero, and a cumulative line
 * stops at its first gap because every later total would be a guess.
 */

/** An album name without its trailing event date ("... - 08-25-2026"). Never cut mid-name. */
export function nameWithoutDate(name: string): string {
	const stripped = name.replace(/\s*[-–]\s*\d{1,2}-\d{1,2}-\d{2,4}\s*$/, '').trim();
	return stripped || name;
}

/**
 * One list of what a page cannot tell the reader. The page's own limits come first, then its findings'. The same fact said two ways
 * ("not people", "a request, not a saved file") is said once, and the note that a date was recovered from a log is left out when the
 * page already carries the note beside the date.
 */
export function mergeLimits(own: readonly string[], found: readonly string[], datesRecoveredNoted: boolean): string[] {
	const key = (text: string) => (/not people/i.test(text) ? 'people' : /request, not a confirmed saved file|requests, not confirmed saved/i.test(text) ? 'requests' : /first publication time was worked out|recovered afterwards from a log/i.test(text) ? 'recovered' : text);
	const seen = new Set<string>();
	const list: string[] = [];
	for (const text of [...own, ...found]) {
		const k = key(text);
		if (k === 'recovered' && datesRecoveredNoted) continue;
		if (seen.has(k)) continue;
		seen.add(k);
		list.push(text);
	}
	return list;
}

export interface DailyBar {
	day: number | null;
	date: string;
	label: string;
	opens: number | null;
	/** Median of earlier launches on the same day since publication; null when none had a complete day. */
	median: number | null;
	/** How many earlier launches the median uses. */
	medianOf: number;
}

export interface DailyChart {
	bars: DailyBar[];
	max: number;
	/** Plain-language name and description for the chart. */
	title: string;
	summary: string;
}

export function dailyChart(model: LaunchReadModel): DailyChart {
	const album = model.album;
	const earlier = album.status === 'no_launch_date' ? [] : earlierLaunches(model, album);
	const bars: DailyBar[] = album.series.map((day, index) => {
		const values = earlier.flatMap((launch) => {
			const other = launch.series[index];
			return other && other.coverage === 'complete' && other.photoOpens !== null ? [other.photoOpens] : [];
		});
		return {
			day: day.day,
			date: day.date,
			label: day.day === null ? formatDay(day.date) : String(day.day),
			opens: day.coverage === 'complete' ? day.photoOpens : null,
			median: median(values),
			medianOf: values.length
		};
	});
	const max = Math.max(1, ...bars.map((bar) => bar.opens ?? 0), ...bars.map((bar) => bar.median ?? 0));
	const dated = album.status !== 'no_launch_date';
	return {
		bars,
		max,
		title: dated ? 'Photo opens each day since publication' : 'Photo opens each day',
		summary: !dated
			? 'Bars are this album. There is no launch date, so there is no earlier launch to compare with.'
			: bars.some((bar) => bar.median !== null)
				? 'Bars are this album. The line is the median of earlier launches on the same day since publication. A day with incomplete records is shown as a gap.'
				: 'Bars are this album. No earlier launch has a complete day to compare with. A day with incomplete records is shown as a gap.'
	};
}

export interface CumulativePoint { day: number; total: number }
export interface CumulativeCurve {
	albumKey: string;
	name: string;
	current: boolean;
	inferred: boolean;
	/** Cumulative photo opens through each day, from day 0. Stops before the first incomplete day. */
	points: CumulativePoint[];
	/** True when the line stops short of the days that have passed because of a records gap. */
	cutByGap: boolean;
}

export function cumulativePoints(launch: Pick<Launch, 'series'>): { points: CumulativePoint[]; cutByGap: boolean } {
	const points: CumulativePoint[] = [];
	let total = 0;
	for (let i = 0; i < launch.series.length; i += 1) {
		const day = launch.series[i];
		if (day.coverage !== 'complete' || day.photoOpens === null) return { points, cutByGap: true };
		total += day.photoOpens;
		points.push({ day: i, total });
	}
	return { points, cutByGap: false };
}

/** The comparison on the album report is the first week, days 0 to 6: the same window as the table beside it, the rank and the headline. */
export const COMPARISON_DAYS = 7;

/** The first `through` days of a launch's cumulative line. A line that reaches that far is whole; one that stops sooner stops for its own reason. */
function firstWeek(launch: Pick<Launch, 'series'>, through: number): { points: CumulativePoint[]; cutByGap: boolean } {
	const whole = cumulativePoints(launch);
	return whole.points.length >= through ? { points: whole.points.slice(0, through), cutByGap: false } : whole;
}

/**
 * Every launch's opens added up by day since publication, this album marked, over the first week only. Newest launches first.
 * One window for the whole comparison: a launch's line past day 6 would give the same launch a second number (its week-1 total in the
 * table and its total by day 13 on the chart), and the two would read as a mistake.
 */
export function cumulativeCurves(model: LaunchReadModel, through = COMPARISON_DAYS): CumulativeCurve[] {
	const currentKey = model.album.albumKey;
	const curves = model.launches.map((launch) => ({
		albumKey: launch.albumKey,
		name: launch.albumName ?? launch.albumKey,
		current: launch.albumKey === currentKey,
		inferred: launch.basis === 'inferred',
		...firstWeek(launch, through)
	}));
	// An album kept out of the comparison set (not public) still draws, so the reader sees their own line.
	if (model.album.status !== 'no_launch_date' && !curves.some((curve) => curve.current)) {
		curves.unshift({ albumKey: currentKey, name: model.album.albumName ?? currentKey, current: true, inferred: model.album.basis === 'inferred', ...firstWeek(model.album, through) });
	}
	return curves;
}

export interface LaunchTableRow {
	albumKey: string;
	name: string;
	current: boolean;
	published: string;
	inferred: boolean;
	day3: number | null;
	day7: number | null;
	rank7: number | null;
	tied7: boolean;
	/** 'incomplete' means the age was reached but a day in it has incomplete records, so no total is stated. */
	day3State: AgeState;
	day7State: AgeState;
	/** Either age is reached but missing because of a records gap. */
	gap: boolean;
}
export type AgeState = 'ok' | 'not_reached' | 'incomplete';
const ageState = (t: { reached: boolean; complete: boolean }): AgeState => (!t.reached ? 'not_reached' : t.complete ? 'ok' : 'incomplete');

/** The ranked alternative to the cumulative chart, and its accessible table. Best week first. */
export function launchTable(model: LaunchReadModel): LaunchTableRow[] {
	const currentKey = model.album.albumKey;
	const launches: Launch[] = [...model.launches];
	if (model.album.status !== 'no_launch_date' && !launches.some((launch) => launch.albumKey === currentKey)) launches.unshift(model.album);
	const rows = launches.map((launch) => ({
		albumKey: launch.albumKey,
		name: launch.albumName ?? launch.albumKey,
		current: launch.albumKey === currentKey,
		published: formatDay(chicagoDate(launch.firstPublishedAt)),
		inferred: launch.basis === 'inferred',
		day3: launch.totals.day3.photoOpens,
		day7: launch.totals.day7.photoOpens,
		rank7: launch.rank.day7.rank,
		tied7: launch.rank.day7.tied,
		day3State: ageState(launch.totals.day3),
		day7State: ageState(launch.totals.day7),
		gap: (launch.totals.day3.reached && !launch.totals.day3.complete) || (launch.totals.day7.reached && !launch.totals.day7.complete)
	}));
	return rows.sort((x, y) => (y.day7 ?? -1) - (x.day7 ?? -1) || (y.day3 ?? -1) - (x.day3 ?? -1) || x.name.localeCompare(y.name));
}

export interface GridPhoto {
	photoId: string;
	cfImageId: string | null;
	opens: number;
	downloads: number;
	favorites: number;
	exposureRecorded: boolean;
	opensInExposureWindow: number | null;
	exposures: number | null;
	renders: number | null;
}

/**
 * Every photo in the album, ranked by downloads, then opens, then favorites, then id. Photos with
 * no recorded activity are listed after the active ones so the grid shows the whole album.
 * `exposureRecorded` is the album's own flag: true when version-2 collection ran during the window.
 */
export function gridPhotos(rows: Array<{ photoId: string; cfImageId: string | null }>, activity: LaunchPhoto[], exposureRecorded: boolean): GridPhoto[] {
	const byId = new Map(activity.map((photo) => [photo.photoId, photo]));
	const merged: GridPhoto[] = rows.map((row) => {
		const hit = byId.get(row.photoId);
		return {
			photoId: row.photoId,
			cfImageId: row.cfImageId,
			opens: hit?.opens ?? 0,
			downloads: hit?.downloads ?? 0,
			favorites: hit?.favorites ?? 0,
			// A photo with no row had no activity at all, so where collection ran its exposure count is a true zero.
			exposureRecorded: hit?.exposureRecorded ?? exposureRecorded,
			opensInExposureWindow: hit ? hit.opensInExposureWindow : exposureRecorded ? 0 : null,
			exposures: hit ? hit.exposures : exposureRecorded ? 0 : null,
			renders: hit ? hit.renders : exposureRecorded ? 0 : null
		};
	});
	return merged.sort((x, y) => y.downloads - x.downloads || y.opens - x.opens || y.favorites - x.favorites || x.photoId.localeCompare(y.photoId));
}
