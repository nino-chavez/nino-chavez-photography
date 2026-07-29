/**
 * Builds the album browse list: merge photo albums with video albums, filter, sort.
 *
 * ## Why this is a module and not four lines in the loader
 *
 * It used to live inside `/albums/+page.server.ts`, where Postgres paginated the photo albums
 * (`.range(offset, offset + limit - 1)`) and the video albums were merged in afterwards. The
 * set used to tell a mixed photo+video album apart from a video-only one was built from the
 * PAGE, so on every page that did not contain it, a mixed album looked video-only and was
 * appended again with `photoCount: 0`.
 *
 * Measured against production before the fix: six albums appeared on all eleven pages — 311
 * card slots for 251 distinct albums — and four of them read "0 photos" on pages 2-11 while
 * their own album page, and their page-1 card, said 363 / 211 / 119 / 73.
 *
 * Nothing errored. Every card rendered. The page count was right. It was only visible by
 * scraping all eleven pages and counting how often each album key appeared.
 *
 * A merged list can only be paginated as one list — so the merge happens here, over the whole
 * set, and the caller slices the result. Pure and synchronous, so the invariants that broke
 * ("no key twice", "a mixed album keeps its photo count") are unit-testable.
 */

export type AlbumSortOption = 'name' | 'date' | 'count';

/** The `albums_summary` columns this list needs. */
export interface AlbumSummaryRow {
	album_key: string;
	album_name: string | null;
	photo_count: number | string | null;
	cover_image_url: string | null;
	cover_cf_image_id?: string | null;
	sports?: string[] | null;
	categories?: string[] | null;
	portfolio_count?: number | string | null;
	avg_quality_score?: number | string | null;
	primary_sport?: string | null;
	primary_category?: string | null;
	earliest_photo_date: string | null;
	latest_photo_date: string | null;
}

/** The `videos_summary` columns this list needs. */
export interface VideoSummaryRow {
	album_key: string;
	album_name: string | null;
	video_count: number | string | null;
	cover_thumbnail_url: string | null;
	earliest_video_date: string | null;
	latest_video_date: string | null;
}

export interface AlbumCard {
	albumKey: string;
	albumName: string;
	photoCount: number;
	videoCount: number;
	coverImageUrl: string | null;
	coverCfImageId: string | null;
	sports: string[];
	categories: string[];
	portfolioCount: number;
	avgQualityScore: number;
	primarySport: string;
	primaryCategory: string;
	dateRange: { earliest: string | null; latest: string | null };
}

export interface ListingInput {
	/** EVERY albums_summary row, not a page of them — see the module comment. */
	photoRows: AlbumSummaryRow[];
	videoRows: VideoSummaryRow[];
	unlistedKeys: Set<string>;
	/** Free-text on album name (case-insensitive substring). */
	q?: string;
	sport?: string;
	/** Four-digit year matched against the album's latest content date. */
	year?: string;
	sortBy?: AlbumSortOption;
}

const num = (v: number | string | null | undefined): number => {
	const n = typeof v === 'string' ? parseFloat(v) : v;
	return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};

const UNKNOWN_ALBUM = 'Unknown Album';

function toPhotoCard(row: AlbumSummaryRow, videoCounts: Map<string, number>): AlbumCard {
	return {
		albumKey: row.album_key,
		albumName: row.album_name || UNKNOWN_ALBUM,
		photoCount: num(row.photo_count),
		// A mixed album's video count, which was a literal 0 — so a card read "363 photos" for
		// an album holding 363 photos and 134 videos. Four albums hid 373 videos that way.
		videoCount: videoCounts.get(row.album_key) ?? 0,
		coverImageUrl: row.cover_image_url,
		coverCfImageId: row.cover_cf_image_id ?? null,
		sports: row.sports || [],
		categories: row.categories || [],
		portfolioCount: num(row.portfolio_count),
		avgQualityScore: num(row.avg_quality_score),
		primarySport: row.primary_sport || 'unknown',
		primaryCategory: row.primary_category || 'unknown',
		dateRange: { earliest: row.earliest_photo_date, latest: row.latest_photo_date }
	};
}

function toVideoOnlyCard(row: VideoSummaryRow): AlbumCard {
	return {
		albumKey: row.album_key,
		albumName: row.album_name || UNKNOWN_ALBUM,
		photoCount: 0,
		videoCount: num(row.video_count),
		coverImageUrl: row.cover_thumbnail_url,
		coverCfImageId: null,
		sports: ['volleyball'],
		categories: ['highlights'],
		portfolioCount: 0,
		avgQualityScore: 0,
		primarySport: 'volleyball', // video albums are volleyball-tagged
		primaryCategory: 'highlights',
		dateRange: { earliest: row.earliest_video_date, latest: row.latest_video_date }
	};
}

const latestOf = (a: AlbumCard): string => a.dateRange.latest || '';

/**
 * The complete, ordered browse list. The caller paginates the result — never the input.
 *
 * Filters are applied ONCE, to the merged list. They used to run twice — in Postgres for photo
 * albums, in JS for video ones — which is how they drifted: the SQL year filter was
 * `.lte('latest_photo_date', '<year>-12-31')`, and that literal casts to midnight, so an album
 * whose latest photo landed at 18:00 on Dec 31 failed its own year.
 */
export function buildAlbumListing(input: ListingInput): AlbumCard[] {
	const { photoRows, videoRows, unlistedKeys, q = '', sport = '', year = '', sortBy = 'date' } = input;

	const videoCounts = new Map<string, number>(videoRows.map((v) => [v.album_key, num(v.video_count)]));

	// Every photo-bearing key, from the WHOLE set. Building this from a page slice is the bug
	// this module exists to make impossible.
	const photoAlbumKeys = new Set(photoRows.map((r) => r.album_key));

	const merged: AlbumCard[] = [
		...photoRows.filter((r) => !unlistedKeys.has(r.album_key)).map((r) => toPhotoCard(r, videoCounts)),
		...videoRows
			.filter((v) => !photoAlbumKeys.has(v.album_key) && !unlistedKeys.has(v.album_key))
			.map(toVideoOnlyCard)
	];

	const qLower = q.toLowerCase();
	const filtered = merged.filter((a) => {
		if (q && !a.albumName.toLowerCase().includes(qLower)) return false;
		if (sport && a.primarySport !== sport) return false;
		if (year && latestOf(a).slice(0, 4) !== year) return false;
		return true;
	});

	// The orderings the sort control names: "Most Photos", "Name (A-Z)", "Latest Photos".
	// Video-only albums take part rather than being appended after the sort, so they land where
	// their date puts them — and last under "Most Photos", which they are.
	return filtered.sort((a, b) => {
		switch (sortBy) {
			case 'name':
				return a.albumName.localeCompare(b.albumName);
			case 'date':
				return latestOf(b).localeCompare(latestOf(a));
			case 'count':
			default:
				return b.photoCount - a.photoCount || latestOf(b).localeCompare(latestOf(a));
		}
	});
}

/** Facet options for the discovery filters, from the UNFILTERED universe. */
export function listingFacets(photoRows: AlbumSummaryRow[]): { sports: string[]; years: string[] } {
	const sports = [...new Set(
		photoRows.map((r) => r.primary_sport).filter((s): s is string => !!s && s !== 'unknown')
	)].sort();
	const years = [...new Set(
		photoRows.map((r) => (r.latest_photo_date ? String(r.latest_photo_date).slice(0, 4) : null))
			.filter((y): y is string => !!y)
	)].sort().reverse();
	return { sports, years };
}
