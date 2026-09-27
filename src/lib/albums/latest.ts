/**
 * "Latest public gallery" ranking — the rule `/latest`, `/api/latest`, and
 * `/api/galleries/recent` all share.
 *
 * A public album ranks by `album_settings.published_at` descending; an album with no
 * `published_at` (every album published before that column existed, or with no `album_settings`
 * row at all — see `supabase/migrations/20260926140000_album_settings_published_at.sql`) falls
 * back to its capture date (`albums_summary.latest_photo_date`). An album WITH a `published_at`
 * always outranks one without, so the fallback never lets an old, never-(re)published album jump
 * ahead of one freshly published today.
 *
 * Unlisted albums (`album_settings.visibility === 'unlisted'`) are never eligible, at any rank.
 * This mirrors the site-wide privacy gate in `$lib/supabase/server`
 * (`getUnlistedAlbumKeys` / `excludeUnlisted`), re-implemented here rather than imported because
 * this module has to stay pure and DB-free to unit test — see `latest.test.ts`. The server-side
 * caller that actually reads the tables is `getRankedPublicAlbums` in `$lib/supabase/server`.
 */
// Relative, not `$lib/...` — this module is exercised directly by `tsx --test` (see
// `latest.test.ts`), which does not resolve SvelteKit's `$lib` alias the way Vite does.
import { createAlbumSlug } from '../utils';
import { cfImageUrl } from '../utils/cloudflare-images';

/** The `albums_summary` columns this ranking needs. */
export interface LatestCandidateRow {
	album_key: string;
	album_name: string | null;
	cover_cf_image_id: string | null;
	photo_count: number | string | null;
	/** Used both as the capture-date fallback and as the API's `event_date`. */
	latest_photo_date: string | null;
}

/** The `album_settings` columns this ranking needs. */
export interface AlbumSettingsForRanking {
	album_key: string;
	visibility: 'public' | 'unlisted';
	published_at: string | null;
}

/**
 * Cache-control shared by every "latest gallery" surface (`/latest`, `/api/latest`,
 * `/api/galleries/recent`): short enough that a fresh publish shows up within about a minute,
 * long enough to absorb a burst (an Instagram post landing) without hammering the DB on every
 * request. One constant so the three routes can't drift to three different windows.
 */
export const LATEST_GALLERY_CACHE_CONTROL = 'public, max-age=60, s-maxage=60';

export interface RankedAlbum {
	albumKey: string;
	albumName: string;
	coverCfImageId: string | null;
	photoCount: number;
	eventDate: string | null;
	publishedAt: string | null;
}

const UNTITLED = 'Untitled Album';

const num = (v: number | string | null | undefined): number => {
	const n = typeof v === 'string' ? parseFloat(v) : v;
	return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};

/**
 * The leading `YYYY-MM-DD` of a date/timestamp string, or `null`.
 *
 * `photo_metadata.photo_date` (and therefore `albums_summary.latest_photo_date`) carries a
 * time-of-day, not just a date — `$lib/albums/listing`'s own comment documents a bug from
 * exactly this ("an album whose latest photo landed at 18:00 on Dec 31 failed its own year").
 * A naive-timestamp string with no zone offset parses through `new Date(...)` as LOCAL time
 * per the ISO 8601 spec, which differs between a developer's own machine and a UTC-only
 * Cloudflare Worker for the IDENTICAL stored value — an evening shoot could read one calendar
 * day in dev and the next day in production. Keeping only the calendar-date prefix sidesteps
 * that: the three numbers in `YYYY-MM-DD` are treated as ground truth and never reinterpreted
 * against any runtime's local timezone. Once reduced to a bare date, `new Date()` + a `'UTC'`
 * Intl.DateTimeFormat IS deterministic (a date-only string is the one case ISO 8601 mandates
 * as UTC), which is what the display layer relies on.
 */
function toDateOnly(raw: string | null): string | null {
	const match = raw ? /^(\d{4}-\d{2}-\d{2})/.exec(raw) : null;
	return match ? match[1] : null;
}

/**
 * Every eligible (non-unlisted) album, newest first: `published_at` descending where it
 * exists, then capture-date descending for the rest. The one function every "what's newest"
 * surface calls — `/latest` and `/api/latest` take index 0, `/api/galleries/recent` takes the
 * first N.
 *
 * `candidates` should be the WHOLE `albums_summary` set (unfiltered), same contract as
 * `buildAlbumListing` — see that module's comment for why paginating before merging breaks.
 * `settings` should be the whole `album_settings` set; an album absent from it is legacy-public
 * (no row) and is ranked by capture date like any other album with no `published_at`.
 */
export function rankPublicAlbums(params: {
	candidates: LatestCandidateRow[];
	settings: AlbumSettingsForRanking[];
}): RankedAlbum[] {
	const unlisted = new Set(
		params.settings.filter((s) => s.visibility === 'unlisted').map((s) => s.album_key)
	);
	const publishedAtByKey = new Map(
		params.settings
			.filter((s) => s.visibility !== 'unlisted' && s.published_at)
			.map((s) => [s.album_key, s.published_at as string])
	);

	return params.candidates
		.filter((c) => !unlisted.has(c.album_key))
		.map(
			(c): RankedAlbum => ({
				albumKey: c.album_key,
				albumName: c.album_name || UNTITLED,
				coverCfImageId: c.cover_cf_image_id,
				photoCount: num(c.photo_count),
				eventDate: toDateOnly(c.latest_photo_date),
				publishedAt: publishedAtByKey.get(c.album_key) ?? null
			})
		)
		.sort((a, b) => {
			const aHas = a.publishedAt !== null;
			const bHas = b.publishedAt !== null;
			// Any real published_at outranks the capture-date fallback, regardless of how the
			// two dates compare as strings — an album published today but shot last year must
			// still beat an unpublished album shot yesterday.
			if (aHas !== bHas) return aHas ? -1 : 1;
			const aKey = a.publishedAt ?? a.eventDate ?? '';
			const bKey = b.publishedAt ?? b.eventDate ?? '';
			return bKey.localeCompare(aKey);
		});
}

/** The single newest public album, or `null` when there are no eligible albums at all. */
export function selectLatestAlbum(params: {
	candidates: LatestCandidateRow[];
	settings: AlbumSettingsForRanking[];
}): RankedAlbum | null {
	return rankPublicAlbums(params)[0] ?? null;
}

/** The JSON shape `/api/latest` and `/api/galleries/recent` both emit for one album. */
export interface LatestApiAlbum {
	album_key: string;
	album_name: string;
	url: string;
	event_date: string | null;
	cover_url: string | null;
	photo_count: number;
}

/**
 * `RankedAlbum` -> the public API shape. The one place that builds the album URL and the cover
 * image URL, so both stay derived from the row's own fields — `createAlbumSlug` (never a bare
 * key) and `coverCfImageId` (never rebuilt from album key + filename, which breaks the moment a
 * photo is replaced in place and gets a new Cloudflare Images id).
 */
export function toLatestApiAlbum(album: RankedAlbum, opts: { siteUrl: string }): LatestApiAlbum {
	return {
		album_key: album.albumKey,
		album_name: album.albumName,
		url: `${opts.siteUrl}/albums/${createAlbumSlug(album.albumName, album.albumKey)}`,
		event_date: album.eventDate,
		cover_url: album.coverCfImageId ? cfImageUrl(album.coverCfImageId, 'medium') : null,
		photo_count: album.photoCount
	};
}
