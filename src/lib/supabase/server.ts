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
import type { Photo, PhotoFilterState } from '$types/photo';
import type { SportDistributionRow, CategoryDistributionRow, AlbumSettingsRow } from '$types/database';
import { cfImageUrl } from '$lib/utils/cloudflare-images';

/**
 * Columns needed by transformPhotoRow (excludes embedding vector ~6KB/row and other heavy columns).
 * Reuse everywhere instead of select('*') to avoid fetching unnecessary data.
 */
export const PHOTO_COLUMNS = 'photo_id, image_key, cf_image_id, album_key, album_name, sport_type, photo_category, play_type, composition, time_of_day, lighting, color_temperature, emotion, action_intensity, sharpness, composition_score, exposure_accuracy, emotional_impact, time_in_game, athlete_id, jersey_number, event_id, ai_provider, ai_cost, ai_confidence, aspect_ratio, photo_date, upload_date, enriched_at';

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
    caption: '',
    keywords: [],
    created_at: row.photo_date || row.enriched_at || row.upload_date,
    metadata: {
      play_type: (row.play_type || null) as Photo['metadata']['play_type'],
      action_intensity: (row.action_intensity || 'medium') as Photo['metadata']['action_intensity'],
      sport_type: row.sport_type,
      photo_category: row.photo_category,
      composition: (row.composition || '') as Photo['metadata']['composition'],
      time_of_day: (row.time_of_day || '') as Photo['metadata']['time_of_day'],
      lighting: (row.lighting || undefined) as Photo['metadata']['lighting'],
      color_temperature: (row.color_temperature || undefined) as Photo['metadata']['color_temperature'],
      emotion: (row.emotion || 'focus') as Photo['metadata']['emotion'],
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
      ai_confidence: row.ai_confidence ?? 0,
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
  sortBy?: 'quality' | 'newest' | 'oldest' | 'action' | 'intensity';
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
    .from('photo_metadata')
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

  if (filters?.actionIntensity && filters.actionIntensity.length > 0) {
    query = query.in('action_intensity', filters.actionIntensity);
  }

  // Aesthetic filters
  if (filters?.compositions && filters.compositions.length > 0) {
    query = query.in('composition', filters.compositions);
  }

  if (filters?.timeOfDay && filters.timeOfDay.length > 0) {
    query = query.in('time_of_day', filters.timeOfDay);
  }

  if (filters?.lighting && filters.lighting.length > 0) {
    query = query.in('lighting', filters.lighting);
  }

  if (filters?.colorTemperature && filters.colorTemperature.length > 0) {
    query = query.in('color_temperature', filters.colorTemperature);
  }

  // Emotion filter (Bucket 2, but used for "Similar Photos" feature)
  if (filters?.emotion) {
    query = query.eq('emotion', filters.emotion);
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
      // Sort by emotional impact (best photos first), then by upload_date DESC for deterministic ordering
      query = query.order('emotional_impact', { ascending: false }).order('upload_date', { ascending: false });
      break;
    case 'newest':
      // Use upload_date or date_added (album add) as fallback
      query = query.order('upload_date', { ascending: false });
      break;
    case 'oldest':
      query = query.order('upload_date', { ascending: true });
      break;
    case 'action':
      // Sort by play type (alphabetical grouping), then by emotional_impact for deterministic ordering
      query = query.order('play_type', { ascending: true, nullsFirst: false }).order('emotional_impact', { ascending: false });
      break;
    case 'intensity':
      // Sort by action intensity (peak -> high -> medium -> low), then by emotional_impact for deterministic ordering
      query = query.order('action_intensity', { ascending: false, nullsFirst: false }).order('emotional_impact', { ascending: false });
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
    .from('photo_metadata')
    .select('photo_id', { count: 'exact', head: true })
    .not('sharpness', 'is', null);

  // Apply same Bucket 1 filters as fetchPhotos
  if (filters?.playTypes && filters.playTypes.length > 0) {
    query = query.in('play_type', filters.playTypes);
  }

  if (filters?.actionIntensity && filters.actionIntensity.length > 0) {
    query = query.in('action_intensity', filters.actionIntensity);
  }

  if (filters?.sportType) {
    query = query.eq('sport_type', filters.sportType);
  }

  if (filters?.photoCategory) {
    query = query.eq('photo_category', filters.photoCategory);
  }

  if (filters?.compositions && filters.compositions.length > 0) {
    query = query.in('composition', filters.compositions);
  }

  if (filters?.timeOfDay && filters.timeOfDay.length > 0) {
    query = query.in('time_of_day', filters.timeOfDay);
  }

  if (filters?.lighting && filters.lighting.length > 0) {
    query = query.in('lighting', filters.lighting);
  }

  if (filters?.colorTemperature && filters.colorTemperature.length > 0) {
    query = query.in('color_temperature', filters.colorTemperature);
  }

  // Emotion filter (Bucket 2, but used for "Similar Photos" feature)
  if (filters?.emotion) {
    query = query.eq('emotion', filters.emotion);
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
  try {
    // Use raw SQL to do GROUP BY aggregation on database side
    // This avoids fetching 20K rows and hitting Supabase row limits
    const { data, error } = await supabaseServer.rpc('exec_sql', {
      sql: `
        SELECT
          sport_type as name,
          COUNT(*) as count,
          ROUND((COUNT(*) * 100.0 / SUM(COUNT(*)) OVER ()), 1) as percentage
        FROM photo_metadata
        WHERE sharpness IS NOT NULL
          AND sport_type IS NOT NULL
          AND sport_type != 'unknown'
        GROUP BY sport_type
        ORDER BY count DESC
      `
    });

    if (error) {
      throw error; // Trigger fallback
    }

    // Process SQL results
    return (data || []).map((row: SportDistributionRow) => ({
      name: row.name,
      count: parseInt(row.count.toString()),
      percentage: parseFloat(row.percentage.toString())
    }));
  } catch (error) {
    // Fallback: If custom RPC doesn't exist, use Supabase's native aggregation
    console.warn('[Supabase Server] exec_sql RPC not found, using native query method:', error);

    try {
      // Get total count first
      const { count: totalCount, error: countError } = await supabaseServer
        .from('photo_metadata')
        .select('*', { count: 'exact', head: true })
        .not('sharpness', 'is', null)
        .not('sport_type', 'is', null)
        .neq('sport_type', 'unknown');

      if (countError) {
        console.error('[Supabase Server] Error fetching total count for sports:', countError);
        return []; // Return empty array instead of throwing
      }

      const total = totalCount || 0;

      // Unfortunately, Supabase JS doesn't support GROUP BY natively
      // So we have to use a workaround: fetch unique sports, then count each
      const sports = ['volleyball', 'portrait', 'basketball', 'softball', 'soccer', 'track', 'football', 'baseball'];

      const results = await Promise.all(
        sports.map(async (sport) => {
          const { count, error: sportError } = await supabaseServer
            .from('photo_metadata')
            .select('*', { count: 'exact', head: true })
            .eq('sport_type', sport)
            .not('sharpness', 'is', null);

          if (sportError) {
            console.error(`[Supabase Server] Error fetching count for sport ${sport}:`, sportError);
            return { name: sport, count: 0, percentage: 0 };
          }

          return {
            name: sport,
            count: count || 0,
            percentage: parseFloat(((count || 0) / total * 100).toFixed(1))
          };
        })
      );

      return results
        .filter(s => s.count > 0)
        .sort((a, b) => b.count - a.count);
    } catch (fallbackError) {
      console.error('[Supabase Server] Critical error in getSportDistribution fallback:', fallbackError);
      return []; // Return empty array as last resort
    }
  }
}

/**
 * Get filter counts for all filter options (SERVER-SIDE)
 * Returns counts for each filter option while respecting currently active filters
 * This enables "smart" filtering where users can see how many results each option will return
 */
export interface FilterCounts {
  sports: Array<{ name: string; count: number }>;
  categories: Array<{ name: string; count: number }>;
  playTypes: Array<{ name: string; count: number }>;
  intensities: Array<{ name: string; count: number }>;
  lighting: Array<{ name: string; count: number }>;
  colorTemperatures: Array<{ name: string; count: number }>;
  timesOfDay: Array<{ name: string; count: number }>;
  compositions: Array<{ name: string; count: number }>;
}

/**
 * OPTIMIZED: Get filter counts using aggregation queries (GROUP BY)
 * Reduces database queries from ~50-80 to ~8 (one per filter dimension)
 *
 * Performance improvements:
 * - Uses COUNT() with GROUP BY instead of individual queries
 * - Single query per dimension (8 queries total vs 50-80)
 * - Respects current filters to show compatible counts
 * - No hardcoded filter values (uses actual data)
 *
 * Phase 1 of Intelligent Filter System (27-40h total)
 * This function is the foundation - estimate 8-12h
 */
export async function getFilterCounts(currentFilters?: PhotoFilterState): Promise<FilterCounts> {
  // SECURITY: Whitelist of allowed filter values to prevent SQL injection
  const ALLOWED_VALUES = {
    sport_type: ['volleyball', 'basketball', 'soccer', 'football', 'baseball', 'tennis', 'hockey', 'other'],
    photo_category: ['action', 'portrait', 'celebration', 'team', 'warmup', 'candid', 'other'],
    play_type: ['spike', 'block', 'serve', 'dig', 'set', 'pass', 'jump', 'dive', 'other'],
    action_intensity: ['low', 'medium', 'high', 'peak', 'extreme'],
    lighting: ['natural', 'artificial', 'mixed', 'dramatic', 'soft'],
    color_temperature: ['warm', 'cool', 'neutral'],
    time_of_day: ['morning', 'midday', 'afternoon', 'evening', 'night'],
    composition: ['rule_of_thirds', 'centered', 'dynamic', 'symmetrical', 'leading_lines', 'framing']
  };

  // Sanitize a single value against whitelist (returns null if invalid)
  const sanitize = (value: string, field: keyof typeof ALLOWED_VALUES): string | null => {
    const allowed = ALLOWED_VALUES[field];
    // Only allow alphanumeric and underscore, max 50 chars
    const cleaned = value.replace(/[^a-z0-9_]/gi, '').substring(0, 50).toLowerCase();
    return allowed.includes(cleaned) ? cleaned : null;
  };

  // Sanitize array of values against whitelist
  const sanitizeArray = (values: (string | null)[], field: keyof typeof ALLOWED_VALUES): string[] => {
    return values
      .filter((v): v is string => v !== null && typeof v === 'string')
      .map(v => sanitize(v, field))
      .filter((v): v is string => v !== null);
  };

  // Helper to build WHERE clause from current filters (excluding the dimension being counted)
  const buildFilterConditions = (excludeField: string): string => {
    const conditions: string[] = ['sharpness IS NOT NULL']; // Base condition

    if (currentFilters?.sportType && excludeField !== 'sport_type') {
      const safe = sanitize(currentFilters.sportType, 'sport_type');
      if (safe) conditions.push(`sport_type = '${safe}'`);
    }
    if (currentFilters?.photoCategory && excludeField !== 'photo_category') {
      const safe = sanitize(currentFilters.photoCategory, 'photo_category');
      if (safe) conditions.push(`photo_category = '${safe}'`);
    }
    if (currentFilters?.playTypes && currentFilters.playTypes.length > 0 && excludeField !== 'play_type') {
      const safeList = sanitizeArray(currentFilters.playTypes, 'play_type');
      if (safeList.length > 0) {
        conditions.push(`play_type IN (${safeList.map(pt => `'${pt}'`).join(', ')})`);
      }
    }
    if (currentFilters?.actionIntensity && currentFilters.actionIntensity.length > 0 && excludeField !== 'action_intensity') {
      const safeList = sanitizeArray(currentFilters.actionIntensity, 'action_intensity');
      if (safeList.length > 0) {
        conditions.push(`action_intensity IN (${safeList.map(ai => `'${ai}'`).join(', ')})`);
      }
    }
    if (currentFilters?.lighting && currentFilters.lighting.length > 0 && excludeField !== 'lighting') {
      const safeList = sanitizeArray(currentFilters.lighting, 'lighting');
      if (safeList.length > 0) {
        conditions.push(`lighting IN (${safeList.map(l => `'${l}'`).join(', ')})`);
      }
    }
    if (currentFilters?.colorTemperature && currentFilters.colorTemperature.length > 0 && excludeField !== 'color_temperature') {
      const safeList = sanitizeArray(currentFilters.colorTemperature, 'color_temperature');
      if (safeList.length > 0) {
        conditions.push(`color_temperature IN (${safeList.map(ct => `'${ct}'`).join(', ')})`);
      }
    }
    if (currentFilters?.timeOfDay && currentFilters.timeOfDay.length > 0 && excludeField !== 'time_of_day') {
      const safeList = sanitizeArray(currentFilters.timeOfDay, 'time_of_day');
      if (safeList.length > 0) {
        conditions.push(`time_of_day IN (${safeList.map(tod => `'${tod}'`).join(', ')})`);
      }
    }
    if (currentFilters?.compositions && currentFilters.compositions.length > 0 && excludeField !== 'composition') {
      const safeList = sanitizeArray(currentFilters.compositions, 'composition');
      if (safeList.length > 0) {
        conditions.push(`composition IN (${safeList.map(c => `'${c}'`).join(', ')})`);
      }
    }

    return conditions.join(' AND ');
  };

  // Dimensions to count, each with its own WHERE clause (excludes self)
  const dimensions = [
    'sport_type',
    'photo_category',
    'play_type',
    'action_intensity',
    'lighting',
    'color_temperature',
    'time_of_day',
    'composition'
  ] as const;

  // Map dimension column names to FilterCounts keys
  const dimensionToKey: Record<string, keyof FilterCounts> = {
    sport_type: 'sports',
    photo_category: 'categories',
    play_type: 'playTypes',
    action_intensity: 'intensities',
    lighting: 'lighting',
    color_temperature: 'colorTemperatures',
    time_of_day: 'timesOfDay',
    composition: 'compositions'
  };

  try {
    // Build a single UNION ALL query for all 8 dimensions (1 round-trip instead of 8)
    const unionParts = dimensions.map(dim => {
      const conditions = buildFilterConditions(dim);
      return `SELECT '${dim}' as dimension, ${dim} as name, COUNT(*) as count
      FROM photo_metadata
      WHERE ${conditions} AND ${dim} IS NOT NULL
      GROUP BY ${dim}`;
    });

    const sql = unionParts.join('\nUNION ALL\n') + '\nORDER BY dimension, count DESC';

    const { data, error } = await supabaseServer.rpc('exec_sql', { sql });

    if (error) throw error;

    // Parse flat results back into the FilterCounts structure
    const result: FilterCounts = {
      sports: [], categories: [], playTypes: [], intensities: [],
      lighting: [], colorTemperatures: [], timesOfDay: [], compositions: []
    };

    for (const row of (data || []) as Array<{ dimension: string; name: string; count: number | string }>) {
      const key = dimensionToKey[row.dimension];
      if (key) {
        const count = typeof row.count === 'string' ? parseInt(row.count) : row.count;
        if (count > 0) {
          result[key].push({ name: row.name, count });
        }
      }
    }

    return result;
  } catch (error) {
    // Fallback: 8 individual queries in parallel (if exec_sql RPC is missing)
    console.warn('[getFilterCounts] Batched RPC failed, falling back to individual queries:', error);

    const getAggregatedCounts = async (
      fieldName: string
    ): Promise<Array<{ name: string; count: number }>> => {
      let query = supabaseServer
        .from('photo_metadata')
        .select(fieldName)
        .not('sharpness', 'is', null)
        .not(fieldName, 'is', null);

      if (currentFilters?.sportType && fieldName !== 'sport_type') {
        query = query.eq('sport_type', currentFilters.sportType);
      }
      if (currentFilters?.photoCategory && fieldName !== 'photo_category') {
        query = query.eq('photo_category', currentFilters.photoCategory);
      }
      if (currentFilters?.playTypes && currentFilters.playTypes.length > 0 && fieldName !== 'play_type') {
        query = query.in('play_type', currentFilters.playTypes);
      }
      if (currentFilters?.actionIntensity && currentFilters.actionIntensity.length > 0 && fieldName !== 'action_intensity') {
        query = query.in('action_intensity', currentFilters.actionIntensity);
      }
      if (currentFilters?.lighting && currentFilters.lighting.length > 0 && fieldName !== 'lighting') {
        query = query.in('lighting', currentFilters.lighting);
      }
      if (currentFilters?.colorTemperature && currentFilters.colorTemperature.length > 0 && fieldName !== 'color_temperature') {
        query = query.in('color_temperature', currentFilters.colorTemperature);
      }
      if (currentFilters?.timeOfDay && currentFilters.timeOfDay.length > 0 && fieldName !== 'time_of_day') {
        query = query.in('time_of_day', currentFilters.timeOfDay);
      }
      if (currentFilters?.compositions && currentFilters.compositions.length > 0 && fieldName !== 'composition') {
        query = query.in('composition', currentFilters.compositions);
      }

      const { data: distinctData, error: distinctError } = await query;

      if (distinctError) {
        console.error(`[getFilterCounts] Error fetching distinct values for ${fieldName}:`, distinctError);
        return [];
      }

      const uniqueValues = Array.from(new Set((distinctData || []).map((row: any) => row[fieldName]))).filter(Boolean);

      const counts = await Promise.all(
        uniqueValues.map(async (value) => {
          let countQuery = supabaseServer
            .from('photo_metadata')
            .select('photo_id', { count: 'exact', head: true })
            .not('sharpness', 'is', null)
            .eq(fieldName, value);

          if (currentFilters?.sportType && fieldName !== 'sport_type') {
            countQuery = countQuery.eq('sport_type', currentFilters.sportType);
          }
          if (currentFilters?.photoCategory && fieldName !== 'photo_category') {
            countQuery = countQuery.eq('photo_category', currentFilters.photoCategory);
          }
          if (currentFilters?.playTypes && currentFilters.playTypes.length > 0 && fieldName !== 'play_type') {
            countQuery = countQuery.in('play_type', currentFilters.playTypes);
          }
          if (currentFilters?.actionIntensity && currentFilters.actionIntensity.length > 0 && fieldName !== 'action_intensity') {
            countQuery = countQuery.in('action_intensity', currentFilters.actionIntensity);
          }
          if (currentFilters?.lighting && currentFilters.lighting.length > 0 && fieldName !== 'lighting') {
            countQuery = countQuery.in('lighting', currentFilters.lighting);
          }
          if (currentFilters?.colorTemperature && currentFilters.colorTemperature.length > 0 && fieldName !== 'color_temperature') {
            countQuery = countQuery.in('color_temperature', currentFilters.colorTemperature);
          }
          if (currentFilters?.timeOfDay && currentFilters.timeOfDay.length > 0 && fieldName !== 'time_of_day') {
            countQuery = countQuery.in('time_of_day', currentFilters.timeOfDay);
          }
          if (currentFilters?.compositions && currentFilters.compositions.length > 0 && fieldName !== 'composition') {
            countQuery = countQuery.in('composition', currentFilters.compositions);
          }

          const { count } = await countQuery;
          return { name: value as string, count: count || 0 };
        })
      );

      return counts.filter(c => c.count > 0).sort((a, b) => b.count - a.count);
    };

    const [
      sportCounts, categoryCounts, playTypeCounts, intensityCounts,
      lightingCounts, colorTempCounts, timeOfDayCounts, compositionCounts,
    ] = await Promise.all([
      getAggregatedCounts('sport_type'),
      getAggregatedCounts('photo_category'),
      getAggregatedCounts('play_type'),
      getAggregatedCounts('action_intensity'),
      getAggregatedCounts('lighting'),
      getAggregatedCounts('color_temperature'),
      getAggregatedCounts('time_of_day'),
      getAggregatedCounts('composition'),
    ]);

    return {
      sports: sportCounts,
      categories: categoryCounts,
      playTypes: playTypeCounts,
      intensities: intensityCounts,
      lighting: lightingCounts,
      colorTemperatures: colorTempCounts,
      timesOfDay: timeOfDayCounts,
      compositions: compositionCounts,
    };
  }
}

/**
 * Get photo category distribution statistics (SERVER-SIDE)
 * Returns count and percentage for each category type
 * Uses SQL aggregation for efficiency (no row limit issues)
 */
export async function getCategoryDistribution(): Promise<Array<{ name: string; count: number; percentage: number }>> {
  try {
    // Use raw SQL to do GROUP BY aggregation on database side
    const { data, error } = await supabaseServer.rpc('exec_sql', {
      sql: `
        SELECT
          photo_category as name,
          COUNT(*) as count,
          ROUND((COUNT(*) * 100.0 / SUM(COUNT(*)) OVER ()), 1) as percentage
        FROM photo_metadata
        WHERE sharpness IS NOT NULL
          AND photo_category IS NOT NULL
        GROUP BY photo_category
        ORDER BY count DESC
      `
    });

    if (error) {
      throw error; // Trigger fallback
    }

    // Process SQL results
    return (data || []).map((row: CategoryDistributionRow) => ({
      name: row.name,
      count: parseInt(row.count.toString()),
      percentage: parseFloat(row.percentage.toString())
    }));
  } catch (error) {
    // Fallback: Use individual COUNT queries for each category
    console.warn('[Supabase Server] exec_sql RPC not found, using native query method for categories:', error);

    try {
      // Get total count first
      const { count: totalCount, error: countError } = await supabaseServer
        .from('photo_metadata')
        .select('*', { count: 'exact', head: true })
        .not('sharpness', 'is', null)
        .not('photo_category', 'is', null);

      if (countError) {
        console.error('[Supabase Server] Error fetching total count for categories:', countError);
        return []; // Return empty array instead of throwing
      }

      const total = totalCount || 0;

      // Known categories from migration SQL
      const categories = ['action', 'celebration', 'candid', 'portrait', 'warmup', 'ceremony'];

      const results = await Promise.all(
        categories.map(async (category) => {
          const { count, error: categoryError } = await supabaseServer
            .from('photo_metadata')
            .select('*', { count: 'exact', head: true })
            .eq('photo_category', category)
            .not('sharpness', 'is', null);

          if (categoryError) {
            console.error(`[Supabase Server] Error fetching count for category ${category}:`, categoryError);
            return { name: category, count: 0, percentage: 0 };
          }

          return {
            name: category,
            count: count || 0,
            percentage: parseFloat(((count || 0) / total * 100).toFixed(1))
          };
        })
      );

      return results
        .filter(c => c.count > 0)
        .sort((a, b) => b.count - a.count);
    } catch (fallbackError) {
      console.error('[Supabase Server] Critical error in getCategoryDistribution fallback:', fallbackError);
      return []; // Return empty array as last resort
    }
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

  try {
    // Use raw SQL to get periods with photo counts (GROUP BY approach)
    const { data: periods, error: periodsError } = await supabaseServer.rpc('exec_sql', {
      sql: `
        SELECT
          EXTRACT(YEAR FROM upload_date) as year,
          EXTRACT(MONTH FROM upload_date) as month,
          COUNT(*) as photo_count
        FROM photo_metadata
        WHERE sharpness IS NOT NULL
          AND upload_date IS NOT NULL
          ${sportFilter ? `AND sport_type = '${sportFilter}'` : ''}
          ${categoryFilter ? `AND photo_category = '${categoryFilter}'` : ''}
        GROUP BY EXTRACT(YEAR FROM upload_date), EXTRACT(MONTH FROM upload_date)
        ORDER BY year DESC, month DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    });

    if (periodsError) {
      throw periodsError; // This will trigger the fallback below
    }

    // Process the periods data
    const processedPeriods = (periods || []).map((row: any) => ({
      year: parseInt(row.year.toString()),
      month: parseInt(row.month.toString()),
      monthName: new Date(parseInt(row.year.toString()), parseInt(row.month.toString()) - 1).toLocaleString('default', { month: 'long' }),
      photoCount: parseInt(row.photo_count.toString())
    }));

    // If we need featured photos, fetch them for each period
    if (includeFeatured && processedPeriods.length > 0) {
      const periodsWithPhotos = await Promise.all(
        processedPeriods.map(async (period: { year: number; month: number; monthName: string; photoCount: number }) => {
          const startDate = new Date(period.year, period.month - 1, 1);
          const endDate = new Date(period.year, period.month, 1);

          let photoQuery = supabaseServer
            .from('photo_metadata')
            .select(PHOTO_COLUMNS)
            .gte('upload_date', startDate.toISOString())
            .lt('upload_date', endDate.toISOString())
            .not('sharpness', 'is', null);

          // Apply filters
          if (sportFilter) {
            photoQuery = photoQuery.eq('sport_type', sportFilter);
          }

          if (categoryFilter) {
            photoQuery = photoQuery.eq('photo_category', categoryFilter);
          }

          const { data: photos } = await photoQuery
            .order('emotional_impact', { ascending: false })
            .limit(6); // Top 6 photos per period

          return {
            ...period,
            featuredPhotos: (photos || []).map(transformPhotoRow)
          };
        })
      );

      return periodsWithPhotos;
    }

    // Return just periods without photos
    return processedPeriods;

  } catch (error) {
    console.error('[Supabase] Error with SQL approach, using manual fallback:', error);

    // Manual fallback: fetch photos and group them in memory
    let query = supabaseServer
      .from('photo_metadata')
      .select('upload_date')
      .not('sharpness', 'is', null)
      .not('upload_date', 'is', null);

    if (sportFilter) {
      query = query.eq('sport_type', sportFilter);
    }

    if (categoryFilter) {
      query = query.eq('photo_category', categoryFilter);
    }

    const { data: allPhotos, error: photosError } = await query
      .order('upload_date', { ascending: false })
      .limit(1000); // Get a reasonable sample

    if (photosError) {
      console.error('[Supabase] Fallback query also failed:', photosError);
      throw photosError;
    }

    // Group by year/month manually
    const periodMap = new Map<string, { year: number; month: number; count: number }>();
    allPhotos?.forEach((photo: any) => {
      const date = new Date(photo.upload_date);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const key = `${year}-${month}`;

      if (periodMap.has(key)) {
        periodMap.get(key)!.count++;
      } else {
        periodMap.set(key, { year, month, count: 1 });
      }
    });

    const periods = Array.from(periodMap.values())
      .sort((a, b) => b.year - a.year || b.month - a.month)
      .slice(offset, offset + limit);

    // If we need featured photos, fetch them for each period
    if (includeFeatured && periods.length > 0) {
      const periodsWithPhotos = await Promise.all(
        periods.map(async (period) => {
          const startDate = new Date(period.year, period.month - 1, 1);
          const endDate = new Date(period.year, period.month, 1);

          let photoQuery = supabaseServer
            .from('photo_metadata')
            .select(PHOTO_COLUMNS)
            .gte('upload_date', startDate.toISOString())
            .lt('upload_date', endDate.toISOString())
            .not('sharpness', 'is', null);

          // Apply filters
          if (sportFilter) {
            photoQuery = photoQuery.eq('sport_type', sportFilter);
          }

          if (categoryFilter) {
            photoQuery = photoQuery.eq('photo_category', categoryFilter);
          }

          const { data: photos } = await photoQuery
            .order('emotional_impact', { ascending: false })
            .limit(6); // Top 6 photos per period

          return {
            year: period.year,
            month: period.month,
            monthName: new Date(period.year, period.month - 1).toLocaleString('default', { month: 'long' }),
            photoCount: period.count,
            featuredPhotos: (photos || []).map(transformPhotoRow)
          };
        })
      );

      return periodsWithPhotos;
    }

    // Return just periods without photos
    return periods.map(period => ({
      year: period.year,
      month: period.month,
      monthName: new Date(period.year, period.month - 1).toLocaleString('default', { month: 'long' }),
      photoCount: period.count
    }));
  }
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
  const { sportFilter, categoryFilter } = options || {};

  try {
    // Use raw SQL to get all periods with photo counts (GROUP BY approach)
    const { data: periods, error: periodsError } = await supabaseServer.rpc('exec_sql', {
      sql: `
        SELECT
          EXTRACT(YEAR FROM upload_date) as year,
          EXTRACT(MONTH FROM upload_date) as month,
          COUNT(*) as photo_count
        FROM photo_metadata
        WHERE sharpness IS NOT NULL
          AND upload_date IS NOT NULL
          ${sportFilter ? `AND sport_type = '${sportFilter}'` : ''}
          ${categoryFilter ? `AND photo_category = '${categoryFilter}'` : ''}
        GROUP BY EXTRACT(YEAR FROM upload_date), EXTRACT(MONTH FROM upload_date)
        ORDER BY year DESC, month DESC
      `
    });

    if (periodsError) {
      throw periodsError; // This will trigger the fallback below
    }

    // Process the periods data
    return (periods || []).map((row: any) => ({
      year: parseInt(row.year.toString()),
      month: parseInt(row.month.toString()),
      monthName: new Date(parseInt(row.year.toString()), parseInt(row.month.toString()) - 1).toLocaleString('default', { month: 'long' }),
      photoCount: parseInt(row.photo_count.toString())
    }));

  } catch (error) {
    console.error('[Supabase] Error with SQL approach for all periods, using manual fallback:', error);

    // Manual fallback: fetch photos and group them in memory
    let query = supabaseServer
      .from('photo_metadata')
      .select('upload_date')
      .not('sharpness', 'is', null)
      .not('upload_date', 'is', null);

    if (sportFilter) {
      query = query.eq('sport_type', sportFilter);
    }

    if (categoryFilter) {
      query = query.eq('photo_category', categoryFilter);
    }

    const { data: allPhotos, error: photosError } = await query
      .order('upload_date', { ascending: false });

    if (photosError) {
      console.error('[Supabase] Fallback query also failed:', photosError);
      throw photosError;
    }

    // Group by year/month manually
    const periodMap = new Map<string, { year: number; month: number; count: number }>();
    allPhotos?.forEach((photo: any) => {
      const date = new Date(photo.upload_date);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const key = `${year}-${month}`;

      if (periodMap.has(key)) {
        periodMap.get(key)!.count++;
      } else {
        periodMap.set(key, { year, month, count: 1 });
      }
    });

    return Array.from(periodMap.values())
      .sort((a, b) => b.year - a.year || b.month - a.month)
      .map(period => ({
        year: period.year,
        month: period.month,
        monthName: new Date(period.year, period.month - 1).toLocaleString('default', { month: 'long' }),
        photoCount: period.count
      }));
  }
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
      .from('photo_metadata')
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
      query = query.order('emotional_impact', { ascending: false }).order('upload_date', { ascending: false });
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
      .from('photo_metadata')
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

  // 1. Try vector similarity search first
  const { data: similarMatches, error } = await supabaseServer.rpc('find_similar_photos', {
    query_image_key: imageKey,
    match_count: limit,
    match_threshold: 0.3
  });

  // If vector search succeeded and has results, use them
  if (!error && similarMatches && similarMatches.length > 0) {
    const keys = similarMatches.map((p: any) => p.image_key);

    const { data: photosData, error: photosError } = await supabaseServer
      .from('photo_metadata')
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
    .from('photo_metadata')
    .select('sport_type, emotion, play_type, photo_category, album_key')
    .eq('image_key', imageKey)
    .single();

  if (sourceError || !sourcePhoto) {
    console.error('[findSimilarPhotos] Could not find source photo for fallback:', sourceError);
    // Last resort: return recent high-quality photos
    return fetchPhotos({ limit, sortBy: 'quality' });
  }

  // Build fallback query - prioritize by matching attributes
  // Try: same sport + emotion first, then same sport, then same category
  let query = supabaseServer
    .from('photo_metadata')
    .select(PHOTO_COLUMNS)
    .neq('image_key', imageKey) // Exclude the source photo
    .not('sharpness', 'is', null);

  // Add filters based on available attributes (most specific to least)
  if (sourcePhoto.sport_type) {
    query = query.eq('sport_type', sourcePhoto.sport_type);
  }
  if (sourcePhoto.emotion) {
    query = query.eq('emotion', sourcePhoto.emotion);
  }

  const { data: fallbackPhotos, error: fallbackError } = await query
    .order('quality_score', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (!fallbackError && fallbackPhotos && fallbackPhotos.length > 0) {
    console.log(`[findSimilarPhotos] Attribute fallback found ${fallbackPhotos.length} similar photos in ${Date.now() - start}ms`);
    return fallbackPhotos.map(transformPhotoRow);
  }

  // 3. Ultimate fallback: If still no results, return high-quality photos from same sport
  console.log('[findSimilarPhotos] Emotion match failed, trying sport-only fallback');

  const { data: sportFallback } = await supabaseServer
    .from('photo_metadata')
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
 * Generate a vector embedding for a search query using Gemini embedding-001.
 * Returns null on any error (graceful degradation).
 */
async function embedSearchQuery(query: string): Promise<number[] | null> {
  const apiKey = import.meta.env.GOOGLE_API_KEY || import.meta.env.VITE_GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn('[embedSearchQuery] GOOGLE_API_KEY not configured — vector search unavailable');
    return null;
  }

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'embedding-001' });
    const result = await model.embedContent(query);
    return result.embedding.values;
  } catch (error) {
    console.error('[embedSearchQuery] Gemini API error:', error);
    return null;
  }
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
  if (pf.actionIntensity?.length) mergedFilters.actionIntensity = pf.actionIntensity;
  if (pf.lighting?.length) mergedFilters.lighting = pf.lighting;
  if (pf.colorTemperature?.length) mergedFilters.colorTemperature = pf.colorTemperature;
  if (pf.timeOfDay?.length) mergedFilters.timeOfDay = pf.timeOfDay;
  if (pf.compositions?.length) mergedFilters.compositions = pf.compositions;
  if (pf.emotion) mergedFilters.emotion = pf.emotion;
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
    .from('photo_metadata')
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
    .from('photo_metadata')
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
