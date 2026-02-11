#!/usr/bin/env node
/**
 * Pilot: Enhanced Agentic Vision (Deep Metadata Extraction)
 *
 * Tests the enhanced agentic prompt that extracts:
 * - Multi-player tracking with team assignment
 * - Team colors and identification
 * - Game context (scores, crowd, venue)
 * - Spatial analysis (ball position, formations)
 *
 * Usage:
 *   npx tsx scripts/pilot-enhanced-agentic.ts --limit=5
 *   npx tsx scripts/pilot-enhanced-agentic.ts --photo-ids=id1,id2
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
const MODEL = 'gemini-2.0-flash';
const OUTPUT_DIR = '.temp/pilot-enhanced';

// =============================================================================
// CLI Arguments
// =============================================================================

function parseArgs() {
	const args = process.argv.slice(2);
	return {
		limit: parseInt(args.find((a) => a.startsWith('--limit='))?.replace('--limit=', '') || '5'),
		photoIds: (args.find((a) => a.startsWith('--photo-ids='))?.replace('--photo-ids=', '') || '')
			.split(',')
			.filter(Boolean),
	};
}

// =============================================================================
// Enhanced Enrichment
// =============================================================================

interface PilotResult {
	photo_id: string;
	image_key: string;
	album_name: string;
	enhanced_result: EnhancedAgenticResponse | null;
	error: string | null;
	processing_time_ms: number;
}

async function enrichWithEnhancedAgentic(
	photo: { photo_id: string; image_key: string; album_name: string; ImageUrl: string | null; ThumbnailUrl: string | null }
): Promise<PilotResult> {
	const startTime = Date.now();

	const result: PilotResult = {
		photo_id: photo.photo_id,
		image_key: photo.image_key,
		album_name: photo.album_name,
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

		// Build enhanced prompt with context
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
// Main
// =============================================================================

async function main(): Promise<void> {
	const args = parseArgs();

	console.log('🔬 Enhanced Agentic Vision Pilot\n');
	console.log(`Model: ${MODEL}`);
	console.log(`Extracting: players, teams, game_context, spatial analysis\n`);

	if (!existsSync(OUTPUT_DIR)) {
		mkdirSync(OUTPUT_DIR, { recursive: true });
	}

	// Get photos to test
	let photos: Array<{
		photo_id: string;
		image_key: string;
		album_name: string;
		ImageUrl: string | null;
		ThumbnailUrl: string | null;
	}>;

	if (args.photoIds.length > 0) {
		const { data } = await supabase
			.from('photo_metadata')
			.select('photo_id, image_key, album_name, ImageUrl, ThumbnailUrl')
			.in('image_key', args.photoIds);
		photos = data || [];
	} else {
		// Get high-quality volleyball action photos for best results
		const { data } = await supabase
			.from('photo_metadata')
			.select('photo_id, image_key, album_name, ImageUrl, ThumbnailUrl')
			.eq('sport_type', 'volleyball')
			.eq('photo_category', 'action')
			.in('play_type', ['spike', 'block', 'dig'])
			.gte('sharpness', 7)
			.order('sharpness', { ascending: false })
			.limit(args.limit);
		photos = data || [];
	}

	console.log(`Processing ${photos.length} photos...\n`);

	const results: PilotResult[] = [];

	for (let i = 0; i < photos.length; i++) {
		const photo = photos[i];
		console.log(`[${i + 1}/${photos.length}] ${photo.image_key}`);
		console.log(`   Album: ${photo.album_name}`);

		const result = await enrichWithEnhancedAgentic(photo);
		results.push(result);

		if (result.error) {
			console.log(`   ❌ Error: ${result.error}`);
		} else if (result.enhanced_result) {
			const er = result.enhanced_result;
			console.log(`   ✅ ${result.processing_time_ms}ms`);
			console.log(`   Sport: ${er.sport_type} (${(er.sport_confidence * 100).toFixed(0)}%)`);
			console.log(`   Play: ${er.play_type} | Intensity: ${er.action_intensity}`);

			// Players
			if (er.players && er.players.length > 0) {
				const playerSummary = er.players
					.filter((p) => p.jersey_number)
					.map((p) => `#${p.jersey_number}(${p.team})`)
					.join(', ');
				console.log(`   Players: ${playerSummary || 'none detected'}`);
			}

			// Teams
			if (er.teams) {
				console.log(`   Teams: Home=${er.teams.home_colors?.join('/')} vs Away=${er.teams.away_colors?.join('/')}`);
				if (er.teams.home_name || er.teams.away_name) {
					console.log(`   Names: ${er.teams.home_name || '?'} vs ${er.teams.away_name || '?'}`);
				}
			}

			// Spatial
			if (er.spatial) {
				console.log(`   Ball: ${er.spatial.ball_visible ? er.spatial.ball_position : 'not visible'} | Players: ${er.spatial.player_count}`);
				console.log(`   Moment: ${er.spatial.key_moment}`);
			}

			// Game context
			if (er.game_context) {
				console.log(`   Venue: ${er.game_context.venue_type} | Crowd: ${er.game_context.crowd_density}`);
				if (er.game_context.scoreboard_visible) {
					console.log(`   Score: ${er.game_context.score_home} - ${er.game_context.score_away}`);
				}
			}

			// Quality
			if (er.quality_assessment) {
				const qa = er.quality_assessment;
				console.log(`   Quality: sharp=${qa.sharpness} comp=${qa.composition_score} emotion=${qa.emotional_impact} portfolio=${qa.portfolio_worthy}`);
			}
		}

		console.log('');

		// Rate limiting
		if (i < photos.length - 1) {
			await new Promise((r) => setTimeout(r, 1500));
		}
	}

	// Save results
	const outputPath = `${OUTPUT_DIR}/enhanced-results-${Date.now()}.json`;
	writeFileSync(outputPath, JSON.stringify(results, null, 2));

	// Summary
	console.log('='.repeat(60));
	console.log('ENHANCED EXTRACTION SUMMARY');
	console.log('='.repeat(60));

	const successful = results.filter((r) => r.enhanced_result);
	console.log(`Processed: ${results.length}`);
	console.log(`Successful: ${successful.length}`);

	// Count new data extracted
	let totalPlayers = 0;
	let teamColorsDetected = 0;
	let ballPositionDetected = 0;
	let venueDetected = 0;

	successful.forEach((r) => {
		const er = r.enhanced_result!;
		totalPlayers += er.players?.filter((p) => p.jersey_number).length || 0;
		if (er.teams?.home_colors?.length > 0) teamColorsDetected++;
		if (er.spatial?.ball_visible) ballPositionDetected++;
		if (er.game_context?.venue_type) venueDetected++;
	});

	console.log(`\nNew metadata extracted:`);
	console.log(`  - Total players detected: ${totalPlayers}`);
	console.log(`  - Team colors identified: ${teamColorsDetected}/${successful.length}`);
	console.log(`  - Ball position tracked: ${ballPositionDetected}/${successful.length}`);
	console.log(`  - Venue type identified: ${venueDetected}/${successful.length}`);

	console.log(`\n📁 Results saved: ${outputPath}`);
}

main().catch(console.error);
