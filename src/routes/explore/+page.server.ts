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

import { fetchPhotos, getPhotoCount, getFilterCounts, findSimilarPhotos, searchPhotos, findPhotosByJersey } from '$lib/supabase/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, parent, setHeaders }) => {
  setHeaders({ 'cache-control': 's-maxage=60, stale-while-revalidate=120' });

  // Get cached data from parent layout
  const { sports, categories, baseFilterCounts } = await parent();

  // Get Bucket 1 (user-facing) filter params from URL
  let sportFilter = url.searchParams.get('sport') || undefined;
  let categoryFilter = url.searchParams.get('category') || undefined;
  let playTypeFilter = url.searchParams.get('play_type') || undefined;
  let intensityFilter = url.searchParams.get('intensity') || undefined;
  let lightingFilters = url.searchParams.getAll('lighting'); // Multi-select
  let colorTempFilter = url.searchParams.get('color_temp') || undefined;
  let timeOfDayFilter = url.searchParams.get('time_of_day') || undefined;
  let compositionFilter = url.searchParams.get('composition') || undefined;
  let emotionFilter = url.searchParams.get('emotion') || undefined; // Bucket 2, but used for "Similar Photos"
  let searchQuery = url.searchParams.get('q') || undefined;
  let similarToImageKey = url.searchParams.get('similar_to') || undefined;
  // jersey is TEXT now ('00' != '0', '7A' is real) — no parseInt. Resolved via the relational
  // sightings RPC (findPhotosByJersey), not the deprecated singular-column .eq.
  let jerseyFilter = url.searchParams.get('jersey')?.trim() || undefined;

  // Sort mode (default to quality)
  const sortBy = (url.searchParams.get('sort') || 'quality') as 'quality' | 'newest' | 'oldest' | 'action' | 'intensity';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1')); // Ensure minimum page 1
  const pageSize = 24; // Fixed page size for consistent pagination
  const offset = (page - 1) * pageSize;

  const filterOptions = {
    sportType: sportFilter,
    photoCategory: categoryFilter,
    playTypes: playTypeFilter ? [playTypeFilter as any] : undefined,
    actionIntensity: intensityFilter ? [intensityFilter as any] : undefined,
    lighting: lightingFilters.length > 0 ? (lightingFilters as any[]) : undefined,
    colorTemperature: colorTempFilter ? [colorTempFilter as any] : undefined,
    timeOfDay: timeOfDayFilter ? [timeOfDayFilter as any] : undefined,
    compositions: compositionFilter ? [compositionFilter as any] : undefined, // Fixed: was 'composition', now 'compositions'
    emotion: emotionFilter as any, // Bucket 2, but used for "Similar Photos" feature
    // jersey is no longer a standard .eq filter — it routes through findPhotosByJersey (sightings).
  };

  // Check if any filters are active
  const hasActiveFilters = !!(sportFilter || categoryFilter || playTypeFilter || intensityFilter ||
    lightingFilters.length > 0 || colorTempFilter || timeOfDayFilter || compositionFilter || emotionFilter || jerseyFilter);

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

  if (intensityFilter && autoFilterCounts.intensities) {
    const intensityCount = autoFilterCounts.intensities.find(i => i.name === intensityFilter)?.count || 0;
    if (intensityCount === 0) {
      clearedFilters.push(`Intensity: ${intensityFilter}`);
      intensityFilter = undefined;
      delete filterOptions.actionIntensity;
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

  // Auto-clear lighting filters (multi-select)
  if (lightingFilters.length > 0 && autoFilterCounts.lighting) {
    const incompatibleLighting = lightingFilters.filter(l => {
      const count = autoFilterCounts.lighting?.find(lighting => lighting.name === l)?.count || 0;
      return count === 0;
    });

    if (incompatibleLighting.length > 0) {
      incompatibleLighting.forEach(l => {
        clearedFilters.push(`Lighting: ${l}`);
      });
      lightingFilters = lightingFilters.filter(l => !incompatibleLighting.includes(l));
      if (lightingFilters.length === 0) {
        delete filterOptions.lighting;
      } else {
        filterOptions.lighting = lightingFilters as any[];
      }
    }
  }

  if (colorTempFilter && autoFilterCounts.colorTemperatures) {
    const colorTempCount = autoFilterCounts.colorTemperatures.find(ct => ct.name === colorTempFilter)?.count || 0;
    if (colorTempCount === 0) {
      clearedFilters.push(`Color Temperature: ${colorTempFilter}`);
      colorTempFilter = undefined;
      delete filterOptions.colorTemperature;
    }
  }

  if (timeOfDayFilter && autoFilterCounts.timesOfDay) {
    const timeOfDayCount = autoFilterCounts.timesOfDay.find(t => t.name === timeOfDayFilter)?.count || 0;
    if (timeOfDayCount === 0) {
      clearedFilters.push(`Time of Day: ${timeOfDayFilter}`);
      timeOfDayFilter = undefined;
      delete filterOptions.timeOfDay;
    }
  }

  if (compositionFilter && autoFilterCounts.compositions) {
    const compositionCount = autoFilterCounts.compositions.find(c => c.name === compositionFilter)?.count || 0;
    if (compositionCount === 0) {
      clearedFilters.push(`Composition: ${compositionFilter}`);
      compositionFilter = undefined;
      delete filterOptions.compositions;
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
  } else if (jerseyFilter) {
    // Jersey people-finding via relational sightings (no naming/biometrics). Scoped by album/sport.
    photos = await findPhotosByJersey(jerseyFilter, { sport: sportFilter, limit: pageSize, offset });
    totalCount = photos.length;
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
    selectedIntensity: intensityFilter || null,
    selectedLighting: lightingFilters.length > 0 ? lightingFilters : null,
    selectedColorTemp: colorTempFilter || null,
    selectedTimeOfDay: timeOfDayFilter || null,
    selectedComposition: compositionFilter || null,
    selectedEmotion: emotionFilter || null,
    selectedJerseyNumber: jerseyFilter || null,
    filterCounts,
    clearedFilters,
    searchQuery,
    searchMode,
    parsedDescription,
    similarToImageKey,
  };
};
