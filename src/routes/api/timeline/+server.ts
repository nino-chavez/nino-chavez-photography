/**
 * API endpoint for loading timeline periods
 * Supports pagination for lazy loading
 */

import { fetchPhotosByPeriod } from '$lib/supabase/server';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  try {
    // Clamp + NaN-guard: a non-numeric ?limit yields NaN (propagates through the query); an
    // unbounded ?limit=999999 would force a full scan. Keep page >= 1 and limit in [1, 24].
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1') || 1);
    const limit = Math.min(24, Math.max(1, parseInt(url.searchParams.get('limit') || '6') || 6));
    const sport = url.searchParams.get('sport') || undefined;
    const category = url.searchParams.get('category') || undefined;

    const periods = await fetchPhotosByPeriod({
      page,
      limit,
      includeFeatured: true,
      sportFilter: sport,
      categoryFilter: category
    });

    return json({
      periods,
      hasMore: periods.length === limit,
      page
    });
  } catch (error) {
    console.error('[Timeline API] Failed to load periods:', error);
    return json({ error: 'Failed to load timeline data' }, { status: 500 });
  }
};