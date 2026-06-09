/**
 * Supabase Server Client for SvelteKit
 *
 * ⚠️ SERVER-SIDE ONLY - Never import this in browser code!
 *
 * This client uses the service role key for privileged operations:
 * - Bypasses Row Level Security (RLS)
 * - Can perform admin operations (create, update, delete)
 * - Used ONLY in +page.server.ts, +layout.server.ts, API routes
 *
 * Uses non-VITE environment variables (not exposed to browser)
 */

import { createClient } from '@supabase/supabase-js';
import type { Photo, Video, PhotoFilterState } from '$types/photo';
import type { AlbumSettingsRow } from '$types/database';
import { cfImageUrl } from '$lib/utils/cloudflare-images';
import { embedText } from '$lib/ai/embeddings';
export { PHOTO_COLUMNS, PHOTO_DETAIL_COLUMNS, photoSelect } from '$lib/supabase/columns';
import { PHOTO_COLUMNS, PHOTOS_READ } from '$lib/supabase/columns';

// Server-side environment variables (NOT exposed to browser)
// In SvelteKit, we need to use import.meta.env even server-side
// but we can use non-VITE_ prefixed vars if we set them up in svelte.config.js

// Use fallback values during build to avoid build-time errors
// Variables will be validated at runtime when actually used
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceRoleKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key'; // For now, using anon key (read-only is safe)

// TODO: Once we need write operations, add SUPABASE_SERVICE_ROLE_KEY to .env.local
// and update SvelteKit config to expose it server-side only

// Validate environment variables are set (will warn but not throw during build)
if (!import.meta.env.VITE_SUPABASE_URL && import.meta.env.PROD) {
  console.error('[Server] Missing VITE_SUPABASE_URL environment variable. Please add it to Vercel.');
}

if (!import.meta.env.VITE_SUPABASE_ANON_KEY && import.meta.env.PROD) {
  console.error('[Server] Missing VITE_SUPABASE_ANON_KEY environment variable. Please add it to Vercel.');
}

/**
 * Transform database row to Photo type with Cloudflare Images URLs
 * Exported for use in other server-side loaders
 *
 * NOTE: the 6 vanity CATEGORICAL aesthetic fields (composition, time_of_day, lighting,
 * color_temperature, emotion, action_intensity) were removed from this mapping (cutover prep)
 * ahead of their schema DROP. The numeric quality sub-scores below STAY.
 */
export function transformPhotoRow(row: any): Photo {
  const imageUrl = cfImageUrl(row.cf_image_id, 'grid');
  const thumbnailUrl = cfImageUrl(row.cf_image_id, 'thumbnail');
  const originalUrl = cfImageUrl(row.cf_image_id, 'public');

  return {
    id: row.photo_id,
    image_key: row.image_key,
    cf_image_id: row.cf_image_id || undefined,
    image_url: imageUrl,
    thumbnail_url: thumbnailUrl,
    original_url: originalUrl,
    title: row.image_key,
    caption: row.caption || '',
    keywords: [],
    created_at: row.photo_date || row.enriched_at || row.upload_date,
    metadata: {
      play_type: (row.play_type || null) as Photo['metadata']['play_type'],
      sport_type: row.sport_type,
      photo_category: row.photo_category,
      sharpness: row.sharpness ?? 0,
      composition_score: row.composition_score ?? 0,
      exposure_accuracy: row.exposure_accuracy ?? 0,
      emotional_impact: row.emotional_impact ?? 0,
      time_in_game: (row.time_in_game || undefined) as Photo['metadata']['time_in_game'],
      athlete_id: row.athlete_id || undefined,
      jersey_number: row.jersey_number || undefined,
      event_id: row.event_id || undefined,
      ai_provider: (row.ai_provider || 'gemini') as Photo['metadata']['ai_provider'],
      ai_cost: row.ai_cost ?? 0,
      enriched_at: row.enriched_at || new Date().toISOString(),
    },
  } as Photo;
}

// Create Supabase client with service role for server-side operations
export const supabaseServer = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export interface FetchPhotosOptions extends PhotoFilterState {
  limit?: number;
  offset?: number;
  sortBy?: 'quality' | 'newest' | 'oldest' | 'action';
}

/**
 * Discover the distinct non-null values of a categorical column under the anon key.
 *
 * WHY this exists: the old GROUP BY queries went through exec_sql, which the security
 * lockdown revoked from the anon role — under anon in prod they failed into fallbacks.
 * A plain `.select(col)` to find distinct values silently caps at Supabase's 1000-row
 * default, so high-cardinality columns lose values. This pages with `.range()` until the
 * table is exhausted, so the distinct set is complete regardless of row count.
 *
 * Counts are computed separately via `{ count: 'exact', head: true }` head requests, which
 * never return rows and therefore never truncate. The pair (full distinct set + exact head
 * counts) reproduces a server-side GROUP BY exactly, anon-safe, with no exec_sql.
 */
async function distinctColumnValues(
  column: string,
  applyBaseFilters?: (q: any) => any
): Promise<string[]> {
  const seen = new Set<string>();
  const pageSize = 1000;
  let offset = 0;

  // Page until a short page signals end-of-table — no silent 1000-row cap.
  for (;;) {
    let query = supabaseServer
      .from(PHOTOS_READ)
      .select(column)
      .not('sharpness', 'is', null)
      .not(column, 'is', null)
      .order(column, { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (applyBaseFilters) query = applyBaseFilters(query);

    const { data, error } = await query;
    if (error) {
      console.error(`[distinctColumnValues] Error paging ${column}:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;

    for (const row of data as unknown as Array<Record<string, unknown>>) {
      const value = row[column];
      if (typeof value === 'string' && value.length > 0) seen.add(value);
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return Array.from(seen);
}

/**
 * Fetch photos from Supabase with optional filters (SERVER-SIDE)
 *
 * This function should ONLY be called from:
 * - +page.server.ts files
 * - +layout.server.ts files
 * - API route handlers
 *
 * Never call from browser components!
 */
export async function fetchPhotos(options?: FetchPhotosOptions): Promise<Photo[]> {
  const { limit = 24, offset = 0, sortBy = 'newest', ...filters } = options || {};

  console.log('[fetchPhotos] Query params:', { limit, offset, sortBy, filters });

  let query = supabaseServer
    .from(PHOTOS_READ)
    .select(PHOTO_COLUMNS)
    .not('sharpness', 'is', null); // Only show enriched photos

  // CRITICAL: Apply filters BEFORE sorting for better index usage
  // This reduces the dataset that needs to be sorted

  // Action filters (apply first - most selective)
  if (filters?.sportType) {
    query = query.eq('sport_type', filters.sportType);
  }

  if (filters?.photoCategory) {
    query = query.eq('photo_category', filters.photoCategory);
  }

  if (filters?.playTypes && filters.playTypes.length > 0) {
    query = query.in('play_type', filters.playTypes);
  }

  // Context filters
  if (filters?.albumKey) {
    query = query.eq('album_key', filters.albumKey);
  }

  if (filters?.jerseyNumber !== undefined) {
    query = query.eq('jersey_number', filters.jerseyNumber);
  }

  // Apply sorting AFTER filters (work on smaller dataset)
  switch (sortBy) {
    case 'quality':
      // "Best Photos": rank by the weighted quality blend (sharpness .35 / composition .30 /
      // emotional .25 / exposure .10), stored as the generated `quality_score` column — not
      // emotional_impact alone (which ignored sharpness/composition). upload_date breaks ties.
      query = query.order('quality_score', { ascending: false, nullsFirst: false }).order('upload_date', { ascending: false });
      break;
    case 'newest':
      // Use upload_date, then image_key for deterministic ordering within same-date albums
      query = query.order('upload_date', { ascending: false }).order('image_key', { ascending: true });
      break;
    case 'oldest':
      query = query.order('upload_date', { ascending: true }).order('image_key', { ascending: true });
      break;
    case 'action':
      // Sort by play type (alphabetical grouping), then by emotional_impact for deterministic ordering
      query = query.order('play_type', { ascending: true, nullsFirst: false }).order('emotional_impact', { ascending: false });
      break;
  }

  // Apply pagination (AFTER sorting and filtering)
  query = query.range(offset, offset + limit - 1);

  const queryStart = Date.now();
  const { data, error } = await query;
  const queryTime = Date.now() - queryStart;

  if (error) {
    console.error('[Supabase Server] Error fetching photos:', {
      error,
      query: { limit, offset, sortBy, filters },
      queryTime: `${queryTime}ms`
    });

    // Provide helpful error messages
    if (error.code === '57014') {
      // Fallback: If quality sort times out (likely due to missing index), try newest
      if (sortBy === 'quality') {
        console.warn('[Supabase Server] Quality sort timed out, falling back to newest sort');
        return fetchPhotos({ ...options, sortBy: 'newest' });
      }
      throw new Error('Database query timeout - try adding filters to narrow your search');
    }

    throw new Error(`Failed to fetch photos: ${error.message}`);
  }

  console.log(`[fetchPhotos] Query completed in ${queryTime}ms, returned ${data?.length || 0} photos`);

  // Map photo_metadata to Photo type (two-bucket model)
  const photos: Photo[] = (data || []).map(transformPhotoRow);

  return photos;
}

/**
 * Get count of photos matching filters (SERVER-SIDE)
 */
export async function getPhotoCount(filters?: PhotoFilterState): Promise<number> {
  let query = supabaseServer
    .from(PHOTOS_READ)
    .select('photo_id', { count: 'exact', head: true })
    .not('sharpness', 'is', null);

  // Apply same Bucket 1 filters as fetchPhotos
  if (filters?.playTypes && filters.playTypes.length > 0) {
    query = query.in('play_type', filters.playTypes);
  }

  if (filters?.sportType) {
    query = query.eq('sport_type', filters.sportType);
  }

  if (filters?.photoCategory) {
    query = query.eq('photo_category', filters.photoCategory);
  }

  if (filters?.jerseyNumber !== undefined) {
    query = query.eq('jersey_number', filters.jerseyNumber);
  }

  if (filters?.albumKey) {
    query = query.eq('album_key', filters.albumKey);
  }

  const { count, error } = await query;

  if (error) {
    console.error('[Supabase Server] Error fetching count:', error);
    throw new Error(`Failed to fetch photo count: ${error.message}`);
  }

  return count || 0;
}

/**
 * Get sport distribution statistics (SERVER-SIDE)
 * Returns count and percentage for each sport type
 * Uses SQL aggregation for efficiency (no row limit issues)
 */
export async function getSportDistribution(): Promise<Array<{ name: string; count: number; percentage: number }>> {
  // Anon-safe replacement for the old exec_sql GROUP BY (revoked from anon → was failing in prod).
  // Discover every distinct sport via paged reads (no 1000-row truncation), then count each with an
  // exact head request. Excludes 'unknown', matching the original WHERE sport_type != 'unknown'.
  try {
    const sports = (await distinctColumnValues('sport_type')).filter((s) => s !== 'unknown');

    const counts = await Promise.all(
      sports.map(async (sport) => {
        const { count, error } = await supabaseServer
          .from(PHOTOS_READ)
          .select('photo_id', { count: 'exact', head: true })
          .not('sharpness', 'is', null)
          .eq('sport_type', sport);

        if (error) {
          console.error(`[getSportDistribution] Error counting sport ${sport}:`, error.message);
          return { name: sport, count: 0 };
        }
        return { name: sport, count: count || 0 };
      })
    );

    const withCounts = counts.filter((s) => s.count > 0);
    const total = withCounts.reduce((sum, s) => sum + s.count, 0);
    if (total === 0) return [];

    // Percentages over the included set — reproduces the original SUM(COUNT(*)) OVER () window.
    return withCounts
      .map((s) => ({
        name: s.name,
        count: s.count,
        percentage: parseFloat(((s.count / total) * 100).toFixed(1))
      }))
      .sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error('[getSportDistribution] Critical error:', error);
    return [];
  }
}

/**
 * Get filter counts for all filter options (SERVER-SIDE)
 * Returns counts for each filter option while respecting currently active filters
 * This enables "smart" filtering where users can see how many results each option will return
 *
 * NOTE: the vanity CATEGORICAL dimensions (lighting, color_temperature, time_of_day,
 * composition, action_intensity) were removed (cutover prep) — their backing columns are
 * being DROPPED at the schema cutover.
 */
export interface FilterCounts {
  sports: Array<{ name: string; count: number }>;
  categories: Array<{ name: string; count: number }>;
  playTypes: Array<{ name: string; count: number }>;
}

/**
 * OPTIMIZED: Get filter counts using aggregation queries (GROUP BY)
 * Reduces database queries by counting all dimensions in a single round-trip.
 *
 * Performance improvements:
 * - Uses COUNT() with GROUP BY instead of individual queries
 * - Single query for all dimensions (UNION ALL)
 * - Respects current filters to show compatible counts
 * - No hardcoded filter values (uses actual data)
 */
export async function getFilterCounts(currentFilters?: PhotoFilterState): Promise<FilterCounts> {
  // Anon-safe facet counts. The old implementation used exec_sql (revoked from anon → failed in
  // prod) and string-interpolated filter values into SQL (injection risk). This counts each facet
  // value with typed `.eq()` / `.in()` queries — no exec_sql, no string interpolation into SQL.
  //
  // For each dimension we count its values while respecting the OTHER active filters (the dimension
  // being counted is excluded from its own WHERE so users still see sibling options). Distinct
  // values are discovered with paged reads (no 1000-row truncation); counts use exact head requests
  // (which never return rows, so never truncate).

  // Apply the current filters to a query, skipping the dimension being counted.
  const applyCrossFilters = (q: any, fieldName: string) => {
    if (currentFilters?.sportType && fieldName !== 'sport_type') {
      q = q.eq('sport_type', currentFilters.sportType);
    }
    if (currentFilters?.photoCategory && fieldName !== 'photo_category') {
      q = q.eq('photo_category', currentFilters.photoCategory);
    }
    if (currentFilters?.playTypes && currentFilters.playTypes.length > 0 && fieldName !== 'play_type') {
      q = q.in('play_type', currentFilters.playTypes);
    }
    return q;
  };

  const getAggregatedCounts = async (
    fieldName: string
  ): Promise<Array<{ name: string; count: number }>> => {
    // Full distinct set for this dimension under the current cross-filters (paged, untruncated).
    const uniqueValues = await distinctColumnValues(fieldName, (q) => applyCrossFilters(q, fieldName));

    const counts = await Promise.all(
      uniqueValues.map(async (value) => {
        let countQuery = supabaseServer
          .from(PHOTOS_READ)
          .select('photo_id', { count: 'exact', head: true })
          .not('sharpness', 'is', null)
          .eq(fieldName, value);

        countQuery = applyCrossFilters(countQuery, fieldName);

        const { count } = await countQuery;
        return { name: value, count: count || 0 };
      })
    );

    return counts.filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
  };

  const [sportCounts, categoryCounts, playTypeCounts] = await Promise.all([
    getAggregatedCounts('sport_type'),
    getAggregatedCounts('photo_category'),
    getAggregatedCounts('play_type'),
  ]);

  return {
    sports: sportCounts,
    categories: categoryCounts,
    playTypes: playTypeCounts,
  };
}

/**
 * Get photo category distribution statistics (SERVER-SIDE)
 * Returns count and percentage for each category type
 * Uses SQL aggregation for efficiency (no row limit issues)
 */
export async function getCategoryDistribution(): Promise<Array<{ name: string; count: number; percentage: number }>> {
  // Anon-safe replacement for the old exec_sql GROUP BY (revoked from anon → was failing in prod).
  // Discover every distinct category via paged reads (no 1000-row truncation), then count each with
  // an exact head request. Uses the live distinct set instead of a hardcoded list so dynamically
  // present categories are not silently dropped — matching the original GROUP BY photo_category.
  try {
    const categories = await distinctColumnValues('photo_category');

    const counts = await Promise.all(
      categories.map(async (category) => {
        const { count, error } = await supabaseServer
          .from(PHOTOS_READ)
          .select('photo_id', { count: 'exact', head: true })
          .not('sharpness', 'is', null)
          .eq('photo_category', category);

        if (error) {
          console.error(`[getCategoryDistribution] Error counting category ${category}:`, error.message);
          return { name: category, count: 0 };
        }
        return { name: category, count: count || 0 };
      })
    );

    const withCounts = counts.filter((c) => c.count > 0);
    const total = withCounts.reduce((sum, c) => sum + c.count, 0);
    if (total === 0) return [];

    // Percentages over the included set — reproduces the original SUM(COUNT(*)) OVER () window.
    return withCounts
      .map((c) => ({
        name: c.name,
        count: c.count,
        percentage: parseFloat(((c.count / total) * 100).toFixed(1))
      }))
      .sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error('[getCategoryDistribution] Critical error:', error);
    return [];
  }
}

export async function fetchPhotosByPeriod(options: {
  page?: number;
  limit?: number;
  includeFeatured?: boolean;
  sportFilter?: string;
  categoryFilter?: string;
}) {
  const { page = 1, limit = 12, includeFeatured = false, sportFilter, categoryFilter } = options;
  const offset = (page - 1) * limit;

  // Anon-safe replacement for the old exec_sql GROUP BY (revoked from anon → was failing into a
  // no-limit fallback that hit the 1000-row cap and dropped older months). Approach:
  //   1. Get the universe of (year, month) periods from the anon-readable timeline_month_sports view
  //      (already grouped by month, so small — no row-limit truncation).
  //   2. Count each period exactly with a typed date-range head request (counts never return rows,
  //      so never truncate) applying sport/category filters via .eq() — no SQL interpolation.
  //   3. Sort newest-first, paginate, then fetch featured photos per page period.
  // The head-count on upload_date reproduces the original `COUNT(*) ... GROUP BY EXTRACT(...)`
  // semantics faithfully (the view's per-sport partition is a different derivation, so it's only
  // used to enumerate which months exist, not for the displayed counts).

  // Build the (year, month) universe from the view.
  const { data: viewRows, error: viewError } = await supabaseServer
    .from('timeline_month_sports')
    .select('year, month');

  if (viewError) {
    console.error('[fetchPhotosByPeriod] timeline_month_sports query failed:', viewError.message);
    return [];
  }

  const monthSet = new Map<string, { year: number; month: number }>();
  for (const row of viewRows || []) {
    const year = Number((row as any).year);
    const month = Number((row as any).month);
    if (!year || !month) continue;
    monthSet.set(`${year}-${month}`, { year, month });
  }

  // Exact count per month with the active filters (date-range head request — untruncated).
  const periodsWithCounts = await Promise.all(
    Array.from(monthSet.values()).map(async ({ year, month }) => {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1);

      let countQuery = supabaseServer
        .from(PHOTOS_READ)
        .select('photo_id', { count: 'exact', head: true })
        .gte('upload_date', startDate.toISOString())
        .lt('upload_date', endDate.toISOString())
        .not('sharpness', 'is', null);

      if (sportFilter) countQuery = countQuery.eq('sport_type', sportFilter);
      if (categoryFilter) countQuery = countQuery.eq('photo_category', categoryFilter);

      const { count } = await countQuery;
      return { year, month, photoCount: count || 0 };
    })
  );

  // Drop empty months (the original GROUP BY only returns months that have matching photos),
  // sort newest-first, and paginate.
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

      let photoQuery = supabaseServer
        .from(PHOTOS_READ)
        .select(PHOTO_COLUMNS)
        .gte('upload_date', startDate.toISOString())
        .lt('upload_date', endDate.toISOString())
        .not('sharpness', 'is', null);

      if (sportFilter) photoQuery = photoQuery.eq('sport_type', sportFilter);
      if (categoryFilter) photoQuery = photoQuery.eq('photo_category', categoryFilter);

      const { data: photos } = await photoQuery
        .order('quality_score', { ascending: false, nullsFirst: false }) // best work first (weighted blend)
        .limit(6); // Top 6 photos per period

      return {
        ...period,
        featuredPhotos: (photos || []).map(transformPhotoRow)
      };
    })
  );
}

/**
 * Fetch all available periods for dropdown options (SERVER-SIDE)
 *
 * This function returns all periods with at least one photo,
 * grouped by year and month, and sorted newest first.
 */
export async function fetchAllPeriods(options?: {
  sportFilter?: string;
  categoryFilter?: string;
}) {
  const { sportFilter } = options || {};

  // Read the pre-aggregated monthly view. WHY this shape: the previous implementation used exec_sql,
  // which the security lockdown revoked from the anon role — under the anon key in prod that call
  // failed into a fallback that fetched photos with NO limit, hit Supabase's 1000-row default, and
  // collapsed the scrubber to only the most recent ~2 years (2025–26). timeline_month_sports is an
  // anon-readable view, already grouped by month, so it's small (no row-limit truncation) and needs
  // no exec_sql. categoryFilter is intentionally not applied here: the scrubber range is
  // category-agnostic; the photo grid still filters by category.
  let query = supabaseServer
    .from('timeline_month_sports')
    .select('year, month, photo_count, sport_type');

  if (sportFilter) {
    query = query.eq('sport_type', sportFilter);
  }

  const { data: rows, error } = await query;

  if (error) {
    console.error('[fetchAllPeriods] timeline_month_sports query failed:', error.message);
    return [];
  }

  // Sum photo counts per (year, month) across sports
  const periodMap = new Map<string, { year: number; month: number; count: number }>();
  for (const r of rows || []) {
    const year = Number((r as any).year);
    const month = Number((r as any).month);
    if (!year || !month) continue;
    const key = `${year}-${month}`;
    const existing = periodMap.get(key);
    const c = Number((r as any).photo_count) || 0;
    if (existing) existing.count += c;
    else periodMap.set(key, { year, month, count: c });
  }

  return Array.from(periodMap.values())
    .sort((a, b) => b.year - a.year || b.month - a.month)
    .map((period) => ({
      year: period.year,
      month: period.month,
      monthName: new Date(period.year, period.month - 1).toLocaleString('default', { month: 'long' }),
      photoCount: period.count
    }));
}

/**
 * Fetch photos for a specific year and month with optional pagination
 * Used by the month detail page (/photos/[year]/[month])
 *
 * When limit is provided, returns { photos, totalCount } with pagination.
 * When limit is omitted, returns all photos (backward compatible).
 */
export async function fetchPhotosByYearMonth(
  year: number,
  month: number,
  options: { sortBy?: 'newest' | 'oldest' | 'quality'; limit?: number; offset?: number } = {}
): Promise<{ photos: Photo[]; totalCount: number }> {
  const { sortBy = 'newest', limit, offset = 0 } = options;

  try {
    // Calculate date range for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    console.log(`[fetchPhotosByYearMonth] Fetching photos for ${year}-${month}`, {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      sortBy,
      limit,
      offset
    });

    let query = supabaseServer
      .from(PHOTOS_READ)
      .select(PHOTO_COLUMNS, limit ? { count: 'exact' } : {})
      .not('sharpness', 'is', null)
      .gte('upload_date', startDate.toISOString())
      .lte('upload_date', endDate.toISOString());

    // Apply sorting
    if (sortBy === 'newest') {
      query = query.order('upload_date', { ascending: false });
    } else if (sortBy === 'oldest') {
      query = query.order('upload_date', { ascending: true });
    } else if (sortBy === 'quality') {
      // Weighted quality blend via the generated quality_score column (see fetchPhotos).
      query = query.order('quality_score', { ascending: false, nullsFirst: false }).order('upload_date', { ascending: false });
    }

    // Apply pagination when limit is provided
    if (limit) {
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[fetchPhotosByYearMonth] Query failed:', error);
      throw error;
    }

    const photos = (data || []).map(transformPhotoRow);
    const totalCount = count ?? photos.length;

    console.log(`[fetchPhotosByYearMonth] Fetched ${photos.length} photos (total: ${totalCount})`);

    return { photos, totalCount };
  } catch (error) {
    console.error('[fetchPhotosByYearMonth] Error:', error);
    throw error;
  }
}

/**
 * Get adjacent month information for navigation
 * Returns null if no photos exist in that month
 */
export async function getAdjacentMonth(
  year: number,
  month: number,
  direction: 'prev' | 'next'
): Promise<{ year: number; month: number; monthName: string; photoCount: number } | null> {
  try {
    const date = new Date(year, month - 1, 1);

    // Calculate adjacent month
    if (direction === 'prev') {
      date.setMonth(date.getMonth() - 1);
    } else {
      date.setMonth(date.getMonth() + 1);
    }

    const adjYear = date.getFullYear();
    const adjMonth = date.getMonth() + 1;

    // Check if photos exist in that month
    const startDate = new Date(adjYear, adjMonth - 1, 1);
    const endDate = new Date(adjYear, adjMonth, 0, 23, 59, 59);

    const { count, error } = await supabaseServer
      .from(PHOTOS_READ)
      .select('photo_id', { count: 'exact', head: true })
      .not('sharpness', 'is', null)
      .gte('upload_date', startDate.toISOString())
      .lte('upload_date', endDate.toISOString());

    if (error) {
      console.error('[getAdjacentMonth] Query failed:', error);
      return null;
    }

    if (!count || count === 0) {
      return null;
    }

    return {
      year: adjYear,
      month: adjMonth,
      monthName: date.toLocaleString('default', { month: 'long' }),
      photoCount: count
    };
  } catch (error) {
    console.error('[getAdjacentMonth] Error:', error);
    return null;
  }
}

/**
 * Find similar photos using vector embeddings (SERVER-SIDE)
 * Uses the find_similar_photos RPC function which leverages pgvector
 */
export async function findSimilarPhotos(imageKey: string, limit: number = 24): Promise<Photo[]> {
  console.log(`[findSimilarPhotos] Finding photos similar to: ${imageKey}`);
  const start = Date.now();

  // 1. Try vector similarity search first.
  // Param names MUST match the RPC signature: find_similar_photos(target_image_key, limit_count,
  // min_similarity). They were query_image_key/match_count/match_threshold, which don't bind — the
  // RPC errored every call and the catch fell back to generic photos (the "only a few similar" bug).
  const { data: similarMatches, error } = await supabaseServer.rpc('find_similar_photos', {
    target_image_key: imageKey,
    limit_count: limit,
    min_similarity: 0.3
  });

  // If vector search succeeded and has results, use them
  if (!error && similarMatches && similarMatches.length > 0) {
    const keys = similarMatches.map((p: any) => p.image_key);

    const { data: photosData, error: photosError } = await supabaseServer
      .from(PHOTOS_READ)
      .select(PHOTO_COLUMNS)
      .in('image_key', keys)
      .not('sharpness', 'is', null);

    if (!photosError && photosData && photosData.length > 0) {
      const photoMap = new Map(photosData.map(p => [p.image_key, p]));
      const sortedPhotos = similarMatches
        .map((match: any) => photoMap.get(match.image_key))
        .filter((p: any) => !!p)
        .map(transformPhotoRow);

      console.log(`[findSimilarPhotos] Vector search found ${sortedPhotos.length} similar photos in ${Date.now() - start}ms`);
      return sortedPhotos;
    }
  }

  // 2. Fallback: Find photos with similar attributes
  // This ensures we NEVER return zero results
  console.log('[findSimilarPhotos] Vector search returned no results, falling back to attribute-based similarity');

  // First, get the source photo's attributes
  const { data: sourcePhoto, error: sourceError } = await supabaseServer
    .from(PHOTOS_READ)
    .select('sport_type, play_type, photo_category, album_key')
    .eq('image_key', imageKey)
    .single();

  if (sourceError || !sourcePhoto) {
    console.error('[findSimilarPhotos] Could not find source photo for fallback:', sourceError);
    // Last resort: return recent high-quality photos
    return fetchPhotos({ limit, sortBy: 'quality' });
  }

  // Build fallback query - prioritize by matching attributes
  // Try: same sport + play_type first, then same sport
  let query = supabaseServer
    .from(PHOTOS_READ)
    .select(PHOTO_COLUMNS)
    .neq('image_key', imageKey) // Exclude the source photo
    .not('sharpness', 'is', null);

  // Add filters based on available attributes (most specific to least)
  if (sourcePhoto.sport_type) {
    query = query.eq('sport_type', sourcePhoto.sport_type);
  }
  if (sourcePhoto.play_type) {
    query = query.eq('play_type', sourcePhoto.play_type);
  }

  const { data: fallbackPhotos, error: fallbackError } = await query
    .order('quality_score', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (!fallbackError && fallbackPhotos && fallbackPhotos.length > 0) {
    console.log(`[findSimilarPhotos] Attribute fallback found ${fallbackPhotos.length} similar photos in ${Date.now() - start}ms`);
    return fallbackPhotos.map(transformPhotoRow);
  }

  // 3. Ultimate fallback: If still no results, return high-quality photos from same sport
  console.log('[findSimilarPhotos] Attribute match failed, trying sport-only fallback');

  const { data: sportFallback } = await supabaseServer
    .from(PHOTOS_READ)
    .select(PHOTO_COLUMNS)
    .neq('image_key', imageKey)
    .not('sharpness', 'is', null)
    .eq('sport_type', sourcePhoto.sport_type || 'Volleyball')
    .order('quality_score', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (sportFallback && sportFallback.length > 0) {
    console.log(`[findSimilarPhotos] Sport fallback found ${sportFallback.length} photos in ${Date.now() - start}ms`);
    return sportFallback.map(transformPhotoRow);
  }

  // 4. Absolute last resort: Just return quality photos
  console.log('[findSimilarPhotos] All fallbacks exhausted, returning quality photos');
  return fetchPhotos({ limit, sortBy: 'quality' });
}

/**
 * Find photos by jersey number via the relational sightings (find_photos_by_jersey RPC over
 * photo_jersey_sightings). Replaces the old singular-column `.eq('jersey_number')`: catches
 * multi-player jerseys (from the players[] extraction, not just the primary subject), supports
 * text jerseys ('00', '7A'), and scopes by album/sport. No naming/biometrics involved (jersey
 * number is non-PII). The RPC returns cf_image_id + display fields, quality-ranked, one row per
 * photo — map straight to Photo.
 */
export async function findPhotosByJersey(
  jersey: string,
  opts: { albumKey?: string; sport?: string; teamColor?: string; limit?: number; offset?: number } = {}
): Promise<Photo[]> {
  const { albumKey, sport, teamColor, limit = 24, offset = 0 } = opts;
  const { data: matches, error } = await supabaseServer.rpc('find_photos_by_jersey', {
    p_jersey: jersey.trim(),
    p_album_key: albumKey ?? null,
    p_team_color: teamColor ?? null,
    p_sport: sport ?? null,
    p_limit: limit,
    p_offset: offset
  });
  if (error) {
    console.error('[findPhotosByJersey] RPC error:', error.message);
    return [];
  }
  return (matches ?? []).map((m: any) => transformPhotoRow(m));
}

// ============================================================
// Smart Search (Structured Parse + Vector Fallback)
// ============================================================

export interface SearchResult {
  photos: Photo[];
  totalCount: number;
  searchMode: 'structured' | 'semantic';
  parsedDescription: string;
}

/**
 * Generate a vector embedding for a search query.
 *
 * Delegates to the shared `embedText` (OpenRouter `openai/text-embedding-3-large`
 * @ 768 dims) so the QUERY path matches the WRITE path exactly. They MUST stay in
 * lockstep — same model + dims — or query vectors land in a different space than the
 * stored caption vectors and semantic search returns noise. (The previous code used
 * Gemini `embedding-001` at query time vs `gemini-embedding-001` at write time AND
 * relied on now-revoked Google keys; both are fixed by routing through `embedText`.)
 *
 * Returns null on any error (graceful degradation → structured search).
 */
async function embedSearchQuery(query: string): Promise<number[] | null> {
  const apiKey = import.meta.env.OPENROUTER_API_KEY || import.meta.env.VITE_OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn('[embedSearchQuery] OPENROUTER_API_KEY not configured — vector search unavailable');
    return null;
  }
  return embedText(query, apiKey);
}

/**
 * Search photos using Smart Parse + Vector Fallback.
 *
 * 1. Parse query into structured metadata filters
 * 2. If all terms matched → fast structured path via fetchPhotos
 * 3. If unmatched terms remain or zero results → vector semantic search via match_photos RPC
 */
export async function searchPhotos(
  query: string,
  existingFilters: Partial<PhotoFilterState>,
  options: { limit?: number; offset?: number; sortBy?: FetchPhotosOptions['sortBy']; albumNames?: string[] } = {}
): Promise<SearchResult> {
  const { limit = 24, offset = 0, sortBy = 'quality', albumNames } = options;
  const { parseQuery } = await import('$lib/utils/nlp-query-parser');

  const parsed = parseQuery(query, albumNames);
  console.log('[searchPhotos] Parsed query:', { query, parsed });

  // Merge parsed filters with existing URL filters (parsed takes precedence for new fields)
  const mergedFilters: Partial<PhotoFilterState> = { ...existingFilters };
  const pf = parsed.matchedFilters;
  if (pf.sportType) mergedFilters.sportType = pf.sportType;
  if (pf.photoCategory) mergedFilters.photoCategory = pf.photoCategory;
  if (pf.playTypes?.length) mergedFilters.playTypes = pf.playTypes;
  if (pf.albumKey) mergedFilters.albumKey = pf.albumKey;
  if (pf.jerseyNumber !== undefined) mergedFilters.jerseyNumber = pf.jerseyNumber;

  const hasMatchedFilters = Object.keys(parsed.matchedFilters).length > 0;
  const hasUnmatchedTerms = parsed.unmatchedTerms.length > 0;

  // Fast path: all terms matched → use structured filters
  if (hasMatchedFilters && !hasUnmatchedTerms) {
    const [photos, totalCount] = await Promise.all([
      fetchPhotos({ ...mergedFilters, limit, offset, sortBy }),
      getPhotoCount(mergedFilters),
    ]);

    // If structured search returned results, use them
    if (photos.length > 0 || offset > 0) {
      return {
        photos,
        totalCount,
        searchMode: 'structured',
        parsedDescription: parsed.description,
      };
    }
    // Zero results on first page — fall through to semantic search
  }

  // Semantic path: unmatched terms or zero structured results
  // If we had some matched filters but also unmatched terms, try structured first
  if (hasMatchedFilters && hasUnmatchedTerms) {
    const [photos, totalCount] = await Promise.all([
      fetchPhotos({ ...mergedFilters, limit, offset, sortBy }),
      getPhotoCount(mergedFilters),
    ]);

    if (photos.length > 0) {
      return {
        photos,
        totalCount,
        searchMode: 'structured',
        parsedDescription: parsed.description,
      };
    }
  }

  // Vector search fallback
  const embedding = await embedSearchQuery(query);
  if (!embedding) {
    return {
      photos: [],
      totalCount: 0,
      searchMode: 'semantic',
      parsedDescription: 'Search unavailable. Try using filters instead.',
    };
  }

  const { data: matches, error } = await supabaseServer.rpc('match_photos', {
    query_embedding: embedding,
    match_threshold: 0.5,
    match_count: limit,
  });

  if (error || !matches || matches.length === 0) {
    if (error) console.error('[searchPhotos] match_photos RPC error:', error);
    return {
      photos: [],
      totalCount: 0,
      searchMode: 'semantic',
      parsedDescription: `No results found for "${query}"`,
    };
  }

  // Fetch full photo data for matched image_keys (same pattern as findSimilarPhotos)
  const keys = matches.map((m: { image_key: string }) => m.image_key);
  const { data: photosData, error: photosError } = await supabaseServer
    .from(PHOTOS_READ)
    .select(PHOTO_COLUMNS)
    .in('image_key', keys)
    .not('sharpness', 'is', null);

  if (photosError || !photosData) {
    return {
      photos: [],
      totalCount: 0,
      searchMode: 'semantic',
      parsedDescription: `No results found for "${query}"`,
    };
  }

  // Preserve similarity-based ordering
  const photoMap = new Map(photosData.map(p => [p.image_key, p]));
  const photos = matches
    .map((m: { image_key: string }) => photoMap.get(m.image_key))
    .filter((p: unknown): p is NonNullable<typeof p> => !!p)
    .map(transformPhotoRow);

  return {
    photos,
    totalCount: photos.length,
    searchMode: 'semantic',
    parsedDescription: `Results similar to "${query}"`,
  };
}

// ============================================================
// Album Settings (Unlisted Albums / Share Links)
// ============================================================

/**
 * Get album settings by album key
 */
export async function getAlbumSettings(albumKey: string): Promise<AlbumSettingsRow | null> {
  const { data, error } = await supabaseServer
    .from('album_settings')
    .select('*')
    .eq('album_key', albumKey)
    .maybeSingle();

  if (error) {
    console.error('[getAlbumSettings] Error:', error);
    return null;
  }

  return data as AlbumSettingsRow | null;
}

/**
 * Look up an album by its share token (for /share/[token] route)
 */
export async function getAlbumByShareToken(shareToken: string): Promise<AlbumSettingsRow | null> {
  const { data, error } = await supabaseServer
    .from('album_settings')
    .select('*')
    .eq('share_token', shareToken)
    .maybeSingle();

  if (error) {
    console.error('[getAlbumByShareToken] Error:', error);
    return null;
  }

  return data as AlbumSettingsRow | null;
}

/**
 * Fetch minimal photo data for bulk download (cf_image_id + image_key only)
 */
export async function fetchAlbumPhotosForDownload(
  albumKey: string
): Promise<Array<{ cf_image_id: string; image_key: string }>> {
  const { data, error } = await supabaseServer
    .from(PHOTOS_READ)
    .select('cf_image_id, image_key')
    .eq('album_key', albumKey)
    .not('sharpness', 'is', null)
    .not('cf_image_id', 'is', null);

  if (error) {
    console.error('[fetchAlbumPhotosForDownload] Error:', error);
    return [];
  }

  return (data || []) as Array<{ cf_image_id: string; image_key: string }>;
}

/**
 * Fetch videos for an album from video_metadata table (Cloudflare Stream)
 */
export async function fetchAlbumVideos(albumKey: string): Promise<Video[]> {
  const { data, error } = await supabaseServer
    .from('video_metadata')
    .select('video_id, cf_stream_id, cf_stream_thumbnail, album_key, album_name, title, description, duration_seconds, sport_type, video_category, video_date')
    .eq('album_key', albumKey)
    .order('upload_date', { ascending: false });

  if (error) {
    console.error('[fetchAlbumVideos] Error:', error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.video_id,
    cf_stream_id: row.cf_stream_id,
    cf_stream_thumbnail: row.cf_stream_thumbnail || null,
    album_key: row.album_key,
    album_name: row.album_name || 'Unknown Album',
    title: row.title || null,
    description: row.description || null,
    duration_seconds: row.duration_seconds || null,
    sport_type: row.sport_type || 'volleyball',
    video_category: row.video_category || 'highlights',
    video_date: row.video_date || null,
  })) as Video[];
}
