#!/usr/bin/env node
/**
 * Hybrid Sync: Local EXIF + SmugMug URLs
 *
 * Reads metadata from local EXIF and matches with SmugMug image URLs.
 * Best of both worlds: complete metadata + SmugMug image URLs.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { readdir } from 'fs/promises';
import { join, basename } from 'path';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

// Supabase
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// SmugMug
const SMUGMUG_API_KEY = process.env.VITE_SMUGMUG_API_KEY!;
const SMUGMUG_API_SECRET = process.env.VITE_SMUGMUG_API_SECRET!;
const SMUGMUG_USER_TOKEN = process.env.VITE_SMUGMUG_ACCESS_TOKEN!;
const SMUGMUG_USER_SECRET = process.env.VITE_SMUGMUG_ACCESS_TOKEN_SECRET!;

interface ParsedMetadata {
  imageKey: string;
  fileName: string;
  albumKey: string;
  sport_type?: string;
  photo_category?: string;
  play_type?: string | null;
  action_intensity?: string;
  composition?: string;
  time_of_day?: string;
  lighting?: string;
  color_temperature?: string;
  emotion?: string;
  sharpness?: number;
  composition_score?: number;
  exposure_accuracy?: number;
  emotional_impact?: number;
  time_in_game?: string | null;
  ai_confidence?: number;
  photo_date?: string;
  image_url?: string;
  thumbnail_url?: string;
}

function createOAuthClient() {
  return new OAuth({
    consumer: { key: SMUGMUG_API_KEY, secret: SMUGMUG_API_SECRET },
    signature_method: 'HMAC-SHA1',
    hash_function: (baseString, key) => crypto.createHmac('sha1', key).update(baseString).digest('base64')
  });
}

async function smugMugRequest(method: string, endpoint: string): Promise<any> {
  const oauth = createOAuthClient();
  const token = { key: SMUGMUG_USER_TOKEN, secret: SMUGMUG_USER_SECRET };
  const url = endpoint.startsWith('/api/v2') ? `https://api.smugmug.com${endpoint}` : `https://api.smugmug.com/api/v2${endpoint}`;
  const requestData = { url, method };
  const authHeader = oauth.toHeader(oauth.authorize(requestData, token));
  const response = await fetch(url, { method, headers: { ...authHeader, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`SmugMug API error (${response.status}): ${await response.text()}`);
  return await response.json();
}

async function fetchSmugMugImages(albumKey: string): Promise<Map<string, { imageUrl: string; thumbnailUrl: string }>> {
  console.log(`🔍 Fetching SmugMug image URLs for album ${albumKey}...`);

  const imagesResult = await smugMugRequest('GET', `/album/${albumKey}!images`);
  const images = imagesResult.Response.AlbumImage || [];

  const urlMap = new Map<string, { imageUrl: string; thumbnailUrl: string }>();

  for (const image of images) {
    const fileName = image.FileName.replace(/\.(jpg|jpeg)$/i, '');
    urlMap.set(fileName, {
      imageUrl: image.ArchivedUri,
      thumbnailUrl: image.ThumbnailUrl
    });
  }

  console.log(`   Found URLs for ${urlMap.size} images\n`);
  return urlMap;
}

function parseLocalExif(photoPath: string, albumKey: string): Omit<ParsedMetadata, 'image_url' | 'thumbnail_url'> | null {
  try {
    const exifJson = execSync(`exiftool -json -Keywords -Subject -DateTimeOriginal "${photoPath}"`, { encoding: 'utf-8' });
    const [exifData] = JSON.parse(exifJson);

    // Use Subject first (more complete), fallback to Keywords
    const keywords = exifData.Subject || exifData.Keywords || [];
    const keywordStr = Array.isArray(keywords) ? keywords.join(' ') : String(keywords);

    if (!keywordStr.includes('play_') && !keywordStr.includes('sport_')) {
      return null;
    }

    const fileName = basename(photoPath);
    const imageKey = fileName.replace(/\.(jpg|jpeg)$/i, '');

    // Parse structured metadata
    const sportMatch = keywordStr.match(/sport_(\w+)/);
    const categoryMatch = keywordStr.match(/category_(\w+)/);
    const playMatch = keywordStr.match(/play_(\w+)/);
    const intensityMatch = keywordStr.match(/intensity_(\w+)/);
    const compositionMatch = keywordStr.match(/composition_(\w+)/);
    const timeMatch = keywordStr.match(/time_(\w+)/);
    const lightingMatch = keywordStr.match(/lighting_(\w+)/);
    const colorMatch = keywordStr.match(/color_(\w+)/);
    const emotionMatch = keywordStr.match(/emotion_(\w+)/);
    const gameTimeMatch = keywordStr.match(/game_time_(\w+)/);

    // Parse quality scores
    const sharpnessMatch = keywordStr.match(/sharpness_([\d.]+)/);
    const compositionScoreMatch = keywordStr.match(/composition_score_([\d.]+)/);
    const exposureMatch = keywordStr.match(/exposure_([\d.]+)/);
    const emotionalMatch = keywordStr.match(/emotional_impact_([\d.]+)/);

    // Parse photo date
    let photoDate: string | undefined;
    if (exifData.DateTimeOriginal) {
      const dateMatch = exifData.DateTimeOriginal.match(/(\d{4}):(\d{2}):(\d{2})/);
      if (dateMatch) {
        photoDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
      }
    }

    return {
      imageKey,
      fileName,
      albumKey,
      sport_type: sportMatch ? sportMatch[1] : undefined,
      photo_category: categoryMatch ? categoryMatch[1] : undefined,
      play_type: playMatch ? playMatch[1] : null,
      action_intensity: intensityMatch ? intensityMatch[1] : undefined,
      composition: compositionMatch ? compositionMatch[1] : undefined,
      time_of_day: timeMatch ? timeMatch[1] : undefined,
      lighting: lightingMatch ? lightingMatch[1] : undefined,
      color_temperature: colorMatch ? colorMatch[1] : undefined,
      emotion: emotionMatch ? emotionMatch[1] : undefined,
      sharpness: sharpnessMatch ? parseFloat(sharpnessMatch[1]) : undefined,
      composition_score: compositionScoreMatch ? parseFloat(compositionScoreMatch[1]) : undefined,
      exposure_accuracy: exposureMatch ? parseFloat(exposureMatch[1]) : undefined,
      emotional_impact: emotionalMatch ? parseFloat(emotionalMatch[1]) : undefined,
      time_in_game: gameTimeMatch ? gameTimeMatch[1] : null,
      ai_confidence: 0.9,
      photo_date: photoDate
    };
  } catch (error: any) {
    console.error(`   ⚠️  Error reading EXIF from ${basename(photoPath)}: ${error.message}`);
    return null;
  }
}

async function syncToSupabase(metadata: ParsedMetadata[]): Promise<{ synced: number; errors: number }> {
  console.log(`💾 Syncing ${metadata.length} photos to Supabase...\n`);

  let synced = 0;
  let errors = 0;

  for (const meta of metadata) {
    try {
      const { error } = await supabase.from('photo_metadata').insert({
        photo_id: randomUUID(),
        album_key: meta.albumKey,
        image_key: meta.imageKey,
        sport_type: meta.sport_type,
        photo_category: meta.photo_category,
        play_type: meta.play_type,
        action_intensity: meta.action_intensity,
        composition: meta.composition,
        time_of_day: meta.time_of_day,
        lighting: meta.lighting,
        color_temperature: meta.color_temperature,
        emotion: meta.emotion,
        sharpness: meta.sharpness,
        composition_score: meta.composition_score,
        exposure_accuracy: meta.exposure_accuracy,
        emotional_impact: meta.emotional_impact,
        time_in_game: meta.time_in_game,
        ai_confidence: meta.ai_confidence,
        photo_date: meta.photo_date,
        ImageUrl: meta.image_url,
        ThumbnailUrl: meta.thumbnail_url,
        enriched_at: new Date().toISOString()
      });

      if (error) {
        if (error.code === '23505') {
          console.log(`   ⏭️  ${meta.imageKey} already exists - skipping`);
        } else {
          console.error(`   ❌ Failed to sync ${meta.imageKey}: ${error.message}`);
          errors++;
        }
      } else {
        synced++;
        if (synced % 10 === 0) {
          console.log(`   ✅ Synced: ${synced}`);
        }
      }
    } catch (error: any) {
      console.error(`   ❌ Error syncing ${meta.imageKey}: ${error.message}`);
      errors++;
    }
  }

  return { synced, errors };
}

async function main() {
  const photoDir = process.argv[2];
  const albumKey = process.argv[3];

  if (!photoDir || !albumKey) {
    console.error('Usage: npx tsx scripts/sync-hybrid.ts <photo-directory> <album-key>');
    console.error('');
    console.error('Examples:');
    console.error('  npx tsx scripts/sync-hybrid.ts /path/to/photos vszCr8');
    process.exit(1);
  }

  console.log('\n🔄 Hybrid Sync: Local EXIF + SmugMug URLs\n');
  console.log(`   Photo Directory: ${photoDir}`);
  console.log(`   Album Key: ${albumKey}\n`);

  // Step 1: Fetch SmugMug URLs
  const smugMugUrls = await fetchSmugMugImages(albumKey);

  // Step 2: Parse local EXIF
  console.log('📊 Parsing enriched metadata from local EXIF...');
  const files = await readdir(photoDir);
  const photos = files.filter((f) => /\.(jpg|jpeg)$/i.test(f));

  const parsedMetadata: ParsedMetadata[] = [];
  let enrichedCount = 0;

  for (const photo of photos) {
    const photoPath = join(photoDir, photo);
    const metadata = parseLocalExif(photoPath, albumKey);
    if (metadata) {
      // Match with SmugMug URLs
      const urls = smugMugUrls.get(metadata.imageKey);
      if (urls) {
        parsedMetadata.push({
          ...metadata,
          image_url: urls.imageUrl,
          thumbnail_url: urls.thumbnailUrl
        });
        enrichedCount++;
      } else {
        console.warn(`   ⚠️  No SmugMug URL found for ${metadata.imageKey}`);
      }
    }
  }

  console.log(`   ✅ Matched ${enrichedCount}/${photos.length} photos with SmugMug URLs\n`);

  if (parsedMetadata.length === 0) {
    console.error('❌ No photos matched. Check album key and local directory.');
    process.exit(1);
  }

  // Step 3: Sync to Supabase
  const { synced, errors } = await syncToSupabase(parsedMetadata);

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ Sync Complete!\n');
  console.log(`   Synced: ${synced} photos`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Album Key: ${albumKey}`);
  console.log('\n✨ Photos are now live in the gallery!');
  console.log('   Visit: https://photography.ninochavez.co');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
