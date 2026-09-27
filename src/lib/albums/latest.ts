/**
 * "Latest public gallery" ranking — the rule `/latest`, `/api/latest`, and
 * `/api/galleries/recent` all share.
 *
 * A public album ranks by `album_settings.published_at` descending; an album with no
 * `published_at` (every album published before that column existed, or with no `album_settings`
 * row at all — see `supabase/migrations/20260926140000_album_settings_published_at.sql`) falls
 * back to its event date: `albums.event_date` (the authoritative, operator-set or
 * ingest-derived-once value) when the album has one, else the derived capture date
 * (`albums_summary.latest_photo_date` / `videos_summary.latest_video_date`) for the rare album
 * that predates `albums.event_date` entirely. An album WITH a `published_at` always outranks one
 * without, so the fallback never lets an old, never-(re)published album jump ahead of one
 * freshly published today.
 *
 * Photo AND video-only albums are both eligible — a video-only publish (no row in
 * `albums_summary`, which is derived purely from `photo_metadata`) must still be able to become
 * "latest". The caller (`getRankedPublicAlbums` in `$lib/supabase/server`) is responsible for
 * reducing `videos_summary` to the video-ONLY subset before calling this — mirroring
 * `$lib/albums/listing`'s own `videoOnlyRows`, reused rather than re-implemented, so a mixed
 * photo+video album is never counted twice.
 *
 * Unlisted albums (`album_settings.visibility === 'unlisted'`) are never eligible, at any rank.
 * This mirrors the site-wide privacy gate in `$lib/supabase/server`
 * (`getUnlistedAlbumKeys` / `excludeUnlisted`), re-implemented here rather than imported because
 * this module has to stay pure and DB-free to unit test — see `latest.test.ts`.
 */
// Relative, not `$lib/...` — this module is exercised directly by `tsx --test` (see
// `latest.test.ts`), which does not resolve SvelteKit's `$lib` alias the way Vite does.
import { createAlbumSlug } from '../utils';
import { cfImageUrl } from '../utils/cloudflare-images';

/** The `albums_summary` columns this ranking needs — one row per PHOTO-bearing album. */
export interface LatestPhotoCandidateRow {
	album_key: string;
	album_name: string | null;
	cover_cf_image_id: string | null;
	photo_count: number | string | null;
	/** Capture-date fallback, used only when the album has no `albums.event_date`. */
	latest_photo_date: string | null;
}

/**
 * The `videos_summary` columns this ranking needs — one row per VIDEO-ONLY album (already
 * reduced from the full `videos_summary` set by the caller; see the module comment).
 */
export interface LatestVideoCandidateRow {
	album_key: string;
	album_name: string | null;
	cover_thumbnail_url: string | null;
	video_count: number | string | null;
	/** Capture-date fallback, used only when the album has no `albums.event_date`. */
	latest_video_date: string | null;
}

/** The `albums` columns this ranking needs — the authoritative event date, one row per album. */
export interface AlbumEventDateRow {
	album_key: string;
	event_date: string | null;
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
	/** Set only for a video-only album, whose cover has no Cloudflare Images id. */
	coverImageUrl: string | null;
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
 * `photo_metadata.photo_date` (and therefore `albums_summary.latest_photo_date` /
 * `videos_summary.latest_video_date`) carries a time-of-day, not just a date —
 * `$lib/albums/listing`'s own comment documents a bug from exactly this ("an album whose latest
 * photo landed at 18:00 on Dec 31 failed its own year"). A naive-timestamp string with no zone
 * offset parses through `new Date(...)` as LOCAL time per the ISO 8601 spec, which differs
 * between a developer's own machine and a UTC-only Cloudflare Worker for the IDENTICAL stored
 * value — an evening shoot could read one calendar day in dev and the next day in production.
 * Keeping only the calendar-date prefix sidesteps that: the three numbers in `YYYY-MM-DD` are
 * treated as ground truth and never reinterpreted against any runtime's local timezone. Once
 * reduced to a bare date, `new Date()` + a `'UTC'` Intl.DateTimeFormat IS deterministic (a
 * date-only string is the one case ISO 8601 mandates as UTC), which is what the display layer
 * relies on. `albums.event_date` is already a bare `date` column with no time component, so this
 * is a no-op on it — applied uniformly anyway so every source of `eventDate` goes through the
 * same normalization.
 */
function toDateOnly(raw: string | null): string | null {
	const match = raw ? /^(\d{4}-\d{2}-\d{2})/.exec(raw) : null;
	return match ? match[1] : null;
}

/** A candidate normalized to the one shape `rankPublicAlbums` sorts and maps — photo or video. */
interface NormalizedCandidate {
	albumKey: string;
	albumName: string | null;
	coverCfImageId: string | null;
	coverImageUrl: string | null;
	contentCount: number | string | null;
	/** MAX(photo_date) / latest_video_date — the fallback used only when `albums.event_date` is null. */
	capturedAt: string | null;
}

/**
 * Every eligible (non-unlisted) album, newest first: `published_at` descending where it
 * exists, then event date descending for the rest. The one function every "what's newest"
 * surface calls — `/latest` and `/api/latest` take index 0, `/api/galleries/recent` takes the
 * first N.
 *
 * `candidates` should be the WHOLE `albums_summary` set (unfiltered), same contract as
 * `buildAlbumListing` — see that module's comment for why paginating before merging breaks.
 * `videoCandidates` should already be reduced to video-ONLY albums (see the module comment).
 * `settings` should be the whole `album_settings` set; an album absent from it is legacy-public
 * (no row) and is ranked by event date like any other album with no `published_at`.
 * `albumDates` should be the whole `albums` set — the authoritative `event_date` per album,
 * preferred over either capture-date fallback whenever it is set.
 */
export function rankPublicAlbums(params: {
	candidates: LatestPhotoCandidateRow[];
	videoCandidates?: LatestVideoCandidateRow[];
	settings: AlbumSettingsForRanking[];
	albumDates?: AlbumEventDateRow[];
}): RankedAlbum[] {
	const unlisted = new Set(
		params.settings.filter((s) => s.visibility === 'unlisted').map((s) => s.album_key)
	);
	const publishedAtByKey = new Map(
		params.settings
			.filter((s) => s.visibility !== 'unlisted' && s.published_at)
			.map((s) => [s.album_key, s.published_at as string])
	);
	const authoritativeEventDate = new Map(
		(params.albumDates ?? [])
			.filter((a) => a.event_date)
			.map((a) => [a.album_key, a.event_date as string])
	);

	const photoRows: NormalizedCandidate[] = params.candidates.map((c) => ({
		albumKey: c.album_key,
		albumName: c.album_name,
		coverCfImageId: c.cover_cf_image_id,
		coverImageUrl: null,
		contentCount: c.photo_count,
		capturedAt: c.latest_photo_date
	}));
	const videoRows: NormalizedCandidate[] = (params.videoCandidates ?? []).map((v) => ({
		albumKey: v.album_key,
		albumName: v.album_name,
		coverCfImageId: null,
		coverImageUrl: v.cover_thumbnail_url,
		// A video-only album's "photo_count" is 0 — matches `$lib/albums/listing`'s
		// `toVideoOnlyCard` convention; the API has no separate video_count field (yet).
		contentCount: 0,
		capturedAt: v.latest_video_date
	}));

	return [...photoRows, ...videoRows]
		.filter((c) => !unlisted.has(c.albumKey))
		.map(
			(c): RankedAlbum => ({
				albumKey: c.albumKey,
				albumName: c.albumName || UNTITLED,
				coverCfImageId: c.coverCfImageId,
				coverImageUrl: c.coverImageUrl,
				photoCount: num(c.contentCount),
				eventDate: toDateOnly(authoritativeEventDate.get(c.albumKey) ?? c.capturedAt),
				publishedAt: publishedAtByKey.get(c.albumKey) ?? null
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
	candidates: LatestPhotoCandidateRow[];
	videoCandidates?: LatestVideoCandidateRow[];
	settings: AlbumSettingsForRanking[];
	albumDates?: AlbumEventDateRow[];
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
 * photo is replaced in place and gets a new Cloudflare Images id). A video-only album has no
 * `coverCfImageId`; its raw `coverImageUrl` (a Cloudflare Stream thumbnail, not an
 * imagedelivery.net URL) is used directly instead — same preference order as
 * `AlbumCard.svelte`'s `optimizedCoverUrl`.
 */
export function toLatestApiAlbum(album: RankedAlbum, opts: { siteUrl: string }): LatestApiAlbum {
	return {
		album_key: album.albumKey,
		album_name: album.albumName,
		url: `${opts.siteUrl}/albums/${createAlbumSlug(album.albumName, album.albumKey)}`,
		event_date: album.eventDate,
		cover_url: album.coverCfImageId ? cfImageUrl(album.coverCfImageId, 'medium') : album.coverImageUrl,
		photo_count: album.photoCount
	};
}
