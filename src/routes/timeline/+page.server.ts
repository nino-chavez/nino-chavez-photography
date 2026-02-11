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

// ISR: Cache timeline at Vercel edge for 5 minutes
export const config = {
  isr: { expiration: 300 }
};

export const load: PageServerLoad = async ({ url, parent }) => {
  // Parse query params for pagination
  // PERFORMANCE: Reduced default from 100 to 12 periods for faster initial load
  // Users can load more via infinite scroll
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '12');

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

    return {
      periods,
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