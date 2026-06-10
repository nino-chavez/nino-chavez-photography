/**
 * Supabase Browser Client for SvelteKit
 *
 * ✅ BROWSER-SAFE - This client can be imported in components
 *
 * Uses the anon (anonymous) key which:
 * - Is safe to expose in browser JavaScript
 * - Enforces Row Level Security (RLS) policies
 * - Provides read-only access (writes blocked by RLS)
 * - Used for client-side queries with TanStack Query
 *
 * Use this client when:
 * - Fetching data from browser components
 * - Using TanStack Query hooks
 * - Implementing real-time subscriptions
 * - Client-side filtering/searching
 */

import { createClient } from '@supabase/supabase-js';
import { cfImageUrl } from '$lib/utils/cloudflare-images';
import { PHOTO_COLUMNS, PHOTOS_READ } from '$lib/supabase/columns';

// Browser-safe environment variables (VITE_ prefix = exposed to browser)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('[Client] Missing VITE_SUPABASE_URL environment variable');
}

if (!supabaseAnonKey) {
  throw new Error('[Client] Missing VITE_SUPABASE_ANON_KEY environment variable');
}

/**
 * Browser-safe Supabase client
 *
 * This client:
 * - Uses the anonymous (anon) key (safe to expose)
 * - Enforces Row Level Security policies
 * - Cannot bypass RLS or perform admin operations
 * - Perfect for client-side queries and real-time subscriptions
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // Enable session persistence for admin auth
    autoRefreshToken: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

/**
 * Browser-safe query example
 *
 * Note: For server-side queries in +page.server.ts,
 * use src/lib/supabase/server.ts instead!
 */
export async function getPublicPhotos(limit = 20) {
  const { data, error } = await supabase
    .from(PHOTOS_READ)
    .select(PHOTO_COLUMNS)
    .not('sharpness', 'is', null)
    // Use upload_date for correct chronological sorting (photo_date is backfilled with enriched_at)
    .order('upload_date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Supabase Client] Error fetching photos:', error);
    throw error;
  }

  return data;
}

/**
 * Fetch photos grouped by period (year/month) for timeline display
 *
 * Client-safe version for browser components
 * Used for loading additional timeline pages
 *
 * NOTE: the 6 vanity CATEGORICAL aesthetic fields (composition, time_of_day, lighting,
 * color_temperature, emotion, action_intensity) were removed from the mapping (cutover prep)
 * ahead of their schema DROP. The numeric quality sub-scores below STAY.
 */
export async function fetchPhotosByPeriod(options: {
  page?: number;
  limit?: number;
  includeFeatured?: boolean;
}) {
  const { page = 1, limit = 12, includeFeatured = false } = options;
  const offset = (page - 1) * limit;

  // Anon-safe replacement for the old exec_sql GROUP BY (revoked from the anon role → this BROWSER
  // call was failing into a no-limit fallback that hit Supabase's 1000-row cap and dropped older
  // months). Approach mirrors the server version:
  //   1. Get the (year, month) universe from the anon-readable, pre-grouped timeline_month_sports view.
  //   2. Count each period exactly with a typed date-range head request (no row truncation).
  //   3. Sort newest-first, paginate, then fetch featured photos per page period.

  // Map a raw photo row to the timeline featured-photo shape.
  const mapPhotoRow = (row: any) => ({
    id: row.photo_id,
    image_key: row.image_key,
    cf_image_id: row.cf_image_id || undefined,
    image_url: cfImageUrl(row.cf_image_id, 'grid'),
    thumbnail_url: cfImageUrl(row.cf_image_id, 'thumbnail'),
    original_url: cfImageUrl(row.cf_image_id, 'public'),
    title: row.image_key,
    caption: '',
    keywords: [],
    created_at: row.photo_date || row.enriched_at || row.upload_date,
    metadata: {
      play_type: (row.play_type || null),
      sport_type: row.sport_type,
      photo_category: row.photo_category,
      sharpness: row.sharpness ?? 0,
      composition_score: row.composition_score ?? 0,
      exposure_accuracy: row.exposure_accuracy ?? 0,
      emotional_impact: row.emotional_impact ?? 0,
      time_in_game: (row.time_in_game || undefined),
      ai_provider: (row.ai_provider || 'gemini'),
      ai_cost: row.ai_cost ?? 0,
      enriched_at: row.enriched_at || new Date().toISOString(),
    },
  });

  // Build the (year, month) universe from the view.
  const { data: viewRows, error: viewError } = await supabase
    .from('timeline_month_sports')
    .select('year, month');

  if (viewError) {
    console.error('[Supabase Client] timeline_month_sports query failed:', viewError.message);
    return [];
  }

  const monthSet = new Map<string, { year: number; month: number }>();
  for (const row of viewRows || []) {
    const year = Number((row as any).year);
    const month = Number((row as any).month);
    if (!year || !month) continue;
    monthSet.set(`${year}-${month}`, { year, month });
  }

  // Exact count per month with a date-range head request (untruncated).
  const periodsWithCounts = await Promise.all(
    Array.from(monthSet.values()).map(async ({ year, month }) => {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1);

      const { count } = await supabase
        .from(PHOTOS_READ)
        .select('photo_id', { count: 'exact', head: true })
        .gte('upload_date', startDate.toISOString())
        .lt('upload_date', endDate.toISOString())
        .not('sharpness', 'is', null);

      return { year, month, photoCount: count || 0 };
    })
  );

  // Drop empty months, sort newest-first, paginate.
  const sortedPeriods = periodsWithCounts
    .filter((p) => p.photoCount > 0)
    .sort((a, b) => b.year - a.year || b.month - a.month)
    .slice(offset, offset + limit)
    .map((p) => ({
      year: p.year,
      month: p.month,
      monthName: new Date(p.year, p.month - 1).toLocaleString('default', { month: 'long' }),
      photoCount: p.photoCount
    }));

  if (!includeFeatured || sortedPeriods.length === 0) {
    return sortedPeriods;
  }

  // Fetch the top featured photos for each page period.
  return Promise.all(
    sortedPeriods.map(async (period) => {
      const startDate = new Date(period.year, period.month - 1, 1);
      const endDate = new Date(period.year, period.month, 1);

      const { data: photos } = await supabase
        .from(PHOTOS_READ)
        .select(PHOTO_COLUMNS)
        .gte('upload_date', startDate.toISOString())
        .lt('upload_date', endDate.toISOString())
        .not('sharpness', 'is', null)
        .order('quality_score', { ascending: false, nullsFirst: false }) // best work first (weighted blend)
        .limit(6); // Top 6 photos per period

      return {
        ...period,
        featuredPhotos: (photos || []).map(mapPhotoRow)
      };
    })
  );
}
