/**
 * Homepage Server Load Function
 * Fetches a random portfolio-worthy photo for the hero section with album diversity
 *
 * Hero Photo Selection Strategy:
 * 1. Fetch 500 high-quality volleyball photos with relaxed criteria to ensure variety
 * 2. Group photos by album_name/album_key
 * 3. From each album, select top 10 photos by quality score (sharpness + composition + impact)
 * 4. Pick random photo from this balanced pool (max 10 photos per album)
 *
 * Quality Criteria:
 * - Technical quality (sharpness ≥ 7.5)
 * - Composition (composition_score ≥ 7.5)
 * - Emotional impact (emotional_impact ≥ 7.0)
 * - Hero-worthy categories (action, celebration, portrait)
 * - Volleyball photos ONLY (primary portfolio focus)
 *
 * This approach prevents the hero from being dominated by a single recent album
 * (e.g., VLA BREEZE - Fall 2025 with 213 photos) while maintaining high quality standards.
 * Typical result: 70+ photos from 7+ different albums in the selection pool.
 */

import type { PageServerLoad } from './$types';
import { supabaseServer, transformPhotoRow } from '$lib/supabase/server';
import type { PhotoMetadataRow } from '$types/database';

export const load: PageServerLoad = async () => {
  try {
    // Fetch high-quality volleyball photos for hero display with album diversity
    // Strategy: Get MORE photos than needed, then distribute across albums
    // Schema v2: All photos are worthy, use internal quality metrics for selection
    //
    // HERO SELECTION CRITERIA (Premium Quality):
    // - Landscape/square orientation (aspect_ratio >= 1.0) - fills 16:9 hero section
    // - Excellent technical quality (8.0+ scores) - hero-worthy images only
    // - Recent photos (last 2 years) - fresh, current content
    // - Volleyball action only - portfolio focus

    // Calculate date 2 years ago
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const twoYearsAgoISO = twoYearsAgo.toISOString();

    const { data, error } = await supabaseServer
      .from('photo_metadata')
      .select('*')
      .eq('sport_type', 'volleyball')         // Volleyball photos only
      .gte('aspect_ratio', 1.0)               // 🎯 Landscape/Square only (width >= height)
      .gte('sharpness', 8.0)                  // ⭐ Excellent sharpness (raised from 7.5)
      .gte('composition_score', 8.0)          // ⭐ Excellent composition (raised from 7.5)
      .gte('emotional_impact', 8.0)           // ⭐ Strong emotional impact (raised from 7.0)
      .gte('photo_date', twoYearsAgoISO)      // 📅 Last 2 years (fresh content)
      .in('photo_category', ['action', 'celebration', 'portrait'])  // Hero-worthy categories
      .not('sharpness', 'is', null)
      .order('photo_date', { ascending: false })  // Most recent first
      .limit(500); // Fetch many candidates to ensure album diversity

    if (error) {
      console.error('[Homepage] Error fetching hero photo:', error);
      return { heroPhoto: null, featuredAlbums: [] };
    }

    // Debug: Log query results to verify filtering
    console.log(`[Homepage] Hero query returned ${data?.length || 0} photos`);

    // Debug: Check if any non-volleyball photos snuck through
    const sportTypes = new Set(data?.map(p => p.sport_type) || []);
    console.log('[Homepage] Sports in hero pool:', Array.from(sportTypes).join(', '));

    if (sportTypes.size > 1 || (sportTypes.size === 1 && !sportTypes.has('volleyball'))) {
      console.warn('⚠️ [Homepage] NON-VOLLEYBALL photos found in hero pool!', {
        sports: Array.from(sportTypes),
        samplePhotos: data?.slice(0, 5).map(p => ({
          image_key: p.image_key,
          sport: p.sport_type,
          album: p.album_name
        }))
      });
    }

    if (!data || data.length === 0) {
      console.warn('[Homepage] No high-quality volleyball photos found, using fallback strategies');

      // Fallback 1: Volleyball without strict quality filters
      const { data: fallbackData, error: fallbackError } = await supabaseServer
        .from('photo_metadata')
        .select('*')
        .eq('sport_type', 'volleyball')
        .not('sharpness', 'is', null)
        .limit(50);

      if (fallbackData && fallbackData.length > 0) {
        const randomIndex = Math.floor(Math.random() * fallbackData.length);
        const row = fallbackData[randomIndex];
        return { heroPhoto: transformPhotoRow(row), featuredAlbums: [] };
      }

      // Fallback 2: Any photo (multi-sport)
      console.warn('[Homepage] No volleyball photos available, using any photo');
      const { data: anyPhotoData, error: anyPhotoError } = await supabaseServer
        .from('photo_metadata')
        .select('*')
        .not('sharpness', 'is', null)
        .limit(50);

      if (anyPhotoError || !anyPhotoData || anyPhotoData.length === 0) {
        console.error('[Homepage] No photos available at all');
        return { heroPhoto: null, featuredAlbums: [] };
      }

      const randomIndex = Math.floor(Math.random() * anyPhotoData.length);
      const row = anyPhotoData[randomIndex];
      return { heroPhoto: transformPhotoRow(row), featuredAlbums: [] };
    }

    // Group photos by album to ensure diversity
    const albumGroups = new Map<string, PhotoMetadataRow[]>();
    for (const photo of data) {
      const albumKey = photo.album_name || photo.album_key || 'unknown';
      if (!albumGroups.has(albumKey)) {
        albumGroups.set(albumKey, []);
      }
      albumGroups.get(albumKey)!.push(photo);
    }

    // Limit to max 10 photos per album to force diversity
    const MAX_PER_ALBUM = 10;
    const balancedPhotos: PhotoMetadataRow[] = [];

    for (const [albumName, photos] of albumGroups.entries()) {
      // Sort by quality (sum of scores) and take top photos from each album
      const sorted = photos.sort((a, b) => {
        const scoreA = (a.sharpness || 0) + (a.composition_score || 0) + (a.emotional_impact || 0);
        const scoreB = (b.sharpness || 0) + (b.composition_score || 0) + (b.emotional_impact || 0);
        return scoreB - scoreA;
      });

      // Take up to MAX_PER_ALBUM photos from this album
      balancedPhotos.push(...sorted.slice(0, MAX_PER_ALBUM));
    }

    // Pick random photo from the balanced set
    const randomIndex = Math.floor(Math.random() * balancedPhotos.length);
    const row = balancedPhotos[randomIndex];

    // Debug: Log the selected hero photo
    console.log('[Homepage] Selected hero photo:', {
      image_key: row.image_key,
      sport_type: row.sport_type,
      album: row.album_name,
      aspect_ratio: row.aspect_ratio,
      quality_scores: {
        sharpness: row.sharpness,
        composition: row.composition_score,
        impact: row.emotional_impact
      }
    });

    // Fetch three featured albums for homepage
    const featuredAlbums = await fetchFeaturedAlbums();

    return { heroPhoto: transformPhotoRow(row), featuredAlbums };
  } catch (err) {
    console.error('[Homepage] Critical error in load function:', err);
    return { heroPhoto: null, featuredAlbums: [] };
  }
};

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
      console.warn('[Homepage] No photos found for Editor\'s Choice album');
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
      console.warn('[Homepage] No photos found for Action Showcase album');
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
