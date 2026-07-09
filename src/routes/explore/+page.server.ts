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
import { trackSearchQuery } from '$lib/analytics/tracker';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, parent, setHeaders }) => {
  setHeaders({ 'cache-control': 's-maxage=60, stale-while-revalidate=120' });

  // Get cached data from parent layout
  const { sports, categories, baseFilterCounts } = await parent();

  // User-facing filter params from URL
  let sportFilter = url.searchParams.get('sport') || undefined;
  let categoryFilter = url.searchParams.get('category') || undefined;
  let playTypeFilter = url.searchParams.get('play_type') || undefined;
  let searchQuery = url.searchParams.get('q') || undefined;
  let similarToImageKey = url.searchParams.get('similar_to') || undefined;
  let jerseyFilter = url.searchParams.get('jersey') ? parseInt(url.searchParams.get('jersey')!) : undefined;
  const divisionFilter = url.searchParams.get('division') || undefined;
  const levelFilter = url.searchParams.get('level') || undefined;

  // Sort mode (default to quality)
  const sortBy = (url.searchParams.get('sort') || 'quality') as 'quality' | 'newest' | 'oldest';
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
    const r = await searchByJersey(String(jerseyFilter), { sport: sportFilter, limit: pageSize, offset });
    photos = r.photos;
    totalCount = r.totalCount;
    parsedDescription = `Jersey #${jerseyFilter}${sportFilter ? ` · ${sportFilter}` : ''}`;
    searchMode = 'structured';
    // Jersey lookups are the find-my-photos demand signal — a zero-result one is
    // a person asking "did you get that?" and leaving empty-handed. First page
    // only, so pagination doesn't multiply rows. Fire-and-forget, never awaited.
    if (offset === 0) {
      void trackSearchQuery({
        query_text: `jersey #${jerseyFilter}`,
        filters_used: sportFilter ? { sport: sportFilter } : undefined,
        results_count: totalCount,
      });
    }
  } else if (searchQuery) {
    // Smart search: structured parse + vector fallback
    const result = await searchPhotos(searchQuery, filterOptions, {
      limit: pageSize,
      offset,
      sortBy,
    });
    photos = result.photos;
    totalCount = result.totalCount;
    searchMode = result.searchMode;
    parsedDescription = result.parsedDescription;
    if (offset === 0) {
      void trackSearchQuery({
        query_text: searchQuery,
        filters_used: hasActiveFilters ? filterOptions : undefined,
        results_count: totalCount,
      });
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
    searchMode,
    parsedDescription,
    similarToImageKey,
  };
};
