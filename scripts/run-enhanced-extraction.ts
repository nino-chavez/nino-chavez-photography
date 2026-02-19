#!/usr/bin/env node
/**
 * Run Enhanced Metadata Extraction
 *
 * Extracts deep visual metadata using enhanced agentic vision:
 * - Multi-player tracking with jersey numbers and team assignment
 * - Team color identification
 * - Ball position tracking
 * - Venue and crowd analysis
 *
 * Usage:
 *   npx tsx scripts/run-enhanced-extraction.ts --limit=100
 *   npx tsx scripts/run-enhanced-extraction.ts --limit=100 --update-db
 *   npx tsx scripts/run-enhanced-extraction.ts --start-from=100 --limit=100 --update-db
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
	buildEnhancedAgenticPrompt,
	type EnhancedAgenticResponse,
	type EnhancedAgenticContext,
} from '../src/lib/ai/enrichment-prompts';

// =============================================================================
// Configuration
// =============================================================================

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_API_KEY) {
	console.error('❌ Missing environment variables');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const MODEL = 'gemini-2.5-flash';
const OUTPUT_DIR = '.temp/enhanced-extraction';

// =============================================================================
// CLI Arguments
// =============================================================================

interface CLIArgs {
	limit: number;
	startFrom: number;
	updateDb: boolean;
	dryRun: boolean;
}

function parseArgs(): CLIArgs {
	const args = process.argv.slice(2);
	return {
		limit: parseInt(args.find((a) => a.startsWith('--limit='))?.replace('--limit=', '') || '50'),
		startFrom: parseInt(args.find((a) => a.startsWith('--start-from='))?.replace('--start-from=', '') || '0'),
		updateDb: args.includes('--update-db'),
		dryRun: args.includes('--dry-run'),
	};
}

// =============================================================================
// Types
// =============================================================================

interface PhotoCandidate {
	photo_id: string;
	image_key: string;
	album_name: string;
	sport_type: string;
	play_type: string | null;
	sharpness: number | null;
	ImageUrl: string | null;
	ThumbnailUrl: string | null;
}

interface ExtractionResult {
	photo_id: string;
	image_key: string;
	enhanced_result: EnhancedAgenticResponse | null;
	error: string | null;
	processing_time_ms: number;
}

// =============================================================================
// Enhanced Extraction
// =============================================================================

async function extractEnhancedMetadata(photo: PhotoCandidate): Promise<ExtractionResult> {
	const startTime = Date.now();

	const result: ExtractionResult = {
		photo_id: photo.photo_id,
		image_key: photo.image_key,
		enhanced_result: null,
		error: null,
		processing_time_ms: 0,
	};

	try {
		const imageUrl = photo.ImageUrl || photo.ThumbnailUrl;
		if (!imageUrl) throw new Error('No image URL');

		// Fetch image
		const imageResponse = await fetch(imageUrl);
		if (!imageResponse.ok) throw new Error(`Fetch failed: ${imageResponse.status}`);

		const imageBuffer = await imageResponse.arrayBuffer();
		const base64Data = Buffer.from(imageBuffer).toString('base64');

		// Build enhanced prompt
		const context: EnhancedAgenticContext = {
			albumName: photo.album_name,
			focusAreas: ['players', 'teams', 'ball'],
		};
		const prompt = buildEnhancedAgenticPrompt(context);

		// Call Gemini
		const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);
		const model = genAI.getGenerativeModel({ model: MODEL });

		const response = await model.generateContent([
			prompt,
			{ inlineData: { data: base64Data, mimeType: 'image/jpeg' } },
		]);

		const responseText = response.response.text();
		const jsonMatch = responseText.match(/\{[\s\S]*\}/);
		if (!jsonMatch) throw new Error('No JSON in response');

		result.enhanced_result = JSON.parse(jsonMatch[0]);
	} catch (error: unknown) {
		result.error = error instanceof Error ? error.message : String(error);
	}

	result.processing_time_ms = Date.now() - startTime;
	return result;
}

// =============================================================================
// Database Update
// =============================================================================

async function updateDatabase(result: ExtractionResult): Promise<boolean> {
	if (!result.enhanced_result) return false;

	const er = result.enhanced_result;

	// Normalize ball_position to valid enum value
	const validBallPositions = ['in_hands', 'above_net', 'in_flight', 'on_ground', 'out_of_frame'];
	const ballPosition = er.spatial?.ball_position && validBallPositions.includes(er.spatial.ball_position)
		? er.spatial.ball_position
		: null;

	// Normalize venue_type to valid enum value
	const validVenueTypes = ['indoor_gym', 'outdoor_grass', 'beach', 'stadium', 'outdoor_court'];
	const venueType = er.game_context?.venue_type && validVenueTypes.includes(er.game_context.venue_type)
		? er.game_context.venue_type
		: null;

	// Normalize crowd_density to valid enum value
	const validCrowdDensities = ['empty', 'sparse', 'moderate', 'packed'];
	const crowdDensity = er.game_context?.crowd_density && validCrowdDensities.includes(er.game_context.crowd_density)
		? er.game_context.crowd_density
		: null;

	const updateData: Record<string, unknown> = {
		// Enhanced metadata fields (new columns from migration)
		players: er.players || [],
		team_colors: er.teams || null,
		ball_position: ballPosition,
		venue_type: venueType,
		crowd_density: crowdDensity,
		player_count: er.spatial?.player_count || null,
		key_moment: er.spatial?.key_moment || null,

		// Update existing standard fields
		ai_confidence: er.sport_confidence,
	};

	// Only update sharpness if quality assessment available (existing column)
	if (er.quality_assessment?.sharpness) {
		updateData.sharpness = er.quality_assessment.sharpness;
	}

	const { error } = await supabase
		.from('photo_metadata')
		.update(updateData)
		.eq('photo_id', result.photo_id);

	if (error) {
		console.error(`  ❌ DB update failed: ${error.message}`);
		return false;
	}

	return true;
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
	const args = parseArgs();

	console.log('🔬 Enhanced Metadata Extraction\n');
	console.log(`Model: ${MODEL}`);
	console.log(`Limit: ${args.limit}`);
	console.log(`Start from: ${args.startFrom}`);
	console.log(`Update DB: ${args.updateDb}`);
	console.log('');

	if (!existsSync(OUTPUT_DIR)) {
		mkdirSync(OUTPUT_DIR, { recursive: true });
	}

	// Get high-quality action photos for enhanced extraction
	console.log('Fetching candidates...');
	const { data: photos, error: fetchError } = await supabase
		.from('photo_metadata')
		.select('photo_id, image_key, album_name, sport_type, play_type, sharpness, ImageUrl, ThumbnailUrl')
		.eq('sport_type', 'volleyball')
		.eq('photo_category', 'action')
		.gte('sharpness', 6)
		.or('players.is.null,players.eq.[]') // Only photos without enhanced metadata
		.order('sharpness', { ascending: false })
		.range(args.startFrom, args.startFrom + args.limit - 1);

	if (fetchError) {
		// If players column doesn't exist, fall back to simpler query
		console.log('Note: players column may not exist yet, using fallback query...');
		const { data: fallbackPhotos } = await supabase
			.from('photo_metadata')
			.select('photo_id, image_key, album_name, sport_type, play_type, sharpness, ImageUrl, ThumbnailUrl')
			.eq('sport_type', 'volleyball')
			.eq('photo_category', 'action')
			.gte('sharpness', 6)
			.order('sharpness', { ascending: false })
			.range(args.startFrom, args.startFrom + args.limit - 1);

		if (!fallbackPhotos || fallbackPhotos.length === 0) {
			console.log('No photos found to process');
			return;
		}

		await processPhotos(fallbackPhotos, args);
		return;
	}

	if (!photos || photos.length === 0) {
		console.log('No photos found to process (all may already have enhanced metadata)');
		return;
	}

	await processPhotos(photos, args);
}

async function processPhotos(photos: PhotoCandidate[], args: CLIArgs): Promise<void> {
	console.log(`Processing ${photos.length} photos...\n`);

	const results: ExtractionResult[] = [];
	let playersDetected = 0;
	let teamColorsDetected = 0;
	let ballPositionDetected = 0;
	let dbUpdates = 0;

	for (let i = 0; i < photos.length; i++) {
		const photo = photos[i];
		process.stdout.write(`[${i + 1}/${photos.length}] ${photo.image_key}... `);

		if (args.dryRun) {
			console.log('SKIP (dry run)');
			continue;
		}

		const result = await extractEnhancedMetadata(photo);
		results.push(result);

		if (result.error) {
			console.log(`❌ ${result.error}`);
		} else if (result.enhanced_result) {
			const er = result.enhanced_result;
			console.log(`✅ ${result.processing_time_ms}ms`);

			// Count detections
			const playerCount = er.players?.filter((p) => p.jersey_number).length || 0;
			if (playerCount > 0) {
				playersDetected += playerCount;
				const jerseys = er.players?.filter((p) => p.jersey_number).map((p) => `#${p.jersey_number}`).join(', ');
				console.log(`   👥 Players: ${jerseys}`);
			}
			if (er.teams?.home_colors?.length > 0) {
				teamColorsDetected++;
				console.log(`   🎨 Teams: ${er.teams.home_colors.join('/')} vs ${er.teams.away_colors?.join('/') || '?'}`);
			}
			if (er.spatial?.ball_visible) {
				ballPositionDetected++;
				console.log(`   ⚽ Ball: ${er.spatial.ball_position}`);
			}
			if (er.spatial?.key_moment) {
				console.log(`   📸 Moment: ${er.spatial.key_moment}`);
			}

			// Update database
			if (args.updateDb) {
				const updated = await updateDatabase(result);
				if (updated) {
					dbUpdates++;
					console.log(`   💾 Saved`);
				}
			}
		}

		// Rate limiting
		if (i < photos.length - 1) {
			await new Promise((r) => setTimeout(r, 1500));
		}
	}

	// Save results
	const outputPath = `${OUTPUT_DIR}/extraction-results-${Date.now()}.json`;
	writeFileSync(outputPath, JSON.stringify(results, null, 2));

	// Summary
	console.log('\n' + '='.repeat(60));
	console.log('EXTRACTION COMPLETE');
	console.log('='.repeat(60));
	console.log(`Processed: ${results.length}`);
	console.log(`Players detected: ${playersDetected}`);
	console.log(`Team colors identified: ${teamColorsDetected}`);
	console.log(`Ball positions tracked: ${ballPositionDetected}`);
	if (args.updateDb) {
		console.log(`Database updates: ${dbUpdates}`);
	}
	console.log(`\n📁 Results saved: ${outputPath}`);
}

main().catch(console.error);
