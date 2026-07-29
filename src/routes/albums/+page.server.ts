import { error } from '@sveltejs/kit';
import { supabaseServer, matviewClient } from '$lib/supabase/server';
import { topPhotoCoverMap } from '$lib/analytics/covers';
import {
	buildAlbumListing,
	listingFacets,
	type AlbumSummaryRow,
	type VideoSummaryRow
} from '$lib/albums/listing';
import type { PageServerLoad } from './$types';

// NOTE: read-path MV refresh removed (ADR 0001). `albums_summary` is maintained by the
// write event — `scripts/ingest-album.ts` refreshes it after every ingest, the only event
// that changes album data. Refreshing from a public page load was redundant, took an
// ACCESS EXCLUSIVE lock that stalled concurrent readers, and (via the anon EXECUTE grant)
// was triggerable by unauthenticated traffic. Reads now only read.


type SortOption = 'name' | 'date' | 'count';

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	// Always fresh so newly-added albums / cover changes show immediately.
	setHeaders({ 'cache-control': 'no-cache' });

	// Event-discovery mode: the dominant job is "find the album for the event I know Nino shot."
	// Discover by free-text (album name = team/event), sport, and season/year — server-side across
	// ALL albums (the old client name-substring only searched the loaded page).
	const page = parseInt(url.searchParams.get('page') || '1');
	const sortBy = (url.searchParams.get('sort') || 'date') as SortOption;
	const q = url.searchParams.get('q')?.trim() || '';
	const sport = url.searchParams.get('sport')?.trim() || '';
	const year = url.searchParams.get('year')?.trim() || '';
	const limit = 24;
	const offset = (page - 1) * limit;

	// ONE full read of albums_summary, then merge, filter, sort, and paginate IN MEMORY.
	//
	// It used to paginate in Postgres (`.range(offset, offset + limit - 1)`) and merge the
	// video-only albums afterwards, which cannot work: `photoAlbumKeys` was built from the
	// PAGE, so on every page except the one holding it, a mixed photo+video album looked
	// video-only and was appended again with `photoCount: 0`. Measured against production:
	// six albums appeared on all ELEVEN pages — 311 card slots for 251 distinct albums — and
	// four of them (Raiders Open, KRUSH, Bell Pepper, Jalapeño) read "0 photos" on pages 2-11
	// while their own album page and their page-1 card said 363 / 211 / 119 / 73.
	//
	// A merged list can only be paginated as one list, so the whole set has to be in hand
	// first. That is 262 rows / ~125KB / ~200ms, and it REPLACES two queries — the paged one
	// and a second unfiltered read of the same view that existed only to build the facet
	// options.
	//
	// albums_summary / videos_summary are MATERIALIZED VIEWS (anon REVOKE'd — read via
	// service_role). The anon read 42501'd, tripping the legacy fallback (which only
	// returned a stale ~14-album base-table aggregation). See matviewClient.
	const [{ data: allAlbumRows, error: albumsError }, { data: unlistedAlbums }, { data: videoAlbumsData }] =
		await Promise.all([
			matviewClient().from('albums_summary').select('*'),
			supabaseServer.from('album_settings').select('album_key').eq('visibility', 'unlisted'),
			matviewClient().from('videos_summary').select('*')
		]);

	if (albumsError) {
		// Fail loudly. This used to fall back to loadAlbumsLegacy(), a base-table aggregation
		// that PostgREST caps at 1,000 rows — measured against production, that is 11 albums
		// out of 251, with no video counts and every discovery filter ignored. A visitor would
		// have seen eleven albums, no error, and concluded that was the gallery. Showing a
		// wrong catalogue silently is worse than showing none: same judgement as #124.
		console.error('[Albums] albums_summary read failed:', albumsError);
		throw error(503, 'The album list is temporarily unavailable.');
	}

	// Facet options come from the UNFILTERED universe. Deriving them from the filtered list
	// would collapse the sport dropdown to whatever is already selected, with no way back.
	const { sports: availableSports, years: availableYears } = listingFacets(allAlbumRows || []);

	const unlistedKeys = new Set((unlistedAlbums || []).map((a: { album_key: string }) => a.album_key));

	// Merge / filter / sort over the WHOLE set, then slice. buildAlbumListing is pure and
	// unit-tested precisely because this is where the page duplicated six albums onto eleven
	// pages without erroring.
	const merged = buildAlbumListing({
		photoRows: (allAlbumRows || []) as AlbumSummaryRow[],
		videoRows: (videoAlbumsData || []) as VideoSummaryRow[],
		unlistedKeys,
		q,
		sport,
		year,
		sortBy
	});

	const totalAlbums = merged.length;
	const totalPages = Math.ceil(totalAlbums / limit);
	const albums = merged.slice(offset, offset + limit);

	// Auto-covers: override each album's cover with its top-engaged photo (falls back to the
	// existing cover for albums with no engagement yet). AFTER the slice — this is a query per
	// call, and it only ever needs the page's albums.
	const coverMap = await topPhotoCoverMap(albums.map((a) => a.albumKey));
	for (const a of albums) {
		const top = coverMap.get(a.albumKey);
		if (top) a.coverCfImageId = top;
	}

	return {
		// Head tags belong to the loader, never to +page.svelte — the layout is the single
		// emitter, and a page that also emits them ships a duplicate that renders SECOND.
		seo: albumsSeo(totalAlbums),
		albums,
		totalAlbums,
		totalPhotos: albums.reduce((sum, album) => sum + album.photoCount, 0),
		currentPage: page,
		totalPages,
		sortBy,
		// Event-discovery state
		query: q,
		selectedSport: sport,
		selectedYear: year,
		availableSports,
		availableYears
	};
};

/**
 * The albums page's head copy.
 *
 * The count is loader-derived, so it cannot drift the way the unreachable layout version did —
 * that one hardcoded "all 253 photo albums". It now reads 251: the 249 photo albums plus the
 * two that exist only as video, which the old `count - unlisted` arithmetic never included.
 */
function albumsSeo(totalAlbums: number) {
	return {
		title: 'Albums | Nino Chavez Photography',
		description: `Browse ${totalAlbums} volleyball photography albums. View complete event coverage from tournaments and matches.`
	};
}
