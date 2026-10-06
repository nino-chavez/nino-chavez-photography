import type { Launch, NoLaunchDateCode } from './launch-read-model.server';
import { chicagoDate, formatDay, ordinal, sumComplete } from './launch-recap';
import { cumulativePoints, type CumulativePoint } from './launch-report-view';

/**
 * The album index: every public album, launches first. Pure functions over three reads: the launch
 * list, the album catalogue and its publication settings, and the last 30 complete days of activity.
 *
 * Rules the rows keep, the same as the album report:
 *  - Unknown is never zero. A day that is not complete adds nothing, and a figure with a gap says so.
 *  - A launch younger than its age shows "so far" and is never ranked at that age.
 *  - An inferred first publication says "(inferred)".
 *  - Only public albums are listed. An unlisted album is not counted, searched, compared or exported.
 */

export const QUIET_DAYS = 30;
export const MAX_COMPARED = 4;

/** One figure in a launch row. `so_far` is a partial figure for a launch that has not reached that age. */
export type FigureState = 'ok' | 'so_far' | 'incomplete' | 'not_yet';
export interface Figure { state: FigureState; value: number | null }

export interface RankCell {
	state: 'ranked' | 'not_yet' | 'incomplete';
	rank: number | null;
	compared: number;
	tied: boolean;
}

export interface LaunchStatusCell {
	kind: 'today' | 'so_far' | 'finished';
	/** Complete days so far; the same number the album report's "Launch so far, day N" uses. */
	day: number;
}

export interface IndexLaunchRow {
	albumKey: string;
	name: string;
	/** The Chicago day of first publication, YYYY-MM-DD. */
	published: string;
	inferred: boolean;
	status: LaunchStatusCell;
	day3: Figure;
	week1: Figure;
	rank: RankCell;
	downloads: Figure;
	photos: number | null;
	/** Cumulative photo opens by day since publication, for the overlay. Stops before the first incomplete day. */
	curve: { points: CumulativePoint[]; cutByGap: boolean };
}

export interface IndexUndatedRow {
	albumKey: string;
	name: string;
	photos: number;
	/** Photo opens in the last 30 complete days; null when that could not be read. */
	photoOpens: number | null;
	/** Chicago day of the last recorded action of any kind in the window, or null. */
	lastActivity: string | null;
	reason: NoLaunchDateCode;
	/** True only when every measure is a recorded zero over the whole window. */
	noActivity: boolean;
}

export interface AlbumIndex {
	asOf: string;
	today: string;
	/** The 30 complete days the second list is counted over. */
	window: { start: string; end: string };
	/** False when the 30-day counts could not be read; undated rows then carry no count. */
	activityAvailable: boolean;
	launches: IndexLaunchRow[];
	undated: IndexUndatedRow[];
	publicAlbums: number;
}

export interface CatalogueAlbum { albumKey: string; name: string; photos: number }
export interface AlbumSetting { albumKey: string; visibility: string | null; basis: 'recorded' | 'inferred' | 'unobserved' | null }
export interface AlbumActivity {
	albumKey: string;
	count: number | null;
	lastActivity: string | null;
	measures: Record<'photo_opens' | 'album_opens' | 'downloads' | 'favorites' | 'shares', number | null>;
}

/**
 * Why a public album has no launch date, by the same precedence the launch function uses
 * (`analytics_read_launch`): an observed-nothing basis first, then not-published, then no record.
 * A missing settings row means the album has always been public.
 */
export function undatedReasonCode(setting: Pick<AlbumSetting, 'visibility' | 'basis'> | undefined): NoLaunchDateCode {
	if (setting?.basis === 'unobserved') return 'unobserved';
	if (setting?.visibility === 'unlisted') return 'not_published';
	return 'no_record';
}

/** The reason in a table cell. The album report says the same thing in a full sentence (`undatedReason`). */
export function undatedReasonShort(code: NoLaunchDateCode): string {
	if (code === 'not_published') return 'Not published yet';
	if (code === 'unobserved') return 'Its first publication was never observed';
	return 'Already public before records began';
}

/** "Sep 26" for this year, "Sep 26, 2025" for another. */
export function dayLabel(date: string, today: string): string {
	return date.slice(0, 4) === today.slice(0, 4) ? formatDay(date) : `${formatDay(date)}, ${date.slice(0, 4)}`;
}

function figure(launch: Launch, age: 3 | 7, key: 'photoOpens' | 'downloads'): Figure {
	const totals = age === 3 ? launch.totals.day3 : launch.totals.day7;
	if (totals.reached) {
		if (!totals.complete) return { state: 'incomplete', value: null };
		return { state: 'ok', value: totals[key] };
	}
	// Not yet at this age: the complete days so far, if every one of them is complete.
	if (launch.series.length === 0) return { state: 'not_yet', value: null };
	const { total, gaps } = sumComplete(launch.series, key);
	return gaps.length ? { state: 'incomplete', value: null } : { state: 'so_far', value: total };
}

export function launchRow(launch: Launch, name: string | null, photos: number | null): IndexLaunchRow {
	const rank = launch.rank.day7;
	const week = launch.totals.day7;
	return {
		albumKey: launch.albumKey,
		name: launch.albumName ?? name ?? launch.albumKey,
		published: chicagoDate(launch.firstPublishedAt),
		inferred: launch.basis === 'inferred',
		status: launch.status === 'finished' ? { kind: 'finished', day: launch.series.length } : launch.series.length === 0 ? { kind: 'today', day: 0 } : { kind: 'so_far', day: launch.series.length },
		day3: figure(launch, 3, 'photoOpens'),
		week1: figure(launch, 7, 'photoOpens'),
		rank: !week.reached ? { state: 'not_yet', rank: null, compared: rank.compared, tied: false }
			: !week.complete || rank.rank === null ? { state: 'incomplete', rank: null, compared: rank.compared, tied: false }
				: { state: 'ranked', rank: rank.rank, compared: rank.compared, tied: rank.tied },
		downloads: figure(launch, 7, 'downloads'),
		photos,
		curve: cumulativePoints(launch)
	};
}

/**
 * Join the three reads. Public albums only: the catalogue is filtered by the settings' visibility, and
 * the launch list was asked for public launches only. Section two is the public catalogue minus the
 * launches, and an album with a launch never appears in both.
 */
export function buildAlbumIndex(input: {
	asOf: string;
	today: string;
	window: { start: string; end: string };
	launches: Launch[];
	catalogue: CatalogueAlbum[];
	settings: AlbumSetting[];
	/** Null when the 30-day report could not be read. */
	activity: AlbumActivity[] | null;
}): AlbumIndex {
	const settings = new Map(input.settings.map((s) => [s.albumKey, s]));
	const isPublic = (key: string) => settings.get(key)?.visibility !== 'unlisted';
	const catalogue = input.catalogue.filter((album) => isPublic(album.albumKey));
	const byKey = new Map(catalogue.map((album) => [album.albumKey, album]));
	const launchKeys = new Set(input.launches.map((launch) => launch.albumKey));
	const activity = input.activity ? new Map(input.activity.map((row) => [row.albumKey, row])) : null;

	const launches = input.launches
		.filter((launch) => isPublic(launch.albumKey))
		.map((launch) => launchRow(launch, byKey.get(launch.albumKey)?.name ?? null, byKey.get(launch.albumKey)?.photos ?? null));

	const undated: IndexUndatedRow[] = catalogue.filter((album) => !launchKeys.has(album.albumKey)).map((album) => {
		const row = activity?.get(album.albumKey);
		const values = row ? Object.values(row.measures) : [];
		return {
			albumKey: album.albumKey,
			name: album.name,
			photos: album.photos,
			photoOpens: row ? row.count : null,
			lastActivity: row?.lastActivity ? chicagoDate(row.lastActivity) : null,
			reason: undatedReasonCode(settings.get(album.albumKey)),
			// An album missing from the report, or with an unknown measure, is not a recorded zero.
			noActivity: !!row && values.length === 5 && values.every((value) => value === 0) && row.count === 0
		};
	});
	// Most photo opens first, then the most recent activity, then the name. Unknown counts go last.
	undated.sort((a, b) => (b.photoOpens ?? -1) - (a.photoOpens ?? -1) || (b.lastActivity ?? '').localeCompare(a.lastActivity ?? '') || a.name.localeCompare(b.name) || a.albumKey.localeCompare(b.albumKey));

	return { asOf: input.asOf, today: input.today, window: input.window, activityAvailable: activity !== null, launches, undated, publicAlbums: catalogue.length };
}

/** A search over album names: every word typed must appear, in any order, ignoring case. */
export function matchesName(name: string, query: string): boolean {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (words.length === 0) return true;
	const haystack = name.toLowerCase();
	return words.every((word) => haystack.includes(word));
}

/** The launches to overlay, from `?compare=a,b,c`: known launch keys only, no repeats, at most four. */
export function parseCompare(value: string | null, launchKeys: readonly string[]): string[] {
	const known = new Set(launchKeys);
	const picked: string[] = [];
	for (const part of (value ?? '').split(',')) {
		const key = part.trim();
		if (known.has(key) && !picked.includes(key)) picked.push(key);
		if (picked.length === MAX_COMPARED) break;
	}
	return picked;
}

export function figureText(item: Figure): string {
	if (item.state === 'ok' && item.value !== null) return item.value.toLocaleString('en-US');
	if (item.state === 'so_far' && item.value !== null) return `${item.value.toLocaleString('en-US')} so far`;
	if (item.state === 'incomplete') return 'Incomplete';
	return 'Not yet';
}

export function statusText(status: LaunchStatusCell): string {
	return status.kind === 'finished' ? 'Finished' : status.kind === 'today' ? 'Published today' : `Day ${status.day} so far`;
}

export function rankText(rank: RankCell): string {
	if (rank.state === 'ranked' && rank.rank !== null) return `${rank.tied ? 'Tied ' : ''}${ordinal(rank.rank)} of ${rank.compared}`;
	if (rank.state === 'incomplete') return 'Incomplete';
	return 'After day 7';
}
