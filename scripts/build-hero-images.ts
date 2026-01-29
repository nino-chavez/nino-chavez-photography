#!/usr/bin/env node
/**
 * Build Hero Images Script
 *
 * Downloads and optimizes curated hero images for local static hosting.
 * This eliminates SmugMug third-party cookies and improves LCP by:
 * 1. Fetching curated images from the database
 * 2. Downloading optimized versions from SmugMug
 * 3. Converting to WebP format for better compression
 * 4. Saving to static/hero-images/ for Vercel static hosting
 *
 * Run during build: npm run build:hero-images
 * Or manually: npx tsx scripts/build-hero-images.ts
 */

import { config } from 'dotenv';
import { resolve, join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

config({ path: resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const HERO_IMAGES_DIR = resolve(process.cwd(), 'static/hero-images');
const MANIFEST_PATH = resolve(HERO_IMAGES_DIR, 'manifest.json');

// Image optimization settings
const DESKTOP_WIDTH = 1920;
const MOBILE_WIDTH = 1200;
const THUMBNAIL_WIDTH = 100;
const WEBP_QUALITY = 85;

interface HeroImageManifest {
  version: number;
  generatedAt: string;
  images: HeroImage[];
}

interface HeroImage {
  id: number;
  photoId: string;
  imageKey: string;
  albumKey: string;
  albumName: string;
  qualityScore: number;
  priority: number;
  paths: {
    desktop: string;
    mobile: string;
    thumbnail: string;
  };
}

/**
 * Convert SmugMug URL to specified size
 */
function getSmugMugUrl(originalUrl: string, size: 'X3' | 'X2' | 'L' | 'Th'): string {
  if (!originalUrl.includes('smugmug.com')) return originalUrl;

  // Remove existing size suffix if present
  const baseUrl = originalUrl.replace(/-[A-Z]\d?\./, '.');

  // Add new size suffix
  return baseUrl.replace(/(\.[^.]+)$/, `-${size}$1`);
}

/**
 * Download image from URL
 */
async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; HeroImageBuilder/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
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
 * Main build function
 */
async function buildHeroImages(): Promise<void> {
  console.log('🖼️  Building hero images...\n');

  // Ensure output directory exists
  if (!existsSync(HERO_IMAGES_DIR)) {
    await mkdir(HERO_IMAGES_DIR, { recursive: true });
    console.log(`📁 Created directory: ${HERO_IMAGES_DIR}`);
  }

  // Fetch curated images from database
  console.log('📥 Fetching curated hero images from database...');
  const { data: curatedImages, error } = await supabase
    .from('curated_hero_images')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: false })
    .limit(20);

  if (error) {
    console.error('❌ Error fetching curated images:', error);
    process.exit(1);
  }

  if (!curatedImages || curatedImages.length === 0) {
    console.log('⚠️  No curated hero images found. Falling back to direct query...');

    // Fallback: fetch directly from photo_metadata
    const { data: fallbackImages, error: fallbackError } = await supabase
      .from('photo_metadata')
      .select('photo_id, image_key, ImageUrl, album_key, album_name, sharpness, composition_score, emotional_impact')
      .eq('sport_type', 'volleyball')
      .gte('aspect_ratio', 1.0)
      .gte('sharpness', 8.5)
      .gte('composition_score', 8.5)
      .gte('emotional_impact', 8.5)
      .in('photo_category', ['action', 'celebration', 'portrait'])
      .order('sharpness', { ascending: false })
      .limit(20);

    if (fallbackError || !fallbackImages?.length) {
      console.error('❌ No hero-worthy images found in database');
      process.exit(1);
    }

    // Transform to curated format
    const transformedImages = fallbackImages.map((img, idx) => ({
      id: idx + 1,
      photo_id: img.photo_id,
      image_key: img.image_key,
      original_url: img.ImageUrl,
      album_key: img.album_key,
      album_name: img.album_name,
      quality_score: ((img.sharpness || 0) + (img.composition_score || 0) + (img.emotional_impact || 0)) / 3,
      priority: fallbackImages.length - idx,
    }));

    return processImages(transformedImages);
  }

  return processImages(curatedImages);
}

/**
 * Process and save all images
 */
async function processImages(images: any[]): Promise<void> {
  console.log(`\n📸 Processing ${images.length} hero images...\n`);

  const manifest: HeroImageManifest = {
    version: Date.now(),
    generatedAt: new Date().toISOString(),
    images: [],
  };

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const paddedIndex = String(i + 1).padStart(3, '0');
    const baseFilename = `hero-${paddedIndex}`;

    console.log(`  [${i + 1}/${images.length}] Processing ${img.image_key}...`);

    try {
      // Download the high-res version (X3 or X2)
      const sourceUrl = getSmugMugUrl(img.original_url, 'X3');
      console.log(`    📥 Downloading from SmugMug...`);
      const imageBuffer = await downloadImage(sourceUrl);

      // Generate all sizes
      const paths = {
        desktop: `/hero-images/${baseFilename}-desktop.webp`,
        mobile: `/hero-images/${baseFilename}-mobile.webp`,
        thumbnail: `/hero-images/${baseFilename}-thumb.webp`,
      };

      // Process desktop version (1920px)
      await processImage(
        imageBuffer,
        join(HERO_IMAGES_DIR, `${baseFilename}-desktop.webp`),
        DESKTOP_WIDTH
      );
      console.log(`    ✓ Desktop (${DESKTOP_WIDTH}px)`);

      // Process mobile version (1200px)
      await processImage(
        imageBuffer,
        join(HERO_IMAGES_DIR, `${baseFilename}-mobile.webp`),
        MOBILE_WIDTH
      );
      console.log(`    ✓ Mobile (${MOBILE_WIDTH}px)`);

      // Process thumbnail (100px for blur-up placeholder)
      await processImage(
        imageBuffer,
        join(HERO_IMAGES_DIR, `${baseFilename}-thumb.webp`),
        THUMBNAIL_WIDTH
      );
      console.log(`    ✓ Thumbnail (${THUMBNAIL_WIDTH}px)`);

      // Add to manifest
      manifest.images.push({
        id: img.id || i + 1,
        photoId: img.photo_id,
        imageKey: img.image_key,
        albumKey: img.album_key || '',
        albumName: img.album_name || '',
        qualityScore: parseFloat(img.quality_score) || 0,
        priority: img.priority || i + 1,
        paths,
      });

      // Update database with local path (if using curated_hero_images table)
      if (img.id) {
        await supabase
          .from('curated_hero_images')
          .update({ local_path: paths.desktop })
          .eq('id', img.id);
      }

      console.log(`    ✅ Done\n`);
    } catch (err) {
      console.error(`    ❌ Failed to process ${img.image_key}:`, err);
      // Continue with other images
    }
  }

  // Write manifest
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\n📋 Manifest written to ${MANIFEST_PATH}`);

  // Summary
  console.log(`\n✨ Hero images build complete!`);
  console.log(`   📁 Output: ${HERO_IMAGES_DIR}`);
  console.log(`   📸 Images: ${manifest.images.length}`);
  console.log(`   📦 Ready for Vercel static hosting`);
}

// Run the script
buildHeroImages().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
