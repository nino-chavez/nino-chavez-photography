#!/usr/bin/env node
/**
 * Sync Local Enriched Photos to Supabase
 *
 * Reads enriched metadata from local photo EXIF and syncs directly to Supabase.
 * Use this when photos are already uploaded to SmugMug but need database indexing.
 *
 * Usage:
 *   npx tsx scripts/sync-local-to-supabase.ts <photo-directory> <album-key> [options]
 *
 * Options:
 *   --album-name="Album Name"  Set album name for all photos
 *   --upload-date="YYYY-MM-DD" Set upload date (defaults to today)
 *   --dry-run                  Preview changes without syncing
 *
 * Examples:
 *   npx tsx scripts/sync-local-to-supabase.ts /path/to/photos xSqPJB
 *   npx tsx scripts/sync-local-to-supabase.ts /path/to/photos xSqPJB --dry-run
 *   npx tsx scripts/sync-local-to-supabase.ts /path/to/photos xSqPJB --album-name="FUTURE - Fall 2025"
 *   npx tsx scripts/sync-local-to-supabase.ts /path/to/photos xSqPJB --album-name="FUTURE - Fall 2025" --upload-date="2025-11-03"
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { readdir } from 'fs/promises';
import { join, basename } from 'path';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';

// =============================================================================
// Configuration
// =============================================================================

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Parse CLI arguments
function getArgValue(argName: string): string | undefined {
	const arg = process.argv.find((a) => a.startsWith(`--${argName}=`));
	return arg ? arg.split('=')[1].replace(/^["']|["']$/g, '') : undefined;
}

const CONFIG = {
	dryRun: process.argv.includes('--dry-run'),
	albumName: getArgValue('album-name'),
	uploadDate: getArgValue('upload-date') || new Date().toISOString().split('T')[0]
};

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('❌ Missing Supabase credentials:');
	console.error('   VITE_SUPABASE_URL');
	console.error('   SUPABASE_SERVICE_ROLE_KEY');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// =============================================================================
// Metadata Parsing from Local EXIF
// =============================================================================

interface ParsedMetadata {
	imageKey: string;
	albumKey: string;
	albumName?: string;
	uploadDate?: string;
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
	// Phase 1 (v-next): natural-language caption + multi-player extraction.
	caption?: string | null;
	players?: Array<{ jersey_number: number | null; team_color: string | null; action: string | null }>;
	team_colors?: string[];
}

function parseLocalExif(photoPath: string, albumKey: string): ParsedMetadata | null {
	try {
		const exifJson = execSync(`exiftool -json -Keywords -Subject -DateTimeOriginal -ImageDescription -UserComment "${photoPath}"`, {
			encoding: 'utf-8'
		});
		const [exifData] = JSON.parse(exifJson);

		// Parse keywords - prefer Subject (full data) over Keywords (may be truncated by IPTC)
		// Combine both to ensure we get all metadata
		const keywordsField = exifData.Keywords || '';
		const subjectField = exifData.Subject || '';
		const keywordStr = [
			Array.isArray(keywordsField) ? keywordsField.join(' ') : String(keywordsField),
			Array.isArray(subjectField) ? subjectField.join(' ') : String(subjectField)
		].join(' ');

		// Check if enriched
		if (!keywordStr.includes('play_') && !keywordStr.includes('sport_')) {
			return null;
		}

		// Extract image key from filename
		const fileName = basename(photoPath);
		const imageKey = fileName.replace(/\.(jpg|jpeg)$/i, '');

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
		if (exifData.DateTimeOriginal) {
			const dateMatch = exifData.DateTimeOriginal.match(/(\d{4}):(\d{2}):(\d{2})/);
			if (dateMatch) {
				photoDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
			}
		}

		// Phase 1 (v-next): caption from ImageDescription, players/team_colors from UserComment JSON.
		const caption = typeof exifData.ImageDescription === 'string' && exifData.ImageDescription.trim()
			? exifData.ImageDescription.trim()
			: null;
		let players: ParsedMetadata['players'] = undefined;
		let teamColors: string[] | undefined = undefined;
		if (exifData.UserComment) {
			try {
				const vnext = JSON.parse(String(exifData.UserComment));
				if (Array.isArray(vnext?.players)) players = vnext.players;
				if (Array.isArray(vnext?.team_colors)) teamColors = vnext.team_colors;
			} catch { /* not v-next JSON — ignore */ }
		}

		return {
			imageKey,
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
			photo_date: photoDate,
			caption,
			players,
			team_colors: teamColors
		};
	} catch (error: any) {
		console.error(`   ⚠️  Error reading EXIF from ${basename(photoPath)}: ${error.message}`);
		return null;
	}
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
				album_name: meta.albumName,
				upload_date: meta.uploadDate,
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
				caption: meta.caption,
				...(meta.players ? { players: meta.players } : {}),
				...(meta.team_colors ? { team_colors: meta.team_colors } : {}),
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
	const photoDir = process.argv[2];
	const albumKey = process.argv[3];

	if (!photoDir || !albumKey) {
		console.error('Usage: npx tsx scripts/sync-local-to-supabase.ts <photo-directory> <album-key> [options]');
		console.error('');
		console.error('Options:');
		console.error('  --album-name="Album Name"  Set album name for all photos');
		console.error('  --upload-date="YYYY-MM-DD" Set upload date (defaults to today)');
		console.error('  --dry-run                  Preview changes without syncing');
		console.error('');
		console.error('Examples:');
		console.error('  npx tsx scripts/sync-local-to-supabase.ts /path/to/photos xSqPJB');
		console.error('  npx tsx scripts/sync-local-to-supabase.ts /path/to/photos xSqPJB --dry-run');
		console.error('  npx tsx scripts/sync-local-to-supabase.ts /path/to/photos xSqPJB --album-name="FUTURE - Fall 2025"');
		console.error('  npx tsx scripts/sync-local-to-supabase.ts /path/to/photos xSqPJB --album-name="FUTURE - Fall 2025" --upload-date="2025-11-03"');
		process.exit(1);
	}

	console.log('\n🔄 Sync Local Photos to Supabase\n');
	console.log(`   Photo Directory: ${photoDir}`);
	console.log(`   Album Key: ${albumKey}`);
	if (CONFIG.albumName) {
		console.log(`   Album Name: ${CONFIG.albumName}`);
	}
	if (CONFIG.uploadDate) {
		console.log(`   Upload Date: ${CONFIG.uploadDate}`);
	}

	if (CONFIG.dryRun) {
		console.log('   🧪 DRY RUN MODE - No database changes will be made\n');
	}

	// Step 1: Find photos
	const files = await readdir(photoDir);
	const photos = files.filter((f) => /\.(jpg|jpeg)$/i.test(f));

	console.log(`\n📸 Found ${photos.length} photos`);

	// Step 2: Parse metadata from local EXIF
	console.log('\n📊 Parsing enriched metadata from local EXIF...');
	const parsedMetadata: ParsedMetadata[] = [];
	let enrichedCount = 0;

	for (const photo of photos) {
		const photoPath = join(photoDir, photo);
		const metadata = parseLocalExif(photoPath, albumKey);
		if (metadata) {
			// Add optional fields from CLI args
			metadata.albumName = CONFIG.albumName;
			metadata.uploadDate = CONFIG.uploadDate;
			parsedMetadata.push(metadata);
			enrichedCount++;
		}
	}

	console.log(`   ✅ Parsed ${enrichedCount}/${photos.length} enriched photos`);

	if (parsedMetadata.length === 0) {
		console.error('\n❌ No enriched photos found. Did you run enrich script first?');
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
	console.log('\n✨ Photos are now indexed in the database!');
	console.log('   Visit: https://photography.ninochavez.co');
}

main().catch((error) => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
