import { supabaseServer } from '$lib/supabase/server';
import { PHOTOS_READ } from '$lib/supabase/columns';
import { cfImageUrl } from '$lib/utils/cloudflare-images';
import type { PageServerLoad } from './$types';

// NOTE: read-path MV refresh removed (ADR 0001). `albums_summary` is maintained by the
// write event — `scripts/ingest-album.ts` refreshes it after every ingest, the only event
// that changes album data. Refreshing from a public page load was redundant, took an
// ACCESS EXCLUSIVE lock that stalled concurrent readers, and (via the anon EXECUTE grant)
// was triggerable by unauthenticated traffic. Reads now only read.

interface AlbumMetadata {
	name: string;
	count: number;
	coverImageUrl: string | null;
	sports: Set<string>;
	categories: Set<string>;
	portfolioCount: number;
	avgQualityScore: number;
	totalQualityScore: number;
}

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

	// Query materialized view for instant results with pagination.
	// (View is refreshed by ingest — ADR 0001 — not on read.)
	let query = supabaseServer
		.from('albums_summary')
		.select('*', { count: 'exact' });

	// Discovery filters (server-side, across all albums)
	if (q) query = query.ilike('album_name', `%${q}%`);
	if (sport) query = query.eq('primary_sport', sport);
	if (year && /^\d{4}$/.test(year)) {
		query = query.gte('latest_photo_date', `${year}-01-01`).lte('latest_photo_date', `${year}-12-31`);
	}

	// Apply sorting
	switch (sortBy) {
		case 'name':
			query = query.order('album_name', { ascending: true });
			break;
		case 'date':
			query = query.order('latest_photo_date', { ascending: false, nullsFirst: false });
			break;
		case 'count':
		default:
			query = query
				.order('photo_count', { ascending: false })
				.order('latest_photo_date', { ascending: false, nullsFirst: false });
			break;
	}

	// Apply pagination
	query = query.range(offset, offset + limit - 1);

	const [{ data: albumsData, error, count }, { data: unlistedAlbums }, { data: videoAlbumsData }, { data: facetRows }] = await Promise.all([
		query,
		supabaseServer
			.from('album_settings')
			.select('album_key')
			.eq('visibility', 'unlisted'),
		supabaseServer
			.from('videos_summary')
			.select('*'),
		// Facet options for the discovery filters (whole table — ~260 rows, cheap)
		supabaseServer
			.from('albums_summary')
			.select('primary_sport, latest_photo_date')
	]);

	// Build discovery facet options (sports present, years present)
	const availableSports = [...new Set((facetRows || [])
		.map((r: any) => r.primary_sport)
		.filter((s: string | null): s is string => !!s && s !== 'unknown'))].sort();
	const availableYears = [...new Set((facetRows || [])
		.map((r: any) => (r.latest_photo_date ? String(r.latest_photo_date).slice(0, 4) : null))
		.filter((y: string | null): y is string => !!y))].sort().reverse();

	if (error) {
		console.error('[Albums] Error fetching from albums_summary view:', error);
		// Fallback to legacy aggregation if view doesn't exist
		return await loadAlbumsLegacy(page, sortBy, limit, offset);
	}

	const unlistedKeys = new Set((unlistedAlbums || []).map((a: { album_key: string }) => a.album_key));

	// Map materialized view results to expected format, filtering out unlisted albums
	const photoAlbumKeys = new Set((albumsData || []).map((a) => a.album_key));
	const albums = (albumsData || []).filter((album) => !unlistedKeys.has(album.album_key)).map((album) => ({
		albumKey: album.album_key,
		albumName: album.album_name || 'Unknown Album',
		photoCount: parseInt(album.photo_count) || 0,
		videoCount: 0,
		coverImageUrl: album.cover_image_url,
		coverCfImageId: (album as any).cover_cf_image_id as string | null ?? null,
		sports: album.sports || [],
		categories: album.categories || [],
		portfolioCount: parseInt(album.portfolio_count) || 0,
		avgQualityScore: parseFloat(album.avg_quality_score) || 0,
		primarySport: album.primary_sport || 'unknown',
		primaryCategory: album.primary_category || 'unknown',
		dateRange: {
			earliest: album.earliest_photo_date,
			latest: album.latest_photo_date
		}
	}));

	// Merge video-only albums from videos_summary (respect the active discovery filters)
	const videoOnlyAlbums = (videoAlbumsData || [])
		.filter((v) => !photoAlbumKeys.has(v.album_key) && !unlistedKeys.has(v.album_key))
		.filter((v) => !q || (v.album_name || '').toLowerCase().includes(q.toLowerCase()))
		.filter(() => !sport || sport === 'volleyball') // video albums are volleyball-tagged
		.filter((v) => !year || String(v.latest_video_date || '').slice(0, 4) === year)
		.map((v) => ({
			albumKey: v.album_key,
			albumName: v.album_name || 'Unknown Album',
			photoCount: 0,
			videoCount: parseInt(v.video_count) || 0,
			coverImageUrl: v.cover_thumbnail_url,
			coverCfImageId: null as string | null,
			sports: ['volleyball'],
			categories: ['highlights'],
			portfolioCount: 0,
			avgQualityScore: 0,
			primarySport: 'volleyball',
			primaryCategory: 'highlights',
			dateRange: {
				earliest: v.earliest_video_date,
				latest: v.latest_video_date
			}
		}));

	albums.push(...videoOnlyAlbums);

	const totalAlbums = (count || 0) - unlistedKeys.size;
	const totalPages = Math.ceil(totalAlbums / limit);

	return {
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

// Legacy fallback method - Browse Mode: No filters
async function loadAlbumsLegacy(page: number, sortBy: SortOption, limit: number, offset: number) {
	// Get unique albums with photo counts from Supabase
	const { data: albumData, error } = await supabaseServer
		.from(PHOTOS_READ)
		.select('album_key, album_name, cf_image_id, sport_type, photo_category, sharpness')
		.not('album_key', 'is', null)
		.not('sharpness', 'is', null) // Only enriched photos
		.order('album_key', { ascending: true }); // Order by album for better aggregation

	if (error) {
		console.error('[Albums] Error fetching albums:', error);
		throw new Error(`Failed to fetch albums: ${error.message}`);
	}

	// Deduplicate and count photos per album, keeping first photo for cover
	// Enhanced with sport/category metadata (NEW - Week 2)
	const albumMap = new Map<string, AlbumMetadata>();

	for (const row of albumData || []) {
		const key = (row as any).album_key;
		const name = (row as any).album_name || 'Unknown Album';
		const coverUrl = (row as any).cf_image_id ? cfImageUrl((row as any).cf_image_id, 'medium') : null;
		const sport = (row as any).sport_type || 'unknown';
		const category = (row as any).photo_category || 'unknown';
		const sharpness = parseFloat((row as any).sharpness) || 0;
		const isHighQuality = sharpness >= 0.7; // Use sharpness as proxy for portfolio-worthy

		if (albumMap.has(key)) {
			const existing = albumMap.get(key)!;
			existing.count++;
			existing.sports.add(sport);
			existing.categories.add(category);
			existing.totalQualityScore += sharpness;
			if (isHighQuality) existing.portfolioCount++;
		} else {
			// First photo in this album becomes the cover
			albumMap.set(key, {
				name,
				count: 1,
				coverImageUrl: coverUrl,
				sports: new Set([sport]),
				categories: new Set([category]),
				portfolioCount: isHighQuality ? 1 : 0,
				avgQualityScore: 0,
				totalQualityScore: sharpness
			});
		}
	}

	// Convert to array, calculate averages, and apply sorting
	let albums = Array.from(albumMap.entries())
		.map(([key, data]) => ({
			albumKey: key,
			albumName: data.name,
			photoCount: data.count,
			coverImageUrl: data.coverImageUrl,
			coverCfImageId: null as string | null,
			sports: Array.from(data.sports).filter(s => s !== 'unknown'),
			categories: Array.from(data.categories).filter(c => c !== 'unknown'),
			portfolioCount: data.portfolioCount,
			avgQualityScore: data.totalQualityScore / data.count,
			primarySport: Array.from(data.sports)[0] || 'unknown',
			primaryCategory: Array.from(data.categories)[0] || 'unknown',
			dateRange: { earliest: null, latest: null } // Legacy doesn't have date ranges
		}));

	// Apply sorting
	switch (sortBy) {
		case 'name':
			albums.sort((a, b) => a.albumName.localeCompare(b.albumName));
			break;
		case 'date':
			// Can't sort by date in legacy mode, fallback to count
			albums.sort((a, b) => b.photoCount - a.photoCount);
			break;
		case 'count':
		default:
			// Primary sort by count, secondary by name (since we don't have dates in legacy)
			albums.sort((a, b) => {
				const countDiff = b.photoCount - a.photoCount;
				if (countDiff !== 0) return countDiff;
				return a.albumName.localeCompare(b.albumName);
			});
			break;
	}

	// Apply pagination
	const totalAlbums = albums.length;
	const totalPages = Math.ceil(totalAlbums / limit);
	const paginatedAlbums = albums.slice(offset, offset + limit);

	return {
		albums: paginatedAlbums,
		totalAlbums,
		totalPhotos: albumData?.length || 0,
		currentPage: page,
		totalPages,
		sortBy,
		query: '',
		selectedSport: '',
		selectedYear: '',
		availableSports: [] as string[],
		availableYears: [] as string[]
	};
}
