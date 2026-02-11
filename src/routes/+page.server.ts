/**
 * Homepage Server Load Function
 * Fetches a random portfolio-worthy photo for the hero section with album diversity
 *
 * Hero Photo Selection Strategy:
 * - Fetch 500 high-quality volleyball photos with strict criteria from Supabase
 * - Group by album for diversity (max 10 per album)
 * - Random selection from balanced pool
 * - Images served via Cloudflare Worker proxy with WebP/AVIF conversion
 *
 * Quality Criteria:
 * - Technical quality (sharpness ≥ 8.0)
 * - Composition (composition_score ≥ 8.0)
 * - Emotional impact (emotional_impact ≥ 8.0)
 * - Hero-worthy categories (action, celebration, portrait)
 * - Volleyball photos ONLY (primary portfolio focus)
 * - Landscape orientation (aspect_ratio ≥ 1.0)
 * - Recent photos (last 2 years)
 */

import type { PageServerLoad } from './$types';
import { supabaseServer, transformPhotoRow } from '$lib/supabase/server';
import type { PhotoMetadataRow } from '$types/database';

// In-memory cache for hero photo candidates (avoids 500-row query per request)
const HERO_CACHE_DURATION_MS = 5 * 60 * 1000;
interface HeroCache {
  balancedPhotos: PhotoMetadataRow[];
  featuredAlbums: Awaited<ReturnType<typeof fetchFeaturedAlbums>>;
  timestamp: number;
}
let heroCache: HeroCache | null = null;

export const load: PageServerLoad = async () => {
  // No edge cache — hero photo is randomly selected per request from in-memory pool
  try {
    const now = Date.now();

    // Refresh cache if expired
    if (!heroCache || now - heroCache.timestamp > HERO_CACHE_DURATION_MS) {
      const [balancedPhotos, featuredAlbums] = await Promise.all([
        fetchHeroCandidates(),
        fetchFeaturedAlbums()
      ]);
      heroCache = { balancedPhotos, featuredAlbums, timestamp: now };
    }

    if (heroCache.balancedPhotos.length === 0) {
      return { heroPhoto: null, featuredAlbums: heroCache.featuredAlbums };
    }

    // Pick random photo from cached pool
    const randomIndex = Math.floor(Math.random() * heroCache.balancedPhotos.length);
    const row = heroCache.balancedPhotos[randomIndex];

    return { heroPhoto: transformPhotoRow(row), featuredAlbums: heroCache.featuredAlbums };
  } catch (err) {
    console.error('[Homepage] Critical error in load function:', err);
    return { heroPhoto: null, featuredAlbums: [] };
  }
};

/**
 * Fetch and prepare hero photo candidates with album diversity balancing.
 * Returns the balanced pool; caller picks randomly from it.
 */
async function fetchHeroCandidates(): Promise<PhotoMetadataRow[]> {
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  const { data, error } = await supabaseServer
    .from('photo_metadata')
    .select('*')
    .eq('sport_type', 'volleyball')
    .gte('aspect_ratio', 1.0)
    .gte('sharpness', 8.0)
    .gte('composition_score', 8.0)
    .gte('emotional_impact', 8.0)
    .gte('photo_date', twoYearsAgo.toISOString())
    .in('photo_category', ['action', 'celebration', 'portrait'])
    .not('sharpness', 'is', null)
    .order('photo_date', { ascending: false })
    .limit(500);

  if (error) {
    console.error('[Homepage] Error fetching hero candidates:', error);
    return [];
  }

  if (!data || data.length === 0) {
    // Fallback: Volleyball without strict quality filters
    const { data: fallbackData } = await supabaseServer
      .from('photo_metadata')
      .select('*')
      .eq('sport_type', 'volleyball')
      .not('sharpness', 'is', null)
      .limit(50);

    return fallbackData || [];
  }

  // Group by album and balance (max 10 per album)
  const albumGroups = new Map<string, PhotoMetadataRow[]>();
  for (const photo of data) {
    const albumKey = photo.album_name || photo.album_key || 'unknown';
    if (!albumGroups.has(albumKey)) {
      albumGroups.set(albumKey, []);
    }
    albumGroups.get(albumKey)!.push(photo);
  }

  const MAX_PER_ALBUM = 10;
  const balancedPhotos: PhotoMetadataRow[] = [];
  for (const [, photos] of albumGroups.entries()) {
    const sorted = photos.sort((a, b) => {
      const scoreA = (a.sharpness || 0) + (a.composition_score || 0) + (a.emotional_impact || 0);
      const scoreB = (b.sharpness || 0) + (b.composition_score || 0) + (b.emotional_impact || 0);
      return scoreB - scoreA;
    });
    balancedPhotos.push(...sorted.slice(0, MAX_PER_ALBUM));
  }

  return balancedPhotos;
}

/**
 * Fetch three featured albums for homepage display
 * - Most Recent: Latest real album by photo date
 * - Editor's Choice: Virtual album of emotionally compelling photos
 * - Action Showcase: Virtual album of high-intensity action shots
 */
async function fetchFeaturedAlbums() {
  try {
    // PERFORMANCE: Run all three queries in parallel to reduce TTFB
    const [albumsResult, editorsChoice, actionShowcase] = await Promise.all([
      // 1. Get the most recent real album
      supabaseServer
        .from('albums_summary')
        .select('*')
        .not('album_key', 'is', null)
        .not('latest_photo_date', 'is', null)
        .order('latest_photo_date', { ascending: false })
        .limit(1),
      // 2. Create "Editor's Choice" virtual album - emotionally compelling photos
      createEditorsChoiceAlbum(),
      // 3. Create "Action Showcase" virtual album - high-intensity action shots
      createActionShowcaseAlbum()
    ]);

    let mostRecentAlbum = null;
    if (!albumsResult.error && albumsResult.data && albumsResult.data.length > 0) {
      const album = albumsResult.data[0];
      mostRecentAlbum = {
        type: 'recent',
        title: 'Latest Event',
        album: {
          albumKey: album.album_key,
          albumName: album.album_name || 'Unknown Album',
          photoCount: parseInt(album.photo_count) || 0,
          coverImageUrl: album.cover_image_url,
          primarySport: album.primary_sport || 'volleyball',
          primaryCategory: album.primary_category || 'action',
          avgQualityScore: parseFloat(album.avg_quality_score) || 0,
          latestPhotoDate: album.latest_photo_date,
          isVirtual: false
        }
      };
    }

    // Build featured albums array
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
 * Create "Editor's Choice" virtual album
 * Features photos with high emotional impact and quality scores across different events
 */
async function createEditorsChoiceAlbum() {
  try {
    const { data, error } = await supabaseServer
      .from('photo_metadata')
      .select('*')
      .eq('sport_type', 'volleyball')
      .gte('emotional_impact', 8.0)  // High emotional impact
      .gte('sharpness', 8.0)         // Technically excellent
      .gte('composition_score', 8.0) // Well composed
      .in('photo_category', ['action', 'celebration', 'portrait'])
      .not('sharpness', 'is', null)
      .order('emotional_impact', { ascending: false })
      .limit(50); // Get top candidates

    if (error || !data || data.length === 0) {
      return null;
    }

    // Select diverse photos from different events/albums
    const selectedPhotos = [];
    const usedAlbums = new Set();

    for (const photo of data) {
      const albumKey = photo.album_name || photo.album_key || 'unknown';
      if (!usedAlbums.has(albumKey) && selectedPhotos.length < 12) {
        selectedPhotos.push(photo);
        usedAlbums.add(albumKey);
      }
    }

    if (selectedPhotos.length === 0) return null;

    // Use the highest emotional impact photo as cover
    const coverPhoto = selectedPhotos[0];

    // Calculate aggregate stats
    const avgQuality = selectedPhotos.reduce((sum, p) =>
      sum + ((p.sharpness || 0) + (p.composition_score || 0) + (p.emotional_impact || 0)) / 3, 0
    ) / selectedPhotos.length;

    return {
      type: 'editors-choice',
      title: 'Editor\'s Choice',
      album: {
        albumKey: 'editors-choice', // Virtual album key
        albumName: 'Editor\'s Choice',
        photoCount: selectedPhotos.length,
        coverImageUrl: coverPhoto.ThumbnailUrl || coverPhoto.ImageUrl,
        primarySport: 'volleyball',
        primaryCategory: 'mixed',
        avgQualityScore: Math.round(avgQuality * 10) / 10,
        latestPhotoDate: coverPhoto.photo_date || coverPhoto.upload_date,
        isVirtual: true
      }
    };
  } catch (err) {
    console.error('[Homepage] Error creating Editor\'s Choice album:', err);
    return null;
  }
}

/**
 * Create "Action Showcase" virtual album
 * Features high-intensity action shots from various tournaments
 */
async function createActionShowcaseAlbum() {
  try {
    const { data, error } = await supabaseServer
      .from('photo_metadata')
      .select('*')
      .eq('sport_type', 'volleyball')
      .eq('photo_category', 'action')
      .in('action_intensity', ['high', 'extreme'])
      .gte('sharpness', 7.5)
      .gte('emotional_impact', 7.0)
      .not('sharpness', 'is', null)
      .order('action_intensity', { ascending: false })
      .limit(50);

    if (error || !data || data.length === 0) {
      return null;
    }

    // Select diverse high-intensity shots
    const selectedPhotos = [];
    const usedAlbums = new Set();

    for (const photo of data) {
      const albumKey = photo.album_name || photo.album_key || 'unknown';
      if (!usedAlbums.has(albumKey) && selectedPhotos.length < 15) {
        selectedPhotos.push(photo);
        usedAlbums.add(albumKey);
      }
    }

    if (selectedPhotos.length === 0) return null;

    // Use the most intense action shot as cover
    const coverPhoto = selectedPhotos[0];

    // Calculate aggregate stats
    const avgQuality = selectedPhotos.reduce((sum, p) =>
      sum + ((p.sharpness || 0) + (p.composition_score || 0) + (p.emotional_impact || 0)) / 3, 0
    ) / selectedPhotos.length;

    return {
      type: 'action-showcase',
      title: 'Action Showcase',
      album: {
        albumKey: 'action-showcase', // Virtual album key
        albumName: 'Action Showcase',
        photoCount: selectedPhotos.length,
        coverImageUrl: coverPhoto.ThumbnailUrl || coverPhoto.ImageUrl,
        primarySport: 'volleyball',
        primaryCategory: 'action',
        avgQualityScore: Math.round(avgQuality * 10) / 10,
        latestPhotoDate: coverPhoto.photo_date || coverPhoto.upload_date,
        isVirtual: true
      }
    };
  } catch (err) {
    console.error('[Homepage] Error creating Action Showcase album:', err);
    return null;
  }
}
