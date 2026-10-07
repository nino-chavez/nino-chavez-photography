import { isAlbumKey } from './album-key';

/**
 * Where the old gallery report's addresses live now. A pure mapping, so the redirect table is unit-tested
 * without a server. The old report was one page with six tabs chosen by `?section=`; each tab went to the
 * page that took over its job, and the query is carried over only where that page reads it.
 *
 *   /gallery?section=…         (and its internal forms, /photography/analytics and /photography/analytics/operator)
 *   overview, none, or an album scope  →  Home, or that album's report when exactly one album was scoped
 *   albums                             →  the album index; one album: its report; several: the index comparison
 *   photos                             →  the photo view, with every filter it reads
 *   sources                            →  that album's report (arrivals sit there), else Data (arrivals and open locations)
 *   measurement                        →  Data
 *   analytics-preferences, preferences →  Settings
 *   any other section                  →  Home
 *   /gallery/export.csv                →  /photos/export.csv, the same file with the same query
 *
 * Home takes no query. Page Rule 49cd0626 on the report host forwards `/?*` to the site report before the app
 * is reached, so a Home address with a query would never arrive.
 */
export interface NewAddress {
	/** A clean path on the report host. */
	pathname: string;
	/** Empty, or a query string with its leading "?". */
	search: string;
	/** Empty, or an anchor with its leading "#". It wins over the anchor on the old address. */
	hash: string;
}

/** The bare `/photography/analytics` is old too: it always forwarded to the gallery report. */
const OLD_PAGES = new Set(['/gallery', '/photography/analytics', '/photography/analytics/operator']);
const OLD_EXPORTS = new Set(['/gallery/export.csv', '/photography/analytics/operator/export.csv']);

/** The filters the photo view and its CSV read: the old report's own query. */
const REPORT_KEYS = ['period', 'start', 'end', 'measure', 'scope', 'albums', 'traffic', 'sport', 'category', 'source', 'event_date', 'season', 'event_type', 'compare', 'compare_start', 'compare_end'];
const PHOTO_KEYS = [...REPORT_KEYS, 'photo_page', 'photo_rank'];
const EXPORT_KEYS = [...REPORT_KEYS, 'shortlist'];
const DATA_PERIODS = new Set(['7', '30', '90']);

/**
 * The named parameters that were given a value. An empty one is dropped, except `shortlist`: an explicitly empty
 * shortlist is a request for a file with no photos, and the export tells it apart from no shortlist at all.
 */
function pick(params: URLSearchParams, keys: readonly string[]): URLSearchParams {
	const kept = new URLSearchParams();
	for (const key of keys) {
		const value = params.get(key);
		if (value !== null && (value !== '' || key === 'shortlist')) kept.set(key, value);
	}
	return kept;
}

const query = (params: URLSearchParams) => (params.size ? `?${params}` : '');
const address = (pathname: string, search = '', hash = ''): NewAddress => ({ pathname, search, hash });

/** Every well-formed album key the old query named, in order, once each. */
function albumKeys(params: URLSearchParams): string[] {
	return [...new Set((params.get('albums') ?? '').split(',').map((key) => key.trim()).filter(isAlbumKey))];
}

/** The one album a query was scoped to, or null. The old report read `scope=album` only with exactly one key. */
function soleAlbum(params: URLSearchParams): string | null {
	if (params.get('scope') !== 'album') return null;
	const keys = (params.get('albums') ?? '').split(',').map((key) => key.trim()).filter(Boolean);
	return keys.length === 1 && isAlbumKey(keys[0]) ? keys[0] : null;
}

/**
 * The new address for an old one, or null when `pathname` is not an old address. `search` is the raw query
 * string, with or without its "?". Only GET and HEAD requests are ever redirected; that is the caller's rule.
 */
export function oldAddressTarget(pathname: string, search = ''): NewAddress | null {
	const params = new URLSearchParams(search);
	if (OLD_EXPORTS.has(pathname)) return address('/photos/export.csv', query(pick(params, EXPORT_KEYS)));
	if (!OLD_PAGES.has(pathname)) return null;

	const section = params.get('section') ?? 'overview';
	const album = soleAlbum(params);
	switch (section) {
		case 'overview':
			return album ? address(`/albums/${album}`) : address('/');
		case 'albums': {
			if (album) return address(`/albums/${album}`);
			const keys = params.get('scope') === 'selected' ? albumKeys(params) : [];
			return keys.length >= 2 ? address('/albums', `?${new URLSearchParams({ compare: keys.join(',') })}`) : address('/albums');
		}
		case 'photos':
			return address('/photos', query(pick(params, PHOTO_KEYS)));
		case 'sources':
			return album ? address(`/albums/${album}`) : dataAddress(params, '#arrivals');
		case 'measurement':
			return dataAddress(params, '');
		case 'analytics-preferences':
		case 'preferences':
			return address('/settings');
		default:
			return address('/');
	}
}

/** Data reads one number, the days it covers. A custom range has no equal there, so it is not carried over. */
function dataAddress(params: URLSearchParams, hash: string): NewAddress {
	const period = params.get('period');
	return address('/data', period && DATA_PERIODS.has(period) ? `?period=${period}` : '', hash);
}

/**
 * SvelteKit answers a path outside the app's `/photography` base with a bare 404 before `handle` runs, and the
 * old gallery report's clean addresses (`/gallery`, `/gallery/export.csv`) are outside it. `reroute` therefore
 * puts them under the base, at the internal address they used to have. No route is there any more, so a read
 * is redirected by `handle` before routing, and anything else is an ordinary 404.
 */
export function oldAddressReroute(pathname: string): string | null {
	if (pathname === '/gallery') return '/photography/analytics/operator';
	if (pathname === '/gallery/export.csv') return '/photography/analytics/operator/export.csv';
	return null;
}
