/**
 * Server-side data loading for timeline v2 page
 *
 * Pattern: Direct Supabase calls with server client
 * Loads photo periods for timeline display
 *
 * PERFORMANCE: Uses parallelized queries and cached layout data
 */

import { fetchPhotosByPeriod, fetchAllPeriods } from '$lib/supabase/server';
import type { PageServerLoad } from './$types';

// Import optimized timeline images manifest at build time
// This is optional - pages work without it, just with SmugMug images
let timelineManifest: { images: Array<{ imageKey: string; paths: { desktop: string; mobile: string; thumbnail: string } }> } | null = null;
try {
	// @ts-ignore - JSON import from static folder
	const manifestModule = await import('../../../static/optimized/timeline/manifest.json');
	timelineManifest = manifestModule.default || manifestModule;
	console.log('[Timeline] Manifest loaded:', timelineManifest?.images?.length || 0, 'images');
} catch {
	// Manifest doesn't exist yet - will use SmugMug URLs
}

// Build a lookup map for O(1) access
const optimizedTimelineImages = new Map<string, { desktop: string; mobile: string; thumbnail: string }>();
if (timelineManifest?.images) {
	for (const img of timelineManifest.images) {
		if (img.imageKey) {
			optimizedTimelineImages.set(img.imageKey, img.paths);
		}
	}
}

export const load: PageServerLoad = async ({ url, parent }) => {
  // Parse query params for pagination
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '100');

  // Parse filter params
  const sportFilter = url.searchParams.get('sport') || undefined;
  const categoryFilter = url.searchParams.get('category') || undefined;

  try {
    // PERFORMANCE: Parallelize queries instead of sequential execution
    // Also reuse cached sports/categories from layout (already fresh, 5-min cache)
    const [periods, allPeriods, layoutData] = await Promise.all([
      fetchPhotosByPeriod({
        page,
        limit,
        includeFeatured: true,
        sportFilter,
        categoryFilter
      }),
      fetchAllPeriods({
        sportFilter,
        categoryFilter
      }),
      parent() // Get cached sports/categories from +layout.server.ts
    ]);

    // Use cached data from layout instead of re-querying and aggregating in JS
    const { sports, categories } = layoutData;

    // Enhance periods with optimized image paths where available
    const enhancedPeriods = periods.map((period: any) => ({
      ...period,
      photos: (period.photos || []).map((photo: any) => {
        const optimizedPaths = optimizedTimelineImages.get(photo.image_key);
        if (optimizedPaths) {
          return {
            ...photo,
            optimizedPaths,
            image_url: optimizedPaths.desktop,
            thumbnail_url: optimizedPaths.thumbnail,
          };
        }
        return photo;
      }),
    }));

    return {
      periods: enhancedPeriods,
      allPeriods,
      currentPage: page,
      hasMore: periods.length === limit,
      selectedSport: sportFilter || null,
      selectedCategory: categoryFilter || null,
      sports,
      categories
    };
  } catch (error) {
    console.error('[Timeline V2 Server] Failed to load periods:', error);
    throw error;
  }
};