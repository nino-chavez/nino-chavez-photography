#!/usr/bin/env node
/**
 * Build Optimized Images Script
 *
 * Downloads and optimizes images for all initial page loads across the site.
 * This eliminates SmugMug third-party cookies and improves LCP by:
 * 1. Fetching curated/featured images from the database
 * 2. Downloading optimized versions from SmugMug
 * 3. Converting to WebP format for better compression
 * 4. Saving to static/optimized/ for Vercel static hosting
 *
 * Categories:
 * - hero: Homepage hero images (20 images for rotation)
 * - albums: Album cover images (first 12 for above-fold)
 * - explore: Gallery grid images (first 8 for above-fold)
 * - timeline: Timeline featured photos (first 6)
 *
 * Run: npx tsx scripts/build-optimized-images.ts [category]
 * Examples:
 *   npx tsx scripts/build-optimized-images.ts          # Build all
 *   npx tsx scripts/build-optimized-images.ts hero     # Build hero only
 *   npx tsx scripts/build-optimized-images.ts albums   # Build albums only
 */

import { config } from 'dotenv';
import { resolve, join } from 'path';
import { mkdir, writeFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

config({ path: resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const OUTPUT_BASE_DIR = resolve(process.cwd(), 'static/optimized');
const WEBP_QUALITY = 85;

// Image size configurations per category
const SIZE_CONFIGS = {
  hero: {
    desktop: 1920,
    mobile: 1200,
    thumbnail: 100,
  },
  albums: {
    desktop: 800,  // Album cards are smaller
    mobile: 600,
    thumbnail: 80,
  },
  explore: {
    desktop: 800,  // Gallery cards
    mobile: 600,
    thumbnail: 80,
  },
  timeline: {
    desktop: 1200, // Featured timeline images
    mobile: 800,
    thumbnail: 100,
  },
  collections: {
    desktop: 1200, // Collection cards are larger/hero-style
    mobile: 800,
    thumbnail: 100,
  },
} as const;

// How many images to generate per category
const LIMITS = {
  hero: 20,
  albums: 24,       // Full first page (24 visible on albums page)
  explore: 24,      // Full first page (24 visible on explore page)
  timeline: 8,      // First 2 periods x 4 images
  collections: 9,   // All 9 collections (static page)
} as const;

type Category = keyof typeof SIZE_CONFIGS;

interface OptimizedImage {
  id: string;
  imageKey: string;
  albumKey?: string;
  albumName?: string;
  qualityScore?: number;
  priority: number;
  originalUrl: string;
  paths: {
    desktop: string;
    mobile: string;
    thumbnail: string;
  };
}

interface ImageManifest {
  version: number;
  generatedAt: string;
  category: Category;
  images: OptimizedImage[];
}

/**
 * Convert SmugMug URL to specified size
 */
function getSmugMugUrl(originalUrl: string, size: 'X3' | 'X2' | 'XL' | 'L' | 'M' | 'Th'): string {
  if (!originalUrl || !originalUrl.includes('smugmug.com')) return originalUrl;

  // Remove existing size suffix if present
  const baseUrl = originalUrl.replace(/-[A-Z]\d?\./, '.');

  // Add new size suffix
  return baseUrl.replace(/(\.[^.]+)$/, `-${size}$1`);
}

/**
 * Download image from URL with retry
 */
async function downloadImage(url: string, retries = 3): Promise<Buffer> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; OptimizedImageBuilder/1.0)',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return Buffer.from(await response.arrayBuffer());
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`    ⚠️  Retry ${attempt}/${retries}...`);
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error('Download failed');
}

/**
 * Process and save image in WebP format
 */
async function processImage(
  imageBuffer: Buffer,
  outputPath: string,
  width: number
): Promise<void> {
  await sharp(imageBuffer)
    .resize(width, null, { withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toFile(outputPath);
}

/**
 * Fetch hero images from database
 */
async function fetchHeroImages(): Promise<any[]> {
  // Try curated_hero_images first
  const { data: curatedImages, error } = await supabase
    .from('curated_hero_images')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: false })
    .limit(LIMITS.hero);

  if (!error && curatedImages?.length) {
    return curatedImages.map((img, idx) => ({
      id: `hero-${img.photo_id}`,
      imageKey: img.image_key,
      albumKey: img.album_key,
      albumName: img.album_name,
      qualityScore: img.quality_score,
      priority: LIMITS.hero - idx,
      originalUrl: img.original_url,
    }));
  }

  // Fallback to photo_metadata
  const { data: photos } = await supabase
    .from('photo_metadata')
    .select('photo_id, image_key, ImageUrl, album_key, album_name, sharpness, composition_score, emotional_impact')
    .eq('sport_type', 'volleyball')
    .gte('aspect_ratio', 1.0)
    .gte('sharpness', 8.5)
    .gte('composition_score', 8.5)
    .gte('emotional_impact', 8.5)
    .in('photo_category', ['action', 'celebration', 'portrait'])
    .order('sharpness', { ascending: false })
    .limit(LIMITS.hero);

  return (photos || []).map((img, idx) => ({
    id: `hero-${img.photo_id}`,
    imageKey: img.image_key,
    albumKey: img.album_key,
    albumName: img.album_name,
    qualityScore: ((img.sharpness || 0) + (img.composition_score || 0) + (img.emotional_impact || 0)) / 3,
    priority: LIMITS.hero - idx,
    originalUrl: img.ImageUrl,
  }));
}

/**
 * Fetch album cover images from database
 */
async function fetchAlbumImages(): Promise<any[]> {
  const { data: albums, error } = await supabase
    .from('albums_summary')
    .select('album_key, album_name, cover_image_url, photo_count, avg_quality_score')
    .not('album_key', 'is', null)
    .not('cover_image_url', 'is', null)
    .order('photo_count', { ascending: false })
    .limit(LIMITS.albums);

  if (error) {
    console.error('Error fetching albums:', error);
    return [];
  }

  return (albums || []).map((album, idx) => ({
    id: `album-${album.album_key}`,
    imageKey: album.album_key,
    albumKey: album.album_key,
    albumName: album.album_name,
    qualityScore: album.avg_quality_score,
    priority: LIMITS.albums - idx,
    originalUrl: album.cover_image_url,
  }));
}

/**
 * Fetch explore page images from database
 * IMPORTANT: Must use same sorting as fetchPhotos() in server.ts for 'quality' sort
 * to ensure optimized images match what's displayed
 */
async function fetchExploreImages(): Promise<any[]> {
  const { data: photos, error } = await supabase
    .from('photo_metadata')
    .select('photo_id, image_key, ImageUrl, album_key, album_name, sharpness, composition_score, emotional_impact, upload_date')
    .eq('sport_type', 'volleyball')
    .gte('sharpness', 7.5)
    .gte('composition_score', 7.5)
    .not('ImageUrl', 'is', null)
    .not('sharpness', 'is', null)
    // Must match fetchPhotos quality sort: emotional_impact DESC, upload_date DESC
    .order('emotional_impact', { ascending: false })
    .order('upload_date', { ascending: false })
    .limit(LIMITS.explore);

  if (error) {
    console.error('Error fetching explore photos:', error);
    return [];
  }

  return (photos || []).map((img, idx) => ({
    id: `explore-${img.photo_id}`,
    imageKey: img.image_key,
    albumKey: img.album_key,
    albumName: img.album_name,
    qualityScore: ((img.sharpness || 0) + (img.composition_score || 0) + (img.emotional_impact || 0)) / 3,
    priority: LIMITS.explore - idx,
    originalUrl: img.ImageUrl,
  }));
}

/**
 * Fetch timeline featured images from database
 */
async function fetchTimelineImages(): Promise<any[]> {
  // Get photos grouped by year/month for timeline
  const { data: photos, error } = await supabase
    .from('photo_metadata')
    .select('photo_id, image_key, ImageUrl, album_key, album_name, photo_date, sharpness, composition_score, emotional_impact')
    .eq('sport_type', 'volleyball')
    .gte('sharpness', 8.0)
    .not('ImageUrl', 'is', null)
    .not('photo_date', 'is', null)
    .order('photo_date', { ascending: false })
    .limit(100); // Get more to diversify by period

  if (error) {
    console.error('Error fetching timeline photos:', error);
    return [];
  }

  // Diversify by year/month
  const byPeriod = new Map<string, any>();
  for (const photo of photos || []) {
    const date = new Date(photo.photo_date);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (!byPeriod.has(key) && byPeriod.size < LIMITS.timeline) {
      byPeriod.set(key, photo);
    }
  }

  return Array.from(byPeriod.values()).map((img, idx) => ({
    id: `timeline-${img.photo_id}`,
    imageKey: img.image_key,
    albumKey: img.album_key,
    albumName: img.album_name,
    qualityScore: ((img.sharpness || 0) + (img.composition_score || 0) + (img.emotional_impact || 0)) / 3,
    priority: LIMITS.timeline - idx,
    originalUrl: img.ImageUrl,
  }));
}

/**
 * Collection definitions - these are curated collections with specific filters
 * IMPORTANT: Must match the filters used in src/routes/collections/+page.server.ts
 * Each collection needs a cover photo from photos matching its criteria
 */
const COLLECTIONS = [
  { slug: 'portfolio-excellence', name: 'Portfolio Excellence', filter: { sharpness: 9, composition_score: 9, emotional_impact: 9 } },
  { slug: 'comeback-stories', name: 'Comeback Stories', filter: { emotion: 'triumph', time_in_game: 'final_5_min', emotional_impact: 7, sharpness: 7 } },
  { slug: 'peak-intensity', name: 'Peak Intensity', filter: { action_intensity: 'peak', emotional_impact: 8, sharpness: 7 } },
  { slug: 'golden-hour-magic', name: 'Golden Hour Magic', filter: { time_of_day: 'golden_hour', composition_score: 7, sharpness: 7 } },
  { slug: 'focus-and-determination', name: 'Focus & Determination', filter: { emotion: 'determination', sharpness: 8, composition_score: 7 } },
  { slug: 'victory-celebrations', name: 'Victory Celebrations', filter: { photo_category: 'celebration', emotional_impact: 7, sharpness: 7 } },
  { slug: 'aerial-artistry', name: 'Aerial Artistry', filter: { play_types: ['attack', 'block'], sharpness: 8, composition_score: 8 } },
  { slug: 'defensive-masterclass', name: 'Defensive Masterclass', filter: { play_types: ['dig', 'block'], sharpness: 7, emotional_impact: 7 } },
  { slug: 'sunset-sessions', name: 'Sunset Sessions', filter: { time_of_day: 'evening', composition_score: 8, emotional_impact: 8, sharpness: 7 } },
];

/**
 * Fetch collection cover images from database
 */
async function fetchCollectionImages(): Promise<any[]> {
  const results: any[] = [];

  for (const collection of COLLECTIONS) {
    // Build query based on collection filters
    let query = supabase
      .from('photo_metadata')
      .select('photo_id, image_key, ImageUrl, album_key, album_name, sharpness, composition_score, emotional_impact')
      .eq('sport_type', 'volleyball')
      .not('ImageUrl', 'is', null)
      .not('sharpness', 'is', null);

    // Apply collection-specific filters
    const filter = collection.filter as Record<string, any>;
    if (filter.sharpness) query = query.gte('sharpness', filter.sharpness);
    if (filter.composition_score) query = query.gte('composition_score', filter.composition_score);
    if (filter.emotional_impact) query = query.gte('emotional_impact', filter.emotional_impact);
    if (filter.emotion) query = query.eq('emotion', filter.emotion);
    if (filter.action_intensity) query = query.eq('action_intensity', filter.action_intensity);
    if (filter.time_of_day) query = query.eq('time_of_day', filter.time_of_day);
    if (filter.time_in_game) query = query.eq('time_in_game', filter.time_in_game);
    if (filter.photo_category) query = query.eq('photo_category', filter.photo_category);
    if (filter.play_types) query = query.in('play_type', filter.play_types);

    // Get best photo for this collection
    const { data: photos, error } = await query
      .order('sharpness', { ascending: false })
      .limit(1);

    if (error || !photos?.length) {
      console.log(`   ⚠️  No photos found for collection: ${collection.name}`);
      continue;
    }

    const photo = photos[0];
    results.push({
      id: `collection-${collection.slug}`,
      imageKey: collection.slug,
      collectionSlug: collection.slug,
      collectionName: collection.name,
      qualityScore: ((photo.sharpness || 0) + (photo.composition_score || 0) + (photo.emotional_impact || 0)) / 3,
      priority: COLLECTIONS.length - results.length,
      originalUrl: photo.ImageUrl,
    });
  }

  return results;
}

/**
 * Process images for a category
 */
async function processCategory(category: Category): Promise<ImageManifest> {
  console.log(`\n📦 Building ${category} images...`);

  const outputDir = join(OUTPUT_BASE_DIR, category);
  const manifestPath = join(outputDir, 'manifest.json');
  const sizes = SIZE_CONFIGS[category];

  // Ensure output directory exists (clean rebuild)
  if (existsSync(outputDir)) {
    await rm(outputDir, { recursive: true });
  }
  await mkdir(outputDir, { recursive: true });

  // Fetch images for this category
  let images: any[];
  switch (category) {
    case 'hero':
      images = await fetchHeroImages();
      break;
    case 'albums':
      images = await fetchAlbumImages();
      break;
    case 'explore':
      images = await fetchExploreImages();
      break;
    case 'timeline':
      images = await fetchTimelineImages();
      break;
    case 'collections':
      images = await fetchCollectionImages();
      break;
    default:
      images = [];
  }

  console.log(`   Found ${images.length} images to process`);

  const manifest: ImageManifest = {
    version: Date.now(),
    generatedAt: new Date().toISOString(),
    category,
    images: [],
  };

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const paddedIndex = String(i + 1).padStart(3, '0');
    const baseFilename = `${category}-${paddedIndex}`;

    console.log(`   [${i + 1}/${images.length}] ${img.imageKey || img.albumKey}...`);

    try {
      // Download the high-res version
      const sourceUrl = getSmugMugUrl(img.originalUrl, category === 'hero' ? 'X3' : 'X2');
      if (!sourceUrl) {
        console.log(`     ⚠️  No URL, skipping`);
        continue;
      }

      const imageBuffer = await downloadImage(sourceUrl);

      // Define output paths (include /photography base path for production)
      const basePath = '/photography';
      const paths = {
        desktop: `${basePath}/optimized/${category}/${baseFilename}-desktop.webp`,
        mobile: `${basePath}/optimized/${category}/${baseFilename}-mobile.webp`,
        thumbnail: `${basePath}/optimized/${category}/${baseFilename}-thumb.webp`,
      };

      // Process all sizes
      await processImage(imageBuffer, join(outputDir, `${baseFilename}-desktop.webp`), sizes.desktop);
      await processImage(imageBuffer, join(outputDir, `${baseFilename}-mobile.webp`), sizes.mobile);
      await processImage(imageBuffer, join(outputDir, `${baseFilename}-thumb.webp`), sizes.thumbnail);

      // Add to manifest
      manifest.images.push({
        id: img.id,
        imageKey: img.imageKey,
        albumKey: img.albumKey,
        albumName: img.albumName,
        qualityScore: img.qualityScore,
        priority: img.priority,
        originalUrl: img.originalUrl,
        paths,
      });

      console.log(`     ✅ Done`);
    } catch (err) {
      console.error(`     ❌ Failed:`, err instanceof Error ? err.message : err);
    }
  }

  // Write manifest
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`   📋 Manifest: ${manifestPath}`);

  return manifest;
}

/**
 * Also update the legacy hero-images location for backwards compatibility
 */
async function updateLegacyHeroImages(heroManifest: ImageManifest): Promise<void> {
  const legacyDir = resolve(process.cwd(), 'static/hero-images');

  if (!existsSync(legacyDir)) {
    await mkdir(legacyDir, { recursive: true });
  }

  // Transform manifest to legacy format
  const legacyManifest = {
    version: heroManifest.version,
    generatedAt: heroManifest.generatedAt,
    images: heroManifest.images.map((img, idx) => ({
      id: idx + 1,
      photoId: img.imageKey,
      imageKey: img.imageKey,
      albumKey: img.albumKey || '',
      albumName: img.albumName || '',
      qualityScore: img.qualityScore || 0,
      priority: img.priority,
      paths: {
        desktop: img.paths.desktop.replace('/optimized/hero/', '/hero-images/').replace('hero-', 'hero-'),
        mobile: img.paths.mobile.replace('/optimized/hero/', '/hero-images/').replace('hero-', 'hero-'),
        thumbnail: img.paths.thumbnail.replace('/optimized/hero/', '/hero-images/').replace('hero-', 'hero-'),
      },
    })),
  };

  // Copy files to legacy location
  const { copyFile } = await import('fs/promises');
  for (let i = 0; i < heroManifest.images.length; i++) {
    const paddedIndex = String(i + 1).padStart(3, '0');
    const srcBase = join(OUTPUT_BASE_DIR, 'hero', `hero-${paddedIndex}`);
    const dstBase = join(legacyDir, `hero-${paddedIndex}`);

    try {
      await copyFile(`${srcBase}-desktop.webp`, `${dstBase}-desktop.webp`);
      await copyFile(`${srcBase}-mobile.webp`, `${dstBase}-mobile.webp`);
      await copyFile(`${srcBase}-thumb.webp`, `${dstBase}-thumb.webp`);
    } catch {
      // Ignore copy errors
    }
  }

  // Write legacy manifest
  await writeFile(join(legacyDir, 'manifest.json'), JSON.stringify(legacyManifest, null, 2));
  console.log(`\n📋 Legacy hero manifest updated: static/hero-images/manifest.json`);
}

/**
 * Main build function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const requestedCategory = args[0] as Category | undefined;

  console.log('🖼️  Optimized Images Builder');
  console.log('═'.repeat(50));

  // Ensure base output directory exists
  if (!existsSync(OUTPUT_BASE_DIR)) {
    await mkdir(OUTPUT_BASE_DIR, { recursive: true });
  }

  const categories: Category[] = requestedCategory
    ? [requestedCategory]
    : ['hero', 'albums', 'explore', 'timeline', 'collections'];

  const results: Record<string, number> = {};

  for (const category of categories) {
    if (!SIZE_CONFIGS[category]) {
      console.error(`❌ Unknown category: ${category}`);
      continue;
    }

    const manifest = await processCategory(category);
    results[category] = manifest.images.length;

    // Update legacy hero-images for backwards compatibility
    if (category === 'hero') {
      await updateLegacyHeroImages(manifest);
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log('✨ Build Complete!');
  console.log('═'.repeat(50));
  for (const [cat, count] of Object.entries(results)) {
    console.log(`   ${cat}: ${count} images`);
  }
  console.log(`\n📁 Output: ${OUTPUT_BASE_DIR}`);
  console.log('📦 Ready for Vercel static hosting');
}

// Run the script
main().catch((err) => {
  console.error('\n❌ Build failed:', err);
  process.exit(1);
});
