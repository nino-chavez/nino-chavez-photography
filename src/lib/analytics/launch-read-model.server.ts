import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Typed wrapper for `public.analytics_read_launch` (20261006180000): an album's launch, every
 * launch it is compared with, per-photo counts and version-2 exposure. Service role only.
 *
 * The decoder is strict on purpose. It accepts exactly the keys the function returns, so a
 * visitor, browser, visit or event identifier added to the payload later is rejected instead of
 * passed to a page. It also rejects a series that holds today or a later day, because a day
 * after as-of is absent, not zero. Counts are numbers or null; null means unknown.
 */

export type LaunchCoverage = 'complete' | 'partial' | 'unavailable';
export type LaunchStatus = 'in_progress' | 'finished';
export type LaunchTraffic = 'conservative' | 'inclusive';
export type FirstPublicationBasisValue = 'recorded' | 'inferred' | 'unobserved';
export type NoLaunchDateCode = 'unobserved' | 'not_published' | 'no_record';
export type ExposureCoverage = 'none' | 'partial' | 'complete';

export interface LaunchDay {
	/** Day since first publication; null for an undated album's window. */
	day: number | null;
	date: string;
	photoOpens: number | null;
	downloads: number | null;
	albumOpens: number | null;
	coverage: LaunchCoverage;
}

export interface LaunchAgeTotals {
	/** The launch has had this many complete Chicago days. */
	reached: boolean;
	/** All of those days have complete coverage, so the totals exist. */
	complete: boolean;
	photoOpens: number | null;
	downloads: number | null;
	albumOpens: number | null;
}

export interface LaunchAgeRank {
	/** Competition rank by photo opens among launches with a total at this age; null when it has none. */
	rank: number | null;
	/** How many launches have a total at this age. */
	compared: number;
	tied: boolean;
}

export interface Launch {
	albumKey: string;
	albumName: string | null;
	firstPublishedAt: string;
	basis: 'recorded' | 'inferred';
	status: LaunchStatus;
	/** Chicago days fully elapsed since day 0. */
	elapsedDays: number;
	/** Complete days only, from day 0, never zero-filled past as-of. */
	series: LaunchDay[];
	/** The as-of Chicago day, when it falls inside the window. Partial, never part of a total. */
	currentDay: LaunchDay | null;
	totals: { day3: LaunchAgeTotals; day7: LaunchAgeTotals };
	rank: { day3: LaunchAgeRank; day7: LaunchAgeRank };
}

export interface LaunchPhoto {
	photoId: string;
	opens: number;
	/** Photo-level download actions; whole-album downloads are in the daily series only. */
	downloads: number;
	favorites: number;
	/** False when version-2 collection had not begun by the end of the window. Then exposures and renders are null. */
	exposureRecorded: boolean;
	/** Opens on the days exposures cover (from exposure.since). Compare exposures with this, not with `opens`. Null when exposure was not recorded. */
	opensInExposureWindow: number | null;
	exposures: number | null;
	renders: number | null;
}

interface AlbumExtras {
	firstPublishedAtEvidence: string | null;
	window: { start: string; end: string };
	photosInAlbum: number;
	photosWithActivity: number;
	photos: LaunchPhoto[];
	exposure: { since: string | null; coverage: ExposureCoverage };
}

export type DatedLaunchAlbum = Launch & AlbumExtras & { reason: null };

export interface UndatedLaunchAlbum extends AlbumExtras {
	albumKey: string;
	albumName: string | null;
	firstPublishedAt: null;
	basis: 'unobserved' | null;
	status: 'no_launch_date';
	series: LaunchDay[];
	currentDay: LaunchDay | null;
	totals: null;
	rank: null;
	reason: { code: NoLaunchDateCode; text: string | null };
}

export interface LaunchReadModel {
	asOf: string;
	/** The as-of Chicago day. */
	today: string;
	/** The last complete Chicago day; no series holds a later date. */
	lastCompleteDay: string;
	days: number;
	traffic: LaunchTraffic;
	album: DatedLaunchAlbum | UndatedLaunchAlbum;
	/** Every launch with a first publication, newest first. */
	launches: Launch[];
}

export interface LaunchReadInput {
	albumKey: string;
	asOf?: Date | string;
	days?: number;
	traffic?: LaunchTraffic;
	/** Leave out albums currently unlisted from the comparison set. Default true, as in the report. */
	publicOnly?: boolean;
	/** Undated albums only: the window to return, YYYY-MM-DD in Chicago days. Default is the last `days` complete days. */
	windowStart?: string;
	windowEnd?: string;
	photoLimit?: number;
}

const coverages: readonly LaunchCoverage[] = ['complete', 'partial', 'unavailable'];
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
const isInstant = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const isMaybeCount = (v: unknown): v is number | null => v === null || isCount(v);

function fail(what: string): never {
	throw new Error(`Invalid launch read model: ${what}`);
}

function exact(value: unknown, keys: readonly string[], what: string): Record<string, unknown> {
	if (!isObject(value)) fail(`${what} is not an object`);
	const extra = Object.keys(value).filter((key) => !keys.includes(key));
	const missing = keys.filter((key) => !(key in value));
	if (extra.length || missing.length) fail(`${what} keys differ (extra: ${extra.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'})`);
	return value;
}

function addDays(date: string, days: number): string {
	const d = new Date(`${date}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

function decodeDay(value: unknown, what: string): LaunchDay {
	const v = exact(value, ['day', 'date', 'photoOpens', 'downloads', 'albumOpens', 'coverage'], what);
	if (!(v.day === null || isCount(v.day))) fail(`${what}.day`);
	if (!isDate(v.date)) fail(`${what}.date`);
	if (!coverages.includes(v.coverage as LaunchCoverage)) fail(`${what}.coverage`);
	for (const key of ['photoOpens', 'downloads', 'albumOpens'] as const) if (!isMaybeCount(v[key])) fail(`${what}.${key}`);
	// Unknown is never shown as a number: an unavailable day carries no counts.
	if (v.coverage === 'unavailable' && (v.photoOpens !== null || v.downloads !== null || v.albumOpens !== null)) fail(`${what} is unavailable but carries counts`);
	return v as unknown as LaunchDay;
}

function decodeSeries(value: unknown, what: string, today: string, dated: boolean): LaunchDay[] {
	if (!Array.isArray(value)) fail(`${what} is not an array`);
	const series = value.map((item, i) => decodeDay(item, `${what}[${i}]`));
	series.forEach((entry, i) => {
		if (entry.date >= today) fail(`${what}[${i}] is ${entry.date}, on or after today ${today}: future days are absent, not zero`);
		if (i > 0 && entry.date !== addDays(series[i - 1].date, 1)) fail(`${what} days are not consecutive at ${entry.date}`);
		if (dated ? entry.day !== i : entry.day !== null) fail(`${what}[${i}].day is ${entry.day}`);
	});
	return series;
}

function decodeCurrentDay(value: unknown, what: string, today: string, dated: boolean, series: LaunchDay[]): LaunchDay | null {
	if (value === null) return null;
	const day = decodeDay(value, what);
	if (day.date !== today) fail(`${what} must be today (${today}), got ${day.date}`);
	if (day.coverage === 'complete') fail(`${what} cannot be complete`);
	if (dated && day.day !== (series.length ? series.length : 0)) fail(`${what}.day does not follow the series`);
	if (!dated && day.day !== null) fail(`${what}.day`);
	return day;
}

function decodeTotals(value: unknown, what: string): LaunchAgeTotals {
	const v = exact(value, ['reached', 'complete', 'photoOpens', 'downloads', 'albumOpens'], what);
	if (typeof v.reached !== 'boolean' || typeof v.complete !== 'boolean') fail(`${what} flags`);
	for (const key of ['photoOpens', 'downloads', 'albumOpens'] as const) if (!isMaybeCount(v[key])) fail(`${what}.${key}`);
	if (v.complete === true && !v.reached) fail(`${what} is complete but not reached`);
	if ((v.complete === true) !== (v.photoOpens !== null)) fail(`${what} totals exist exactly when complete`);
	return v as unknown as LaunchAgeTotals;
}

function decodeRank(value: unknown, what: string): LaunchAgeRank {
	const v = exact(value, ['rank', 'compared', 'tied'], what);
	if (!(v.rank === null || (isCount(v.rank) && v.rank >= 1)) || !isCount(v.compared) || typeof v.tied !== 'boolean') fail(what);
	if (typeof v.rank === 'number' && v.rank > v.compared) fail(`${what} rank exceeds compared`);
	return v as unknown as LaunchAgeRank;
}

const launchKeys = ['albumKey', 'albumName', 'firstPublishedAt', 'basis', 'status', 'elapsedDays', 'series', 'currentDay', 'totals', 'rank'] as const;
const extraKeys = ['firstPublishedAtEvidence', 'reason', 'window', 'photosInAlbum', 'photosWithActivity', 'photos', 'exposure'] as const;

function decodeLaunchFields(v: Record<string, unknown>, what: string, today: string): Launch {
	if (typeof v.albumKey !== 'string' || !(v.albumName === null || typeof v.albumName === 'string')) fail(`${what} album`);
	if (!isInstant(v.firstPublishedAt)) fail(`${what}.firstPublishedAt`);
	if (v.basis !== 'recorded' && v.basis !== 'inferred') fail(`${what}.basis is ${String(v.basis)}: a dated launch is recorded or inferred`);
	if (v.status !== 'in_progress' && v.status !== 'finished') fail(`${what}.status`);
	if (!isCount(v.elapsedDays)) fail(`${what}.elapsedDays`);
	if ((v.status === 'finished') !== (v.elapsedDays >= 7)) fail(`${what}.status disagrees with elapsedDays`);
	const series = decodeSeries(v.series, `${what}.series`, today, true);
	const currentDay = decodeCurrentDay(v.currentDay, `${what}.currentDay`, today, true, series);
	const totals = exact(v.totals, ['day3', 'day7'], `${what}.totals`);
	const rank = exact(v.rank, ['day3', 'day7'], `${what}.rank`);
	return {
		albumKey: v.albumKey, albumName: v.albumName as string | null, firstPublishedAt: v.firstPublishedAt, basis: v.basis,
		status: v.status, elapsedDays: v.elapsedDays, series, currentDay,
		totals: { day3: decodeTotals(totals.day3, `${what}.totals.day3`), day7: decodeTotals(totals.day7, `${what}.totals.day7`) },
		rank: { day3: decodeRank(rank.day3, `${what}.rank.day3`), day7: decodeRank(rank.day7, `${what}.rank.day7`) }
	};
}

function decodePhotos(value: unknown): LaunchPhoto[] {
	if (!Array.isArray(value)) fail('album.photos is not an array');
	return value.map((item, i) => {
		const v = exact(item, ['photoId', 'opens', 'downloads', 'favorites', 'exposureRecorded', 'opensInExposureWindow', 'exposures', 'renders'], `album.photos[${i}]`);
		if (typeof v.photoId !== 'string' || !isCount(v.opens) || !isCount(v.downloads) || !isCount(v.favorites) || typeof v.exposureRecorded !== 'boolean') fail(`album.photos[${i}]`);
		if (!isMaybeCount(v.exposures) || !isMaybeCount(v.renders) || !isMaybeCount(v.opensInExposureWindow)) fail(`album.photos[${i}] exposure`);
		// An exposure that was not recorded is unknown. It must not arrive as a number.
		if (!v.exposureRecorded && (v.exposures !== null || v.renders !== null || v.opensInExposureWindow !== null)) fail(`album.photos[${i}] has exposure counts although none was recorded`);
		if (v.exposureRecorded && (v.exposures === null || v.renders === null || v.opensInExposureWindow === null)) fail(`album.photos[${i}] was recorded but has no exposure counts`);
		if (typeof v.opensInExposureWindow === 'number' && v.opensInExposureWindow > v.opens) fail(`album.photos[${i}] has more opens in the exposure window than in all`);
		return v as unknown as LaunchPhoto;
	});
}

function decodeExtras(v: Record<string, unknown>): AlbumExtras {
	if (!(v.firstPublishedAtEvidence === null || typeof v.firstPublishedAtEvidence === 'string')) fail('album.firstPublishedAtEvidence');
	const window = exact(v.window, ['start', 'end'], 'album.window');
	if (!isDate(window.start) || !isDate(window.end)) fail('album.window dates');
	if (!isCount(v.photosInAlbum) || !isCount(v.photosWithActivity)) fail('album photo counts');
	const photos = decodePhotos(v.photos);
	if (photos.length > v.photosWithActivity) fail('album.photos is longer than photosWithActivity');
	const exposure = exact(v.exposure, ['since', 'coverage'], 'album.exposure');
	if (!(exposure.since === null || isDate(exposure.since)) || !['none', 'partial', 'complete'].includes(exposure.coverage as string)) fail('album.exposure');
	if (exposure.coverage === 'none' && photos.some((p) => p.exposureRecorded)) fail('album.exposure is none but a photo was recorded');
	return {
		firstPublishedAtEvidence: v.firstPublishedAtEvidence, window: { start: window.start as string, end: window.end as string },
		photosInAlbum: v.photosInAlbum, photosWithActivity: v.photosWithActivity, photos, exposure: { since: exposure.since as string | null, coverage: exposure.coverage as ExposureCoverage }
	};
}

function decodeAlbum(value: unknown, today: string): DatedLaunchAlbum | UndatedLaunchAlbum {
	if (!isObject(value)) fail('album is not an object');
	const dated = value.status !== 'no_launch_date';
	// An undated album has no elapsed days: it never started.
	const v = exact(value, [...launchKeys.filter((key) => dated || key !== 'elapsedDays'), ...extraKeys], 'album');
	const extras = decodeExtras(v);
	if (dated) {
		if (v.reason !== null) fail('a dated album has no reason');
		return { ...decodeLaunchFields(v, 'album', today), ...extras, reason: null };
	}
	if (v.firstPublishedAt !== null) fail('an album with no launch date has no first publication: a date is never invented');
	if (v.basis !== null && v.basis !== 'unobserved') fail('album.basis');
	if (v.totals !== null || v.rank !== null) fail('an undated album has no totals or rank');
	if (typeof v.albumKey !== 'string' || !(v.albumName === null || typeof v.albumName === 'string')) fail('album names');
	const reason = exact(v.reason, ['code', 'text'], 'album.reason');
	if (!['unobserved', 'not_published', 'no_record'].includes(reason.code as string) || !(reason.text === null || typeof reason.text === 'string')) fail('album.reason');
	const series = decodeSeries(v.series, 'album.series', today, false);
	return {
		albumKey: v.albumKey, albumName: v.albumName as string | null, firstPublishedAt: null, basis: v.basis as 'unobserved' | null, status: 'no_launch_date',
		series, currentDay: decodeCurrentDay(v.currentDay, 'album.currentDay', today, false, series), totals: null, rank: null,
		reason: { code: reason.code as NoLaunchDateCode, text: reason.text as string | null }, ...extras
	};
}

export function decodeLaunchReadModel(value: unknown): LaunchReadModel {
	const v = exact(value, ['asOf', 'today', 'lastCompleteDay', 'days', 'traffic', 'album', 'launches'], 'payload');
	if (!isInstant(v.asOf) || !isDate(v.today) || !isDate(v.lastCompleteDay)) fail('payload dates');
	if (v.lastCompleteDay !== addDays(v.today, -1)) fail('lastCompleteDay is not the day before today');
	if (!isCount(v.days) || v.days < 1) fail('payload.days');
	if (v.traffic !== 'conservative' && v.traffic !== 'inclusive') fail('payload.traffic');
	if (!Array.isArray(v.launches)) fail('payload.launches');
	const today = v.today;
	const launches = v.launches.map((item, i) => {
		const l = exact(item, launchKeys, `launches[${i}]`);
		return decodeLaunchFields(l, `launches[${i}]`, today);
	});
	return { asOf: v.asOf, today, lastCompleteDay: v.lastCompleteDay, days: v.days, traffic: v.traffic, album: decodeAlbum(v.album, today), launches };
}

export async function fetchLaunchReadModel(client: SupabaseClient, input: LaunchReadInput): Promise<LaunchReadModel> {
	const { data, error } = await client.rpc('analytics_read_launch', {
		p_album_key: input.albumKey,
		p_as_of: input.asOf === undefined ? new Date().toISOString() : new Date(input.asOf).toISOString(),
		p_days: input.days ?? 14,
		p_traffic: input.traffic ?? 'conservative',
		p_public_only: input.publicOnly ?? true,
		p_window_start: input.windowStart ?? null,
		p_window_end: input.windowEnd ?? null,
		p_photo_limit: input.photoLimit ?? 500
	});
	if (error) {
		if (error.code === 'PGRST202') throw new Error('Launch reporting is not installed. This is not a zero-result report.');
		if (error.code === '23503') throw new Error(`Unknown album: ${input.albumKey}`);
		throw error;
	}
	return decodeLaunchReadModel(data);
}
