/**
 * Homepage Server Load Function
 * Fetches hero photo candidates and featured albums for the homepage.
 */

import type { PageServerLoad } from './$types';
import { PHOTOS_READ } from '$lib/supabase/columns';
import { supabaseServer, matviewClient, transformPhotoRow, PHOTO_COLUMNS, getProgramFacets } from '$lib/supabase/server';
import { cfImageUrl } from '$lib/utils/cloudflare-images';
import { topPhotoCoverMap } from '$lib/analytics/covers';
import { getTopPhotos } from '$lib/analytics/popularity';
import type { Photo } from '$types/photo';

// In-memory cache for hero photo candidates
const HERO_CACHE_DURATION_MS = 5 * 60 * 1000;
interface HeroCache {
  balancedPhotos: Record<string, unknown>[];
  featuredAlbums: Awaited<ReturnType<typeof fetchFeaturedAlbums>>;
  recentAlbums: Awaited<ReturnType<typeof fetchRecentAlbums>>;
  programs: Awaited<ReturnType<typeof getProgramFacets>>;
  trendingPhotos: Photo[];
  fanFavorites: Photo[];
  timestamp: number;
}
let heroCache: HeroCache | null = null;

const HERO_CANDIDATES_COUNT = 8;

export const load: PageServerLoad = async ({ setHeaders }) => {
  setHeaders({ 'cache-control': 's-maxage=300, stale-while-revalidate=600' });

  try {
    const now = Date.now();

    if (!heroCache || now - heroCache.timestamp > HERO_CACHE_DURATION_MS) {
      const [balancedPhotos, featuredAlbums, recentAlbums, programs, trendingPhotos, fanFavorites] = await Promise.all([
        fetchHeroCandidates(),
        fetchFeaturedAlbums(),
        fetchRecentAlbums(),
        getProgramFacets(),
        getTopPhotos(supabaseServer, { metric: 'trending', limit: 12 }),
        getTopPhotos(supabaseServer, { metric: 'all_time', limit: 12 })
      ]);
      heroCache = { balancedPhotos, featuredAlbums, recentAlbums, programs, trendingPhotos, fanFavorites, timestamp: now };
    }

    const pool = heroCache.balancedPhotos;
    if (pool.length === 0) {
      return { heroCandidates: [], featuredAlbums: heroCache.featuredAlbums, recentAlbums: heroCache.recentAlbums, programs: heroCache.programs, trendingPhotos: heroCache.trendingPhotos, fanFavorites: heroCache.fanFavorites, staticHeroIndex: 0 };
    }
    const pinIdx = Math.floor(Date.now() / 3_600_000) % pool.length;
    const pinned = pool[pinIdx];
    const rest = pickRandom(
      pool.filter((_, i) => i !== pinIdx),
      HERO_CANDIDATES_COUNT - 1
    );
    const heroCandidates = [pinned, ...rest].map(transformPhotoRow);

    return { heroCandidates, featuredAlbums: heroCache.featuredAlbums, recentAlbums: heroCache.recentAlbums, programs: heroCache.programs, trendingPhotos: heroCache.trendingPhotos, fanFavorites: heroCache.fanFavorites, staticHeroIndex: 0 };
  } catch (err) {
    console.error('[Homepage] Critical error in load function:', err);
    return { heroCandidates: [], featuredAlbums: [], recentAlbums: [], programs: [] };
  }
};

function pickRandom<T>(arr: T[], count: number): T[] {
  if (arr.length <= count) return [...arr];
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

/**
 * Fetch hero candidates: high-quality volleyball landscape photos.
 * Uses explicit column list to avoid fetching the embedding vector column.
 */
async function fetchHeroCandidates(): Promise<Record<string, unknown>[]> {
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  const { data, error } = await supabaseServer
    .from(PHOTOS_READ)
    .select(PHOTO_COLUMNS)
    .eq('sport_type', 'volleyball')
    .gte('aspect_ratio', 1.0)
    .gte('sharpness', 8.0)
    .gte('composition_score', 8.0)
    .gte('emotional_impact', 8.0)
    .gte('photo_date', twoYearsAgo.toISOString())
    .in('photo_category', ['action', 'celebration', 'portrait'])
    .not('sharpness', 'is', null)
    .order('photo_date', { ascending: false })
    .limit(30);

  if (error) {
    console.error('[Homepage] Error fetching hero candidates:', error);
    return [];
  }

  if (!data || data.length === 0) {
    const { data: fallbackData } = await supabaseServer
      .from(PHOTOS_READ)
      .select(PHOTO_COLUMNS)
      .eq('sport_type', 'volleyball')
      .not('sharpness', 'is', null)
      .order('photo_date', { ascending: false })
      .limit(30);

    return fallbackData || [];
  }

  // Group by album and balance (max 5 per album)
  const albumGroups = new Map<string, Record<string, unknown>[]>();
  for (const photo of data) {
    const albumKey = (photo.album_name || photo.album_key || 'unknown') as string;
    if (!albumGroups.has(albumKey)) {
      albumGroups.set(albumKey, []);
    }
    albumGroups.get(albumKey)!.push(photo);
  }

  const MAX_PER_ALBUM = 5;
  const balancedPhotos: Record<string, unknown>[] = [];
  for (const [, photos] of albumGroups.entries()) {
    const sorted = photos.sort((a, b) => {
      const scoreA = ((a.sharpness as number) || 0) + ((a.composition_score as number) || 0) + ((a.emotional_impact as number) || 0);
      const scoreB = ((b.sharpness as number) || 0) + ((b.composition_score as number) || 0) + ((b.emotional_impact as number) || 0);
      return scoreB - scoreA;
    });
    balancedPhotos.push(...sorted.slice(0, MAX_PER_ALBUM));
  }

  return balancedPhotos;
}

/**
 * Fetch three featured albums for homepage display
 */
async function fetchFeaturedAlbums() {
  try {
    // Exclude unlisted albums: the detail route (/albums/[slug]) 404s them ("must use share link"),
    // so featuring one here produces a dead "Latest Event" card. Mirror the /albums listing's filter.
    const { data: unlisted } = await supabaseServer
      .from('album_settings')
      .select('album_key')
      .eq('visibility', 'unlisted');
    const unlistedKeys = (unlisted ?? []).map((a) => a.album_key);

    // albums_summary is a MATERIALIZED VIEW (anon REVOKE'd, grant flaky) → read via service_role.
    // The unlisted exclusion below is the privacy gate; album_settings is read on anon separately.
    let recentQuery = matviewClient()
      .from('albums_summary')
      .select('*')
      .not('album_key', 'is', null)
      .not('latest_photo_date', 'is', null)
      .order('latest_photo_date', { ascending: false })
      .limit(1);
    if (unlistedKeys.length) {
      recentQuery = recentQuery.not('album_key', 'in', `(${unlistedKeys.map((k) => `"${k}"`).join(',')})`);
    }

    const [albumsResult, editorsChoice, actionShowcase] = await Promise.all([
      recentQuery,
      createEditorsChoiceAlbum(),
      createActionShowcaseAlbum()
    ]);

    let mostRecentAlbum = null;
    if (!albumsResult.error && albumsResult.data && albumsResult.data.length > 0) {
      const album = albumsResult.data[0];
      // Auto-cover: prefer the album's top-engaged photo, else its existing cover.
      const coverMap = await topPhotoCoverMap([album.album_key]);
      const coverCfId = coverMap.get(album.album_key) ?? album.cover_cf_image_id;
      mostRecentAlbum = {
        type: 'recent',
        title: 'Latest Event',
        album: {
          albumKey: album.album_key,
          albumName: album.album_name || 'Unknown Album',
          photoCount: parseInt(album.photo_count) || 0,
          coverImageUrl: coverCfId
            ? cfImageUrl(coverCfId, 'medium')
            : album.cover_image_url,
          primarySport: album.primary_sport || 'volleyball',
          primaryCategory: album.primary_category || 'action',
          avgQualityScore: parseFloat(album.avg_quality_score) || 0,
          latestPhotoDate: album.latest_photo_date,
          isVirtual: false
        }
      };
    }

    const featuredAlbums = [];
    if (mostRecentAlbum) featuredAlbums.push(mostRecentAlbum);
    if (editorsChoice) featuredAlbums.push(editorsChoice);
    if (actionShowcase) featuredAlbums.push(actionShowcase);

    return featuredAlbums;
  } catch (err) {
    console.error('[Homepage] Error fetching featured albums:', err);
    return [];
  }
}

/**
 * Recent events for the homepage above-the-fold row — real galleries, newest first.
 * Mirrors fetchFeaturedAlbums' unlisted exclusion (the detail route 404s unlisted albums).
 * Returns event name + date + photo count + cover; the page formats date/count for display.
 */
async function fetchRecentAlbums(limit = 6) {
  try {
    const { data: unlisted } = await supabaseServer
      .from('album_settings')
      .select('album_key')
      .eq('visibility', 'unlisted');
    const unlistedKeys = (unlisted ?? []).map((a) => a.album_key);

    // albums_summary is a MATERIALIZED VIEW (anon REVOKE'd, grant flaky) → read via service_role.
    // Reading it on the anon supabaseServer silently returned nothing, emptying the "Recent events"
    // row. album_settings (unlisted) is read on anon above; the .not.in below is the privacy gate.
    let query = matviewClient()
      .from('albums_summary')
      .select('album_key, album_name, photo_count, cover_cf_image_id, cover_image_url, primary_sport, primary_category, latest_photo_date')
      .not('album_key', 'is', null)
      .not('latest_photo_date', 'is', null)
      .order('latest_photo_date', { ascending: false })
      .limit(limit);
    if (unlistedKeys.length) {
      query = query.not('album_key', 'in', `(${unlistedKeys.map((k) => `"${k}"`).join(',')})`);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((album) => ({
      albumKey: album.album_key as string,
      albumName: (album.album_name as string) || 'Untitled Event',
      photoCount: parseInt(album.photo_count as string) || 0,
      coverImageUrl: album.cover_cf_image_id
        ? cfImageUrl(album.cover_cf_image_id as string, 'medium')
        : (album.cover_image_url as string | null),
      primarySport: (album.primary_sport as string) || 'volleyball',
      primaryCategory: (album.primary_category as string) || 'action',
      latestPhotoDate: album.latest_photo_date as string | null
    }));
  } catch (err) {
    console.error('[Homepage] Error fetching recent albums:', err);
    return [];
  }
}

async function createEditorsChoiceAlbum() {
  try {
    const { data, error } = await supabaseServer
      .from(PHOTOS_READ)
      .select(PHOTO_COLUMNS)
      .eq('sport_type', 'volleyball')
      .gte('emotional_impact', 8.0)
      .gte('sharpness', 8.0)
      .gte('composition_score', 8.0)
      .in('photo_category', ['action', 'celebration', 'portrait'])
      .not('sharpness', 'is', null)
      .order('emotional_impact', { ascending: false })
      .limit(50);

    if (error || !data || data.length === 0) return null;

    const selectedPhotos: Record<string, unknown>[] = [];
    const usedAlbums = new Set();

    for (const photo of data) {
      const albumKey = (photo.album_name || photo.album_key || 'unknown') as string;
      if (!usedAlbums.has(albumKey) && selectedPhotos.length < 12) {
        selectedPhotos.push(photo);
        usedAlbums.add(albumKey);
      }
    }

    if (selectedPhotos.length === 0) return null;

    const coverPhoto = selectedPhotos[0];
    const avgQuality = selectedPhotos.reduce((sum, p) =>
      sum + (((p.sharpness as number) || 0) + ((p.composition_score as number) || 0) + ((p.emotional_impact as number) || 0)) / 3, 0
    ) / selectedPhotos.length;

    return {
      type: 'editors-choice',
      title: 'Editor\'s Choice',
      album: {
        albumKey: 'editors-choice',
        albumName: 'Editor\'s Choice',
        photoCount: selectedPhotos.length,
        coverImageUrl: coverPhoto.cf_image_id ? cfImageUrl(coverPhoto.cf_image_id as string, 'medium') : null,
        primarySport: 'volleyball',
        primaryCategory: 'mixed',
        avgQualityScore: Math.round(avgQuality * 10) / 10,
        latestPhotoDate: (coverPhoto.photo_date || coverPhoto.upload_date) as string,
        isVirtual: true
      }
    };
  } catch (err) {
    console.error('[Homepage] Error creating Editor\'s Choice album:', err);
    return null;
  }
}

async function createActionShowcaseAlbum() {
  try {
    const { data, error } = await supabaseServer
      .from(PHOTOS_READ)
      .select(PHOTO_COLUMNS)
      .eq('sport_type', 'volleyball')
      .eq('photo_category', 'action')
      // action_intensity (vanity column) was dropped; the sharpness/emotional gates below already
      // select intense, high-quality action, and we rank by the quality_score blend.
      .gte('sharpness', 7.5)
      .gte('emotional_impact', 7.0)
      .not('sharpness', 'is', null)
      .order('quality_score', { ascending: false, nullsFirst: false })
      .limit(50);

    if (error || !data || data.length === 0) return null;

    const selectedPhotos: Record<string, unknown>[] = [];
    const usedAlbums = new Set();

    for (const photo of data) {
      const albumKey = (photo.album_name || photo.album_key || 'unknown') as string;
      if (!usedAlbums.has(albumKey) && selectedPhotos.length < 15) {
        selectedPhotos.push(photo);
        usedAlbums.add(albumKey);
      }
    }

    if (selectedPhotos.length === 0) return null;

    const coverPhoto = selectedPhotos[0];
    const avgQuality = selectedPhotos.reduce((sum, p) =>
      sum + (((p.sharpness as number) || 0) + ((p.composition_score as number) || 0) + ((p.emotional_impact as number) || 0)) / 3, 0
    ) / selectedPhotos.length;

    return {
      type: 'action-showcase',
      title: 'Action Showcase',
      album: {
        albumKey: 'action-showcase',
        albumName: 'Action Showcase',
        photoCount: selectedPhotos.length,
        coverImageUrl: coverPhoto.cf_image_id ? cfImageUrl(coverPhoto.cf_image_id as string, 'medium') : null,
        primarySport: 'volleyball',
        primaryCategory: 'action',
        avgQualityScore: Math.round(avgQuality * 10) / 10,
        latestPhotoDate: (coverPhoto.photo_date || coverPhoto.upload_date) as string,
        isVirtual: true
      }
    };
  } catch (err) {
    console.error('[Homepage] Error creating Action Showcase album:', err);
    return null;
  }
}
