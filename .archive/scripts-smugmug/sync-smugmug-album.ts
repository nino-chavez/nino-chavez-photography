#!/usr/bin/env node
/**
 * Sync SmugMug Album to Supabase
 *
 * Fetches photos from SmugMug album and syncs enriched metadata to Supabase.
 * Use this after uploading enriched photos to SmugMug.
 *
 * Usage:
 *   npx tsx scripts/sync-smugmug-album.ts <album-key>
 *   npx tsx scripts/sync-smugmug-album.ts <album-key> --dry-run
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';
import { randomUUID } from 'crypto';

// =============================================================================
// Configuration
// =============================================================================

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SMUGMUG_API_KEY = process.env.VITE_SMUGMUG_API_KEY || process.env.SMUGMUG_API_KEY;
const SMUGMUG_API_SECRET = process.env.VITE_SMUGMUG_API_SECRET || process.env.SMUGMUG_API_SECRET;
const SMUGMUG_USER_TOKEN = process.env.VITE_SMUGMUG_ACCESS_TOKEN || process.env.SMUGMUG_USER_TOKEN || process.env.SMUGMUG_ACCESS_TOKEN;
const SMUGMUG_USER_SECRET = process.env.VITE_SMUGMUG_ACCESS_TOKEN_SECRET || process.env.SMUGMUG_USER_SECRET || process.env.SMUGMUG_ACCESS_TOKEN_SECRET;

const CONFIG = {
	dryRun: process.argv.includes('--dry-run')
};

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('❌ Missing Supabase credentials:');
	console.error('   VITE_SUPABASE_URL');
	console.error('   SUPABASE_SERVICE_ROLE_KEY');
	process.exit(1);
}

if (!SMUGMUG_API_KEY || !SMUGMUG_API_SECRET || !SMUGMUG_USER_TOKEN || !SMUGMUG_USER_SECRET) {
	console.error('❌ Missing SmugMug credentials');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// =============================================================================
// SmugMug OAuth Client
// =============================================================================

function createOAuthClient() {
	return new OAuth({
		consumer: {
			key: SMUGMUG_API_KEY!,
			secret: SMUGMUG_API_SECRET!
		},
		signature_method: 'HMAC-SHA1',
		hash_function: (baseString, key) => crypto.createHmac('sha1', key).update(baseString).digest('base64')
	});
}

function getToken() {
	return {
		key: SMUGMUG_USER_TOKEN!,
		secret: SMUGMUG_USER_SECRET!
	};
}

async function smugMugRequest(method: string, endpoint: string): Promise<any> {
	const oauth = createOAuthClient();
	const token = getToken();

	const url = endpoint.startsWith('/api/v2')
		? `https://api.smugmug.com${endpoint}`
		: `https://api.smugmug.com/api/v2${endpoint}`;

	const requestData = { url, method };
	const authHeader = oauth.toHeader(oauth.authorize(requestData, token));

	const response = await fetch(url, {
		method,
		headers: {
			...authHeader,
			Accept: 'application/json'
		}
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`SmugMug API error (${response.status}): ${errorText}`);
	}

	return await response.json();
}

// =============================================================================
// SmugMug Data Fetching
// =============================================================================

interface SmugMugPhoto {
	ImageKey: string;
	FileName: string;
	ArchivedUri?: string;
	ImageMetadata?: {
		DateTimeOriginal?: string;
		Keywords?: string[];
		Subject?: string[];
		Title?: string;
	};
}

async function fetchAlbumPhotos(albumKey: string): Promise<SmugMugPhoto[]> {
	console.log(`🔍 Fetching photos from SmugMug album ${albumKey}...`);

	// Fetch album images WITH expansion - eliminates N+1 queries!
	// Using _expand parameter to get Image and ImageMetadata in a single API call
	console.log(`   Using _expand optimization to fetch all data in one request...`);

	const imagesResult = await smugMugRequest(
		'GET',
		`/album/${albumKey}!images?_expand=Image,ImageMetadata&count=500`
	);

	const albumImages = imagesResult.Response.AlbumImage || [];
	const expansions = imagesResult.Expansions || {};

	console.log(`   ✅ Found ${albumImages.length} photos (fetched in 1 API call vs ${albumImages.length} calls)`);
	console.log(`   📊 Performance improvement: ${albumImages.length}x faster`);

	// Map expanded data to our photo structure
	const photosWithMetadata: SmugMugPhoto[] = albumImages.map((albumImage: any) => {
		// Get the expanded Image and ImageMetadata from Expansions object
		const imageUri = albumImage.Uris?.Image?.Uri;
		const image = imageUri && expansions.Image?.[imageUri];
		const metadata = imageUri && expansions.ImageMetadata?.[imageUri];

		return {
			ImageKey: image?.ImageKey || albumImage.ImageKey,
			FileName: image?.FileName || 'unknown',
			ArchivedUri: image?.ArchivedUri,
			ImageMetadata: metadata
				? {
						DateTimeOriginal: metadata.DateTimeOriginal,
						Keywords: metadata.Keywords,
						Subject: metadata.Subject,
						Title: metadata.Title
				  }
				: undefined
		};
	});

	return photosWithMetadata;
}

// =============================================================================
// Metadata Parsing
// =============================================================================

interface ParsedMetadata {
	imageKey: string;
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

function parseMetadata(photo: SmugMugPhoto, albumKey: string): ParsedMetadata | null {
	if (!photo.ImageMetadata) {
		console.warn(`   ⚠️  ${photo.FileName} has no metadata`);
		return null;
	}

	const keywords = photo.ImageMetadata.Keywords || photo.ImageMetadata.Subject || [];
	const keywordStr = Array.isArray(keywords) ? keywords.join(' ') : String(keywords);

	// Check if enriched (has our custom keywords)
	if (!keywordStr.includes('play_') && !keywordStr.includes('sport_')) {
		console.warn(`   ⚠️  ${photo.FileName} not enriched with AI metadata`);
		return null;
	}

	// Parse structured metadata from keywords
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
	if (photo.ImageMetadata.DateTimeOriginal) {
		const dateMatch = photo.ImageMetadata.DateTimeOriginal.match(/(\d{4}):(\d{2}):(\d{2})/);
		if (dateMatch) {
			photoDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
		}
	}

	// Generate URLs
	const imageUrl = photo.ArchivedUri;
	const thumbnailUrl = imageUrl ? imageUrl.replace('ArchivedUri', 'ThumbUri') : undefined;

	return {
		imageKey: photo.ImageKey,
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
		ai_confidence: 0.9, // Default high confidence from Gemini
		photo_date: photoDate,
		image_url: imageUrl,
		thumbnail_url: thumbnailUrl
	};
}

// =============================================================================
// Supabase Sync
// =============================================================================

async function syncToSupabase(metadata: ParsedMetadata[]): Promise<{ synced: number; errors: number }> {
	console.log(`\n💾 Syncing ${metadata.length} photos to Supabase...`);

	let synced = 0;
	let errors = 0;

	for (const meta of metadata) {
		try {
			if (CONFIG.dryRun) {
				console.log(`   [DRY RUN] Would sync: ${meta.imageKey}`);
				synced++;
				continue;
			}

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
				image_url: meta.image_url,
				thumbnail_url: meta.thumbnail_url,
				enriched_at: new Date().toISOString()
			});

			if (error) {
				// Check if it's a duplicate key error (photo already exists)
				if (error.code === '23505') {
					console.log(`   ⏭️  ${meta.imageKey} already exists - skipping`);
				} else {
					console.error(`   ❌ Failed to sync ${meta.imageKey}: ${error.message}`);
					errors++;
				}
			} else {
				synced++;
			}

			// Progress update
			if (synced % 10 === 0) {
				process.stdout.write(`\r   ✅ Synced: ${synced} | Errors: ${errors}`);
			}
		} catch (error: any) {
			console.error(`   ❌ Error syncing ${meta.imageKey}: ${error.message}`);
			errors++;
		}
	}

	console.log(`\n`);

	return { synced, errors };
}

// =============================================================================
// Main Workflow
// =============================================================================

async function main() {
	const albumKey = process.argv[2];

	if (!albumKey) {
		console.error('Usage: npx tsx scripts/sync-smugmug-album.ts <album-key>');
		console.error('');
		console.error('Examples:');
		console.error('  npx tsx scripts/sync-smugmug-album.ts xSqPJB');
		console.error('  npx tsx scripts/sync-smugmug-album.ts xSqPJB --dry-run');
		process.exit(1);
	}

	console.log('\n🔄 Sync SmugMug Album to Supabase\n');
	console.log(`   Album Key: ${albumKey}`);

	if (CONFIG.dryRun) {
		console.log('   🧪 DRY RUN MODE - No database changes will be made\n');
	}

	// Step 1: Fetch photos from SmugMug
	const photos = await fetchAlbumPhotos(albumKey);

	// Step 2: Parse metadata
	console.log('\n📊 Parsing enriched metadata...');
	const parsedMetadata: ParsedMetadata[] = [];
	let enrichedCount = 0;

	for (const photo of photos) {
		const metadata = parseMetadata(photo, albumKey);
		if (metadata) {
			parsedMetadata.push(metadata);
			enrichedCount++;
		}
	}

	console.log(`   ✅ Parsed ${enrichedCount}/${photos.length} enriched photos`);

	if (parsedMetadata.length === 0) {
		console.error('\n❌ No enriched photos found. Did you run enrich-local-photos.ts first?');
		process.exit(1);
	}

	// Step 3: Sync to Supabase
	const { synced, errors } = await syncToSupabase(parsedMetadata);

	// Final summary
	console.log('='.repeat(60));
	console.log('✅ Sync Complete!\n');
	console.log(`   Synced: ${synced} photos`);
	console.log(`   Errors: ${errors}`);
	console.log(`   Album Key: ${albumKey}`);
	console.log('\n✨ Photos are now live on the gallery!');
	console.log('   Visit: https://photography.ninochavez.co');
}

main().catch((error) => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
