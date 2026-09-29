/**
 * Server-side data loading for /explore route
 *
 * This demonstrates the correct SvelteKit pattern:
 * - Direct Supabase calls in +page.server.ts using SERVER client
 * - NO self-fetch anti-pattern (no API route needed!)
 * - Data passed to page component via `data` prop
 *
 * ⚠️ IMPORTANT: We use $lib/supabase/server.ts (not client.ts) here
 * because this code runs SERVER-SIDE ONLY
 */

import { fetchPhotos, getPhotoCount, getFilterCounts, findSimilarPhotos, searchPhotos, getAlbumKeysByFacet, searchByJersey } from '$lib/supabase/server';
import { trackCollectionDiagnostic, keepTrackingAlive } from '$lib/analytics/tracker';
import { resolveAnalyticsContext } from '$lib/analytics/context.server';
import { EXPLORE_FILTER_VALUES, optionalKnownFilter, validSearchCorrelationId } from '$lib/analytics/search-contract';
import { error as httpError } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

function diagnosticErrorCode(cause: unknown): string {
	if (cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string') return cause.code.slice(0, 120);
	return 'search_failed';
}

export const load: PageServerLoad = async ({ url, parent, setHeaders, platform, request, cookies }) => {
  setHeaders({ 'cache-control': 's-maxage=60, stale-while-revalidate=120' });
  const userAgent = request.headers.get('user-agent') ?? '';
	const trafficContext = await resolveAnalyticsContext(request, cookies);

  // Get cached data from parent layout
  const { sports, categories, baseFilterCounts } = await parent();

  // User-facing filter params from URL
  const rawSportFilter = url.searchParams.get('sport');
  const rawCategoryFilter = url.searchParams.get('category');
  const rawPlayTypeFilter = url.searchParams.get('play_type');
  const rawDivisionFilter = url.searchParams.get('division');
  const rawLevelFilter = url.searchParams.get('level');
  const rawSort = url.searchParams.get('sort');
  if ((rawSportFilter && !optionalKnownFilter(rawSportFilter, EXPLORE_FILTER_VALUES.sport)) ||
    (rawCategoryFilter && !optionalKnownFilter(rawCategoryFilter, EXPLORE_FILTER_VALUES.category)) ||
    (rawPlayTypeFilter && !optionalKnownFilter(rawPlayTypeFilter, EXPLORE_FILTER_VALUES.play_type)) ||
    (rawDivisionFilter && !optionalKnownFilter(rawDivisionFilter, EXPLORE_FILTER_VALUES.division)) ||
    (rawLevelFilter && !optionalKnownFilter(rawLevelFilter, EXPLORE_FILTER_VALUES.level)) ||
    (rawSort && !optionalKnownFilter(rawSort, EXPLORE_FILTER_VALUES.sort))) throw httpError(400, 'invalid gallery filter');
  let sportFilter = optionalKnownFilter(rawSportFilter, EXPLORE_FILTER_VALUES.sport);
  let categoryFilter = optionalKnownFilter(rawCategoryFilter, EXPLORE_FILTER_VALUES.category);
  let playTypeFilter = optionalKnownFilter(rawPlayTypeFilter, EXPLORE_FILTER_VALUES.play_type);
  let searchQuery = url.searchParams.get('q') || undefined;
	const searchId = validSearchCorrelationId(url.searchParams.get('search_id'));
  let similarToImageKey = url.searchParams.get('similar_to') || undefined;
  let jerseyFilter = url.searchParams.get('jersey') ? parseInt(url.searchParams.get('jersey')!) : undefined;
  const divisionFilter = optionalKnownFilter(rawDivisionFilter, EXPLORE_FILTER_VALUES.division);
  const levelFilter = optionalKnownFilter(rawLevelFilter, EXPLORE_FILTER_VALUES.level);

  // Sort mode (default to quality)
  const sortBy = (optionalKnownFilter(rawSort, EXPLORE_FILTER_VALUES.sort) || 'quality') as 'quality' | 'newest' | 'oldest';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1')); // Ensure minimum page 1
  const pageSize = 24; // Fixed page size for consistent pagination
  const offset = (page - 1) * pageSize;

  // Album-facet filters (division/level) live on `albums` → resolve to the album_key set photos filter by.
  const facetAlbumKeys = (divisionFilter || levelFilter)
    ? await getAlbumKeysByFacet({ division: divisionFilter, level: levelFilter })
    : undefined;

  const useJersey = jerseyFilter !== undefined && !Number.isNaN(jerseyFilter);

  const filterOptions = {
    sportType: sportFilter,
    photoCategory: categoryFilter,
    playTypes: playTypeFilter ? [playTypeFilter as any] : undefined,
    jerseyNumber: jerseyFilter,
    albumKeys: facetAlbumKeys,
  };

  // Check if any filters are active
  const hasActiveFilters = !!(sportFilter || categoryFilter || playTypeFilter || jerseyFilter || divisionFilter || levelFilter);

  // PERFORMANCE: Stream filter counts — don't block FCP on expensive aggregation query
  // When filters are active, getFilterCounts can take 2-4s. By not awaiting,
  // SvelteKit streams the result and photos render immediately.
  const filterCounts = hasActiveFilters
    ? getFilterCounts(filterOptions)
    : Promise.resolve(baseFilterCounts);

  // Phase 4: Auto-clear incompatible filters (server-side prevention)
  // Uses baseFilterCounts for speed — won't trigger auto-clear (base counts are always > 0)
  // but that's acceptable: photos still render correctly, user can manually clear filters
  const autoFilterCounts = baseFilterCounts;
  const clearedFilters: string[] = [];

  if (playTypeFilter && autoFilterCounts.playTypes) {
    const playTypeCount = autoFilterCounts.playTypes.find(pt => pt.name === playTypeFilter)?.count || 0;
    if (playTypeCount === 0) {
      clearedFilters.push(`Play Type: ${playTypeFilter}`);
      playTypeFilter = undefined;
      delete filterOptions.playTypes;
    }
  }

  if (categoryFilter && autoFilterCounts.categories) {
    const categoryCount = autoFilterCounts.categories.find(c => c.name === categoryFilter)?.count || 0;
    if (categoryCount === 0) {
      clearedFilters.push(`Category: ${categoryFilter}`);
      categoryFilter = undefined;
      delete filterOptions.photoCategory;
    }
  }

  // PERFORMANCE: Fetch photos and count in parallel (saves ~100-200ms)
  let photos;
  let totalCount: number;
  let searchMode: 'structured' | 'semantic' | null = null;
  let parsedDescription = '';

  if (similarToImageKey) {
    // Use vector similarity search if requested
    photos = await findSimilarPhotos(similarToImageKey, pageSize);
    totalCount = photos.length;
  } else if (useJersey) {
    // Jersey filter → comprehensive sightings (RPC), not the sparse jersey_number column.
    // Jersey-primary: scoped by sport only (the RPC join can't compose with category/play_type).
		if (offset === 0) keepTrackingAlive(platform, trackCollectionDiagnostic({ userAgent, type: 'search', status: 'requested', source: 'jersey', trafficContext }));
		let r;
		try {
			r = await searchByJersey(String(jerseyFilter), { sport: sportFilter, limit: pageSize, offset });
		} catch (cause) {
			if (offset === 0) keepTrackingAlive(platform, trackCollectionDiagnostic({ userAgent, type: 'search', status: 'failed', source: 'jersey', errorCode: diagnosticErrorCode(cause), trafficContext }));
		return searchFailureResponse();
		}
    photos = r.photos;
    totalCount = r.totalCount;
    parsedDescription = `Jersey #${jerseyFilter}${sportFilter ? ` · ${sportFilter}` : ''}`;
    searchMode = 'structured';
    if (offset === 0) {
			keepTrackingAlive(platform, trackCollectionDiagnostic({ userAgent, type: 'search', status: 'accepted', resultCount: totalCount, source: 'jersey', trafficContext }));
    }
  } else if (searchQuery) {
    // Smart search: structured parse + vector fallback
		if (offset === 0) keepTrackingAlive(platform, trackCollectionDiagnostic({ userAgent, type: 'search', status: 'requested', source: 'search', trafficContext }));
		let result;
		try {
			result = await searchPhotos(searchQuery, filterOptions, { limit: pageSize, offset, sortBy });
		} catch (cause) {
			if (offset === 0) keepTrackingAlive(platform, trackCollectionDiagnostic({ userAgent, type: 'search', status: 'failed', source: 'search', errorCode: diagnosticErrorCode(cause), trafficContext }));
		return searchFailureResponse();
		}
    photos = result.photos;
    totalCount = result.totalCount;
    searchMode = result.searchMode;
    parsedDescription = result.parsedDescription;
    if (offset === 0) {
			keepTrackingAlive(platform, trackCollectionDiagnostic({ userAgent, type: 'search', status: 'accepted', resultCount: totalCount, source: searchMode ?? 'search', trafficContext }));
    }
  } else {
    // No search — standard filter + paginate
    const [photosResult, countResult] = await Promise.all([
      fetchPhotos({ ...filterOptions, limit: pageSize, offset, sortBy }),
      getPhotoCount(filterOptions),
    ]);
    photos = photosResult;
    totalCount = countResult;
  }

  return {
    // Head tags belong to the loader, never to +page.svelte — the layout is the single
    // emitter, and a page that also emits them ships a duplicate that renders SECOND.
    seo: {
      title: 'Explore Gallery | Nino Chavez Photography',
      description: `Browse ${totalCount.toLocaleString()} professional volleyball action photos. Filter by sport, category, play type, and more.`
    },
    photos,
    totalCount,
    currentPage: page,
    pageSize,
    sortBy,
    sports,
    selectedSport: sportFilter || null,
    categories,
    selectedCategory: categoryFilter || null,
    selectedPlayType: playTypeFilter || null,
    selectedJerseyNumber: jerseyFilter || null,
    selectedDivision: divisionFilter || null,
    selectedLevel: levelFilter || null,
    filterCounts,
    clearedFilters,
    searchQuery,
		searchId,
    searchMode,
		parsedDescription,
		searchError: null,
    similarToImageKey,
  };

  function searchFailureResponse() {
		return {
			seo: { title: 'Search unavailable | Nino Chavez Photography', description: 'The gallery search is temporarily unavailable.' },
			photos: [], totalCount: 0, currentPage: page, pageSize, sortBy, sports,
			selectedSport: sportFilter || null, categories, selectedCategory: categoryFilter || null,
			selectedPlayType: playTypeFilter || null, selectedJerseyNumber: jerseyFilter || null,
			selectedDivision: divisionFilter || null, selectedLevel: levelFilter || null,
			filterCounts: Promise.resolve(baseFilterCounts), clearedFilters, searchQuery, searchId,
			searchMode: null, parsedDescription: '', similarToImageKey,
			searchError: { searchId, errorCode: 'search_unavailable' }
		};
	}
};
