import type { SupabaseClient } from '@supabase/supabase-js';
import { buildOperatorReport, type OperatorReport } from './operator-report.server';
import { PHOTO_PAGE_SIZE } from './photo-view';
import { readAll } from './read-all.server';
import { assertReportDateBounds, isPhotoRank, parseReportQuery, publishedAfterComparison, type PhotoRank, type ReportQuery } from './report-contract';

/**
 * The reads behind the gallery-wide photo view: the old gallery report's Photos tab, for every album or the
 * ones chosen. Public albums only, for everyone: an unlisted album is never read here, so it is not offered in
 * the album picker, not counted, and not in the CSV. The album report is where one album is read in full.
 *
 * A part that cannot be read says so and is never shown as zero: an unreadable catalogue leaves the photo
 * ranking as it is and names the albums by key.
 */

export interface PhotoViewAlbum {
	albumKey: string;
	name: string;
	photoCount: number;
}

export interface PhotoViewData {
	/** The report, cut to what this page shows. The full report also carries tabs this page does not have. */
	report: Pick<OperatorReport, 'available' | 'error' | 'query' | 'previous' | 'comparison' | 'coverage' | 'photos' | 'photoPagination' | 'albumOnlyActions' | 'rising' | 'dataAsOf'> & {
		albumCount: number;
		/** Albums first published after the comparison period began: they have nothing earlier to compare with. */
		newAlbumKeys: string[];
		/** Albums whose photos had activity this period, for the note about what Rising leaves out. */
		activeAlbums: Array<{ albumKey: string; photoActions: number }>;
		sourceOptions: string[];
	};
	rank: PhotoRank;
	albums: PhotoViewAlbum[];
	albumsAvailable: boolean;
	facets: { sports: string[]; seasons: string[]; categories: string[] };
}

const unique = (values: Array<string | null | undefined>) => [...new Set(values.map((value) => value || 'unknown'))].sort();

/** The query and the ranking page the address asks for. Throws a RangeError for dates the report refuses. */
export function photoViewRequest(params: URLSearchParams, now = new Date()): { query: ReportQuery; rank: PhotoRank; page: number } {
	const asked = parseReportQuery(params, now);
	// Same-age comparison is the album index's job. Here it would only switch Rising off, so an old address that asks for it reads as "no comparison".
	const query: ReportQuery = asked.compare === 'publication_age' ? { ...asked, compare: 'none' } : asked;
	assertReportDateBounds(query);
	const rankAsked = params.get('photo_rank');
	const page = Math.max(0, Math.min(10_000, Number.parseInt(params.get('photo_page') ?? '0', 10) || 0));
	return { query, rank: isPhotoRank(rankAsked) ? rankAsked : 'popular', page };
}

export async function loadPhotoView(admin: SupabaseClient, request: { query: ReportQuery; rank: PhotoRank; page: number }): Promise<PhotoViewData> {
	const { query, rank, page } = request;
	const [report, summaries, settings, facts, categories] = await Promise.all([
		buildOperatorReport(admin, query, { publicOnly: true, photoWindow: { page, pageSize: PHOTO_PAGE_SIZE, rank }, includeDiagnostics: false, includeVisitorEstimate: false, includeToday: false, cacheRole: 'service_role' }),
		readAll<{ album_key: string; album_name: string; photo_count: number }>((from) => admin.from('albums_summary').select('album_key, album_name, photo_count').order('album_key').range(from, from + 999)),
		readAll<{ album_key: string; visibility: string | null }>((from) => admin.from('album_settings').select('album_key, visibility').order('album_key').range(from, from + 999)),
		readAll<{ album_key: string; sport: string | null; event_date: string | null }>((from) => admin.from('albums').select('album_key, sport, event_date').order('album_key').range(from, from + 999)),
		admin.rpc('analytics_category_facets') as PromiseLike<{ data: Array<{ album_key: string; photo_category: string | null }> | null; error: unknown }>
	]);

	// An album whose visibility could not be read is not listed, rather than guessed public.
	const catalogueOk = !summaries.error && !settings.error;
	const unlisted = new Set(settings.data.filter((row) => row.visibility === 'unlisted').map((row) => row.album_key));
	const isPublic = (key: string) => catalogueOk && !unlisted.has(key);
	const albums = catalogueOk
		? summaries.data.filter((row) => isPublic(row.album_key)).map((row) => ({ albumKey: row.album_key, name: row.album_name, photoCount: Number(row.photo_count) })).sort((a, b) => a.name.localeCompare(b.name))
		: [];

	const publicFacts = facts.error ? [] : facts.data.filter((row) => isPublic(row.album_key));
	const publicCategories = categories.error ? [] : (categories.data ?? []).filter((row) => isPublic(row.album_key));
	const photoActions = new Map(report.albumOnlyActions.map((row) => [row.albumKey, row.count ?? 0]));

	return {
		report: {
			available: report.available, error: report.error, query: report.query, previous: report.previous, comparison: report.comparison,
			coverage: report.coverage, photos: report.photos, photoPagination: report.photoPagination, albumOnlyActions: report.albumOnlyActions,
			rising: report.rising, dataAsOf: report.dataAsOf,
			albumCount: report.albums.length,
			newAlbumKeys: report.albums.filter((album) => publishedAfterComparison(album.publicationAt, report.query)).map((album) => album.albumKey),
			activeAlbums: report.albums.map((album) => ({ albumKey: album.albumKey, photoActions: (album.count ?? 0) - (photoActions.get(album.albumKey) ?? 0) })).filter((album) => album.photoActions > 0),
			sourceOptions: [...new Set([...report.sources.arrivals.map((row) => row.source), ...report.sources.openLocations.map((row) => row.source)])].filter((value) => value !== 'Unknown / no tag').sort()
		},
		rank, albums, albumsAvailable: catalogueOk,
		facets: { sports: unique(publicFacts.map((row) => row.sport)), seasons: unique(publicFacts.map((row) => row.event_date?.slice(0, 4))), categories: unique(publicCategories.map((row) => row.photo_category)) }
	};
}
