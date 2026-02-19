#!/usr/bin/env node
/**
 * Re-enrich Photos with Two-Tier Model Strategy
 *
 * Uses a more capable model for sport verification, then decides whether
 * to use the cheaper model or continue with the capable model for full enrichment.
 *
 * Strategy:
 * 1. First pass: Verify sport with gemini-2.5-flash (more accurate)
 * 2. If sport_confidence >= 0.8: Use gemini-2.5-flash-lite for remaining metadata
 * 3. If sport_confidence < 0.8: Use gemini-2.5-flash for full enrichment
 *
 * This balances accuracy for the critical sport_type field with cost efficiency.
 *
 * Usage:
 *   npx tsx scripts/reenrich-with-verification.ts --album-key=ABC123
 *   npx tsx scripts/reenrich-with-verification.ts --low-confidence
 *   npx tsx scripts/reenrich-with-verification.ts --sport-mismatch
 *   npx tsx scripts/reenrich-with-verification.ts --all --limit=100
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
	SPORT_VERIFICATION_PROMPT,
	buildCombinedPrompt,
	buildReenrichmentPrompt,
	type SportVerificationResponse,
	type CombinedResponse,
	type EnrichmentContext
} from '../src/lib/ai/enrichment-prompts';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('❌ Missing Supabase environment variables');
	process.exit(1);
}

if (!GEMINI_API_KEY) {
	console.error('❌ Missing GOOGLE_API_KEY or GEMINI_API_KEY');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// =============================================================================
// Configuration
// =============================================================================

const MODELS = {
	accurate: 'gemini-2.5-flash',      // More accurate, ~$0.001/photo
	cheap: 'gemini-2.5-flash-lite'     // Cheaper, ~$0.00014/photo
};

const COSTS = {
	accurate: 0.001,
	cheap: 0.00014,
	verification_only: 0.0003  // Just sport verification
};

interface CLIArgs {
	albumKey?: string;
	lowConfidence: boolean;
	sportMismatch: boolean;
	all: boolean;
	limit: number;
	dryRun: boolean;
	confidenceThreshold: number;
}

function parseArgs(): CLIArgs {
	const args = process.argv.slice(2);
	let albumKey: string | undefined;
	let lowConfidence = false;
	let sportMismatch = false;
	let all = false;
	let limit = 50;
	let dryRun = args.includes('--dry-run');
	let confidenceThreshold = 0.8;

	for (const arg of args) {
		if (arg.startsWith('--album-key=')) {
			albumKey = arg.replace('--album-key=', '');
		} else if (arg === '--low-confidence') {
			lowConfidence = true;
		} else if (arg === '--sport-mismatch') {
			sportMismatch = true;
		} else if (arg === '--all') {
			all = true;
		} else if (arg.startsWith('--limit=')) {
			limit = parseInt(arg.replace('--limit=', ''));
		} else if (arg.startsWith('--confidence-threshold=')) {
			confidenceThreshold = parseFloat(arg.replace('--confidence-threshold=', ''));
		}
	}

	return { albumKey, lowConfidence, sportMismatch, all, limit, dryRun, confidenceThreshold };
}

const CONFIG = parseArgs();

// =============================================================================
// Photo Selection Queries
// =============================================================================

interface PhotoToReenrich {
	photo_id: string;
	image_key: string;
	album_name: string;
	album_key: string;
	sport_type: string;
	ai_confidence: number | null;
	ImageUrl: string;
}

async function getPhotosToReenrich(): Promise<PhotoToReenrich[]> {
	let query = supabase
		.from('photo_metadata')
		.select('photo_id, image_key, album_name, album_key, sport_type, ai_confidence, ImageUrl');

	if (CONFIG.albumKey) {
		console.log(`📁 Filtering by album: ${CONFIG.albumKey}`);
		query = query.eq('album_key', CONFIG.albumKey);
	}

	if (CONFIG.lowConfidence) {
		console.log(`📉 Filtering by low confidence (<${CONFIG.confidenceThreshold})`);
		query = query.lt('ai_confidence', CONFIG.confidenceThreshold);
	}

	if (CONFIG.sportMismatch) {
		console.log('🔄 Filtering by sport mismatch (non-volleyball in volleyball albums)');
		// Get volleyball albums first
		const { data: vbAlbums } = await supabase
			.from('albums_summary')
			.select('album_key')
			.eq('primary_sport', 'volleyball');

		if (vbAlbums && vbAlbums.length > 0) {
			const albumKeys = vbAlbums.map(a => a.album_key);
			query = query
				.in('album_key', albumKeys)
				.neq('sport_type', 'volleyball');
		}
	}

	query = query.limit(CONFIG.limit);

	const { data, error } = await query;

	if (error) {
		console.error('Error fetching photos:', error);
		return [];
	}

	return data || [];
}

// =============================================================================
// Two-Tier Enrichment
// =============================================================================

interface VerificationResult {
	sport_type: string;
	sport_confidence: number;
	evidence: string[];
	usedAccurateModel: boolean;
}

async function verifySport(imageUrl: string, albumContext?: EnrichmentContext): Promise<VerificationResult> {
	const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);
	const model = genAI.getGenerativeModel({ model: MODELS.accurate });

	// Build prompt with context
	let prompt = SPORT_VERIFICATION_PROMPT;
	if (albumContext?.albumName) {
		prompt = `ALBUM CONTEXT: "${albumContext.albumName}"\n\n${prompt}`;
	}

	try {
		// Fetch image
		const response = await fetch(imageUrl);
		const arrayBuffer = await response.arrayBuffer();
		const base64Data = Buffer.from(arrayBuffer).toString('base64');

		const result = await model.generateContent([
			prompt,
			{
				inlineData: {
					data: base64Data,
					mimeType: 'image/jpeg'
				}
			}
		]);

		const responseText = result.response.text();
		const jsonMatch = responseText.match(/\{[\s\S]*\}/);

		if (!jsonMatch) {
			throw new Error('Could not extract JSON from response');
		}

		const verification = JSON.parse(jsonMatch[0]) as SportVerificationResponse;

		return {
			sport_type: verification.sport_type,
			sport_confidence: verification.sport_confidence,
			evidence: verification.evidence,
			usedAccurateModel: true
		};
	} catch (error: any) {
		console.error(`     Error verifying sport: ${error.message}`);
		return {
			sport_type: 'volleyball', // Default to volleyball
			sport_confidence: 0.5,
			evidence: ['error during verification'],
			usedAccurateModel: true
		};
	}
}

interface EnrichmentResult {
	success: boolean;
	metadata?: CombinedResponse;
	verification?: VerificationResult;
	modelUsed: 'accurate' | 'cheap';
	cost: number;
	error?: string;
}

async function enrichWithTwoTierStrategy(
	imageUrl: string,
	currentSportType: string,
	albumContext?: EnrichmentContext
): Promise<EnrichmentResult> {
	// Step 1: Verify sport with accurate model
	const verification = await verifySport(imageUrl, albumContext);

	// Determine if we need full re-enrichment with accurate model
	const sportChanged = verification.sport_type !== currentSportType;
	const confidenceIsLow = verification.sport_confidence < CONFIG.confidenceThreshold;
	const useAccurateModel = sportChanged || confidenceIsLow;

	// Step 2: Full enrichment
	const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);
	const modelName = useAccurateModel ? MODELS.accurate : MODELS.cheap;
	const model = genAI.getGenerativeModel({ model: modelName });

	try {
		// Fetch image
		const response = await fetch(imageUrl);
		const arrayBuffer = await response.arrayBuffer();
		const base64Data = Buffer.from(arrayBuffer).toString('base64');

		// Build prompt - if sport is verified, use the locked prompt
		let prompt: string;
		if (verification.sport_confidence >= 0.9) {
			// High confidence - lock the sport type
			prompt = buildReenrichmentPrompt(verification.sport_type);
		} else {
			// Let the model decide
			prompt = buildCombinedPrompt(albumContext);
		}

		const result = await model.generateContent([
			prompt,
			{
				inlineData: {
					data: base64Data,
					mimeType: 'image/jpeg'
				}
			}
		]);

		const responseText = result.response.text();
		const jsonMatch = responseText.match(/\{[\s\S]*\}/);

		if (!jsonMatch) {
			throw new Error('Could not extract JSON from response');
		}

		const metadata = JSON.parse(jsonMatch[0]) as CombinedResponse;

		// Override sport_type if verification was high confidence
		if (verification.sport_confidence >= 0.9) {
			metadata.bucket1.sport_type = verification.sport_type;
		}

		const cost = COSTS.verification_only + (useAccurateModel ? COSTS.accurate : COSTS.cheap);

		return {
			success: true,
			metadata,
			verification,
			modelUsed: useAccurateModel ? 'accurate' : 'cheap',
			cost
		};
	} catch (error: any) {
		return {
			success: false,
			verification,
			modelUsed: useAccurateModel ? 'accurate' : 'cheap',
			cost: COSTS.verification_only,
			error: error.message
		};
	}
}

// =============================================================================
// Database Update
// =============================================================================

async function updatePhotoMetadata(photoId: string, metadata: CombinedResponse): Promise<boolean> {
	const { error } = await supabase
		.from('photo_metadata')
		.update({
			sport_type: metadata.bucket1.sport_type,
			play_type: metadata.bucket1.play_type,
			action_intensity: metadata.bucket1.action_intensity,
			photo_category: metadata.bucket1.photo_category,
			composition: metadata.bucket1.composition,
			time_of_day: metadata.bucket1.time_of_day,
			lighting: metadata.bucket1.lighting,
			color_temperature: metadata.bucket1.color_temperature,
			jersey_number: metadata.bucket1.jersey_number,
			emotion: metadata.bucket2.emotion,
			sharpness: metadata.bucket2.sharpness,
			composition_score: metadata.bucket2.composition_score,
			exposure_accuracy: metadata.bucket2.exposure_accuracy,
			emotional_impact: metadata.bucket2.emotional_impact,
			time_in_game: metadata.bucket2.time_in_game,
			ai_confidence: metadata.bucket2.ai_confidence,
			enriched_at: new Date().toISOString()
		})
		.eq('photo_id', photoId);

	if (error) {
		console.error(`Error updating photo ${photoId}:`, error);
		return false;
	}

	return true;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
	console.log('\n🔄 Two-Tier Re-enrichment with Sport Verification\n');
	console.log(`   Accurate Model: ${MODELS.accurate}`);
	console.log(`   Cheap Model: ${MODELS.cheap}`);
	console.log(`   Confidence Threshold: ${CONFIG.confidenceThreshold}`);
	if (CONFIG.dryRun) {
		console.log('   🧪 DRY RUN MODE - No changes will be saved\n');
	}

	// Get photos to process
	const photos = await getPhotosToReenrich();

	if (photos.length === 0) {
		console.log('✅ No photos found matching criteria');
		return;
	}

	console.log(`\n📸 Found ${photos.length} photos to process`);

	// Estimate costs
	const maxCost = photos.length * (COSTS.verification_only + COSTS.accurate);
	const minCost = photos.length * (COSTS.verification_only + COSTS.cheap);
	console.log(`💰 Estimated cost: $${minCost.toFixed(2)} - $${maxCost.toFixed(2)}\n`);

	let processed = 0;
	let updated = 0;
	let sportChanged = 0;
	let errors = 0;
	let totalCost = 0;
	let accurateModelUsed = 0;

	for (const photo of photos) {
		processed++;
		console.log(`\n[${processed}/${photos.length}] ${photo.image_key}`);
		console.log(`   Album: ${photo.album_name}`);
		console.log(`   Current: ${photo.sport_type} (confidence: ${photo.ai_confidence?.toFixed(2) || 'N/A'})`);

		// Build context from album
		const context: EnrichmentContext = {
			albumName: photo.album_name,
			usePortfolioContext: true
		};

		// Run two-tier enrichment
		const result = await enrichWithTwoTierStrategy(photo.ImageUrl, photo.sport_type, context);

		if (!result.success || !result.metadata) {
			console.log(`   ❌ Error: ${result.error}`);
			errors++;
			continue;
		}

		const newSport = result.metadata.bucket1.sport_type;
		const newConfidence = result.metadata.bucket2.ai_confidence;
		const changed = newSport !== photo.sport_type;

		console.log(`   Verified: ${result.verification?.sport_type} (${(result.verification?.sport_confidence || 0 * 100).toFixed(0)}% confidence)`);
		console.log(`   Evidence: ${result.verification?.evidence.slice(0, 2).join(', ')}`);
		console.log(`   Result: ${newSport} (confidence: ${newConfidence?.toFixed(2)})`);
		console.log(`   Model: ${result.modelUsed} | Cost: $${result.cost.toFixed(4)}`);

		if (changed) {
			console.log(`   ⚠️  SPORT CHANGED: ${photo.sport_type} → ${newSport}`);
			sportChanged++;
		}

		if (result.modelUsed === 'accurate') {
			accurateModelUsed++;
		}

		// Update database
		if (!CONFIG.dryRun) {
			const success = await updatePhotoMetadata(photo.photo_id, result.metadata);
			if (success) {
				console.log(`   ✅ Updated`);
				updated++;
			} else {
				console.log(`   ❌ Failed to update`);
				errors++;
			}
		} else {
			console.log(`   🧪 Would update (dry run)`);
			updated++;
		}

		totalCost += result.cost;

		// Rate limiting
		await new Promise(r => setTimeout(r, 200));
	}

	// Summary
	console.log('\n' + '='.repeat(60));
	console.log('📊 SUMMARY');
	console.log('='.repeat(60));
	console.log(`   Processed: ${processed}`);
	console.log(`   Updated: ${updated}`);
	console.log(`   Sport Changed: ${sportChanged}`);
	console.log(`   Errors: ${errors}`);
	console.log(`   Accurate Model Used: ${accurateModelUsed} (${((accurateModelUsed / processed) * 100).toFixed(0)}%)`);
	console.log(`   💰 Total Cost: $${totalCost.toFixed(2)}`);

	if (sportChanged > 0) {
		console.log(`\n⚠️  ${sportChanged} photos had their sport classification changed.`);
		console.log('   This indicates the original enrichment was inaccurate.');
	}

	console.log('\n✅ Re-enrichment complete!\n');
}

main().catch(error => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
