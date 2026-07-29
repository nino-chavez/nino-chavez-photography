/**
 * Month Detail Page Server Loader
 *
 * Loads all photos for a specific year and month
 * Provides navigation to adjacent months
 *
 * Route: /photos/[year]/[month]
 * Example: /photos/2025/10 → October 2025
 */

import { error } from '@sveltejs/kit';
import { fetchPhotosByYearMonth, getAdjacentMonth } from '$lib/supabase/server';
import { monthName } from '$lib/utils/month-window';
import type { PageServerLoad } from './$types';

const PHOTOS_PER_PAGE = 48;

export const load: PageServerLoad = async ({ params, url }) => {
  // Parse and validate year/month params
  const year = parseInt(params.year);
  const month = parseInt(params.month);

  // Validate params
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    throw error(404, 'Invalid year or month');
  }

  // Parse sort and page params
  const sortBy = (url.searchParams.get('sort') as 'newest' | 'oldest' | 'quality') || 'newest';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const offset = (page - 1) * PHOTOS_PER_PAGE;

  console.log(`[Month Detail Server] Loading photos for ${year}-${month}`, { sortBy, page });

  try {
    // Fetch paginated photos for this month
    const { photos, totalCount } = await fetchPhotosByYearMonth(year, month, {
      sortBy,
      limit: PHOTOS_PER_PAGE,
      offset
    });

    if (totalCount === 0) {
      throw error(404, `No photos found for ${year}-${month}`);
    }

    const totalPages = Math.ceil(totalCount / PHOTOS_PER_PAGE);

    // Get adjacent months for navigation
    const [prevMonth, nextMonth] = await Promise.all([
      getAdjacentMonth(year, month, 'prev'),
      getAdjacentMonth(year, month, 'next')
    ]);

    // Fixed English name, not `toLocaleString('default')` — that reads the runtime's locale,
    // so the label on a reader-facing page was a property of the host's ICU configuration.
    const monthLabel = monthName(month);

    console.log(`[Month Detail Server] Loaded ${photos.length}/${totalCount} photos (page ${page}/${totalPages})`, {
      prevMonth: prevMonth ? `${prevMonth.year}-${prevMonth.month}` : null,
      nextMonth: nextMonth ? `${nextMonth.year}-${nextMonth.month}` : null
    });

    return {
      // Head tags belong to the loader, never to +page.svelte — the layout is the single
      // emitter, and a page that also emits them ships a duplicate that renders SECOND.
      // These 46 month pages are in the sitemap, and every one of them was serving the
      // generic site description because of exactly that.
      seo: {
        title: `${monthLabel} ${year} • ${totalCount} Photos | Nino Chavez Gallery`,
        description: `View all ${totalCount} photos from ${monthLabel} ${year} in Nino Chavez's sports photography gallery.`
      },
      photos,
      year,
      month,
      monthName: monthLabel,
      prevMonth,
      nextMonth,
      sortBy,
      photoCount: totalCount,
      currentPage: page,
      totalPages,
      pageSize: PHOTOS_PER_PAGE
    };
  } catch (err) {
    // Re-throw SvelteKit HttpErrors (e.g. the 404 above) instead of masking them as 500s.
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }
    console.error('[Month Detail Server] Failed to load photos:', err);
    throw error(500, 'Failed to load photos');
  }
};
