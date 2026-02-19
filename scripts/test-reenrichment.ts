#!/usr/bin/env node
/**
 * Test Re-enrichment with Before/After Comparison
 *
 * Captures state before and after re-enrichment, tracks costs,
 * and generates a comparison report.
 *
 * Usage:
 *   npx tsx scripts/test-reenrichment.ts --album-key=pHqw25
 *   npx tsx scripts/test-reenrichment.ts --album-key=pHqw25 --limit=10
 *   npx tsx scripts/test-reenrichment.ts --album-key=pHqw25 --dry-run
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

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

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !GEMINI_API_KEY) {
	console.error('❌ Missing environment variables');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// =============================================================================
// Configuration
// =============================================================================

const MODELS = {
	accurate: 'gemini-2.5-flash',
	cheap: 'gemini-2.5-flash-lite'
};

// Cost per 1M tokens (input/output averaged, image processing included)
const COST_PER_CALL = {
	'gemini-2.5-flash': 0.001,
	'gemini-2.5-flash-lite': 0.00014,
	verification: 0.0003
};

interface CLIArgs {
	albumKey: string;
	limit: number;
	dryRun: boolean;
	targetMisclassified: boolean;
}

function parseArgs(): CLIArgs {
	const args = process.argv.slice(2);
	let albumKey = '';
	let limit = 0; // 0 = no limit
	let dryRun = args.includes('--dry-run');
	let targetMisclassified = args.includes('--misclassified-only');

	for (const arg of args) {
		if (arg.startsWith('--album-key=')) {
			albumKey = arg.replace('--album-key=', '');
		} else if (arg.startsWith('--limit=')) {
			limit = parseInt(arg.replace('--limit=', ''));
		}
	}

	return { albumKey, limit, dryRun, targetMisclassified };
}

const CONFIG = parseArgs();

// =============================================================================
// Data Types
// =============================================================================

interface PhotoState {
	photo_id: string;
	image_key: string;
	sport_type: string;
	play_type: string | null;
	action_intensity: string | null;
	photo_category: string | null;
	ai_confidence: number | null;
	emotion: string | null;
	sharpness: number | null;
	ImageUrl: string;
}

interface CostTracker {
	estimated_verification: number;
	estimated_enrichment_cheap: number;
	estimated_enrichment_accurate: number;
	estimated_total: number;
	actual_verification: number;
	actual_enrichment: number;
	actual_total: number;
	api_calls: number;
}

interface TestResult {
	album_key: string;
	album_name: string;
	test_started: string;
	test_completed: string;
	before_state: {
		total_photos: number;
		sport_breakdown: Record<string, number>;
		avg_confidence: number | null;
		photos: PhotoState[];
	};
	after_state: {
		total_photos: number;
		sport_breakdown: Record<string, number>;
		avg_confidence: number | null;
		photos: PhotoState[];
	};
	changes: {
		sport_type_changed: number;
		play_type_changed: number;
		confidence_improved: number;
		photos_processed: number;
	};
	cost: CostTracker;
	photo_changes: Array<{
		photo_id: string;
		image_key: string;
		before: Partial<PhotoState>;
		after: Partial<PhotoState>;
		verification: {
			sport: string;
			confidence: number;
			evidence: string[];
		};
	}>;
}

// =============================================================================
// Capture State
// =============================================================================

async function captureAlbumState(albumKey: string): Promise<{ albumName: string; photos: PhotoState[] }> {
	const { data, error } = await supabase
		.from('photo_metadata')
		.select(`
			photo_id, image_key, sport_type, play_type, action_intensity,
			photo_category, ai_confidence, emotion, sharpness, ImageUrl, album_name
		`)
		.eq('album_key', albumKey)
		.order('image_key');

	if (error || !data) {
		console.error('Error fetching album:', error);
		return { albumName: '', photos: [] };
	}

	const albumName = data[0]?.album_name || 'Unknown';
	return {
		albumName,
		photos: data.map(p => ({
			photo_id: p.photo_id,
			image_key: p.image_key,
			sport_type: p.sport_type,
			play_type: p.play_type,
			action_intensity: p.action_intensity,
			photo_category: p.photo_category,
			ai_confidence: p.ai_confidence,
			emotion: p.emotion,
			sharpness: p.sharpness,
			ImageUrl: p.ImageUrl
		}))
	};
}

function calculateStats(photos: PhotoState[]): { sportBreakdown: Record<string, number>; avgConfidence: number | null } {
	const sportBreakdown: Record<string, number> = {};
	const confidences: number[] = [];

	for (const photo of photos) {
		sportBreakdown[photo.sport_type] = (sportBreakdown[photo.sport_type] || 0) + 1;
		if (photo.ai_confidence !== null) {
			confidences.push(photo.ai_confidence);
		}
	}

	const avgConfidence = confidences.length > 0
		? confidences.reduce((a, b) => a + b, 0) / confidences.length
		: null;

	return { sportBreakdown, avgConfidence };
}

// =============================================================================
// Re-enrichment Logic
// =============================================================================

async function verifySport(
	imageUrl: string,
	albumContext: EnrichmentContext,
	costTracker: CostTracker
): Promise<{ sport: string; confidence: number; evidence: string[] }> {
	const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);
	const model = genAI.getGenerativeModel({ model: MODELS.accurate });

	let prompt = SPORT_VERIFICATION_PROMPT;
	if (albumContext.albumName) {
		prompt = `ALBUM CONTEXT: "${albumContext.albumName}"\n\n${prompt}`;
	}

	try {
		const response = await fetch(imageUrl);
		const arrayBuffer = await response.arrayBuffer();
		const base64Data = Buffer.from(arrayBuffer).toString('base64');

		const result = await model.generateContent([
			prompt,
			{ inlineData: { data: base64Data, mimeType: 'image/jpeg' } }
		]);

		costTracker.actual_verification += COST_PER_CALL.verification;
		costTracker.api_calls++;

		const responseText = result.response.text();
		const jsonMatch = responseText.match(/\{[\s\S]*\}/);

		if (!jsonMatch) {
			throw new Error('No JSON in response');
		}

		const verification = JSON.parse(jsonMatch[0]) as SportVerificationResponse;
		return {
			sport: verification.sport_type,
			confidence: verification.sport_confidence,
			evidence: verification.evidence || []
		};
	} catch (error: any) {
		console.error(`     Verification error: ${error.message}`);
		return { sport: 'volleyball', confidence: 0.5, evidence: ['error'] };
	}
}

async function enrichPhoto(
	imageUrl: string,
	verifiedSport: string,
	sportConfidence: number,
	albumContext: EnrichmentContext,
	costTracker: CostTracker
): Promise<CombinedResponse | null> {
	const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);

	// Use accurate model if confidence is low
	const useAccurate = sportConfidence < 0.8;
	const modelName = useAccurate ? MODELS.accurate : MODELS.cheap;
	const model = genAI.getGenerativeModel({ model: modelName });

	// Build prompt - lock sport if high confidence
	const prompt = sportConfidence >= 0.9
		? buildReenrichmentPrompt(verifiedSport)
		: buildCombinedPrompt(albumContext);

	try {
		const response = await fetch(imageUrl);
		const arrayBuffer = await response.arrayBuffer();
		const base64Data = Buffer.from(arrayBuffer).toString('base64');

		const result = await model.generateContent([
			prompt,
			{ inlineData: { data: base64Data, mimeType: 'image/jpeg' } }
		]);

		costTracker.actual_enrichment += useAccurate
			? COST_PER_CALL['gemini-2.5-flash']
			: COST_PER_CALL['gemini-2.5-flash-lite'];
		costTracker.api_calls++;

		const responseText = result.response.text();
		const jsonMatch = responseText.match(/\{[\s\S]*\}/);

		if (!jsonMatch) {
			throw new Error('No JSON in response');
		}

		const metadata = JSON.parse(jsonMatch[0]) as CombinedResponse;

		// Override sport if verification was high confidence
		if (sportConfidence >= 0.9) {
			metadata.bucket1.sport_type = verifiedSport;
		}

		return metadata;
	} catch (error: any) {
		console.error(`     Enrichment error: ${error.message}`);
		return null;
	}
}

async function updatePhoto(photoId: string, metadata: CombinedResponse): Promise<boolean> {
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

	return !error;
}

// =============================================================================
// Main Test
// =============================================================================

async function runTest() {
	if (!CONFIG.albumKey) {
		console.error('Usage: npx tsx scripts/test-reenrichment.ts --album-key=ALBUM_KEY');
		process.exit(1);
	}

	console.log('\n🧪 RE-ENRICHMENT TEST WITH COST TRACKING\n');
	console.log('='.repeat(60));

	// Capture BEFORE state
	console.log('\n📸 Capturing BEFORE state...');
	const { albumName, photos: beforePhotos } = await captureAlbumState(CONFIG.albumKey);

	if (beforePhotos.length === 0) {
		console.error('❌ No photos found for album:', CONFIG.albumKey);
		process.exit(1);
	}

	const beforeStats = calculateStats(beforePhotos);

	console.log(`\n📁 Album: ${albumName}`);
	console.log(`   Key: ${CONFIG.albumKey}`);
	console.log(`   Photos: ${beforePhotos.length}`);
	console.log('\n📊 BEFORE State:');
	console.log('   Sport Breakdown:');
	Object.entries(beforeStats.sportBreakdown)
		.sort((a, b) => b[1] - a[1])
		.forEach(([sport, count]) => {
			const pct = ((count / beforePhotos.length) * 100).toFixed(1);
			console.log(`     ${sport}: ${count} (${pct}%)`);
		});
	console.log(`   Avg Confidence: ${beforeStats.avgConfidence?.toFixed(3) || 'N/A'}`);

	// Identify photos to process
	let photosToProcess = beforePhotos;

	// Option: Only target misclassified (non-volleyball in volleyball album)
	if (CONFIG.targetMisclassified) {
		photosToProcess = beforePhotos.filter(p => p.sport_type !== 'volleyball');
		console.log(`\n🎯 Targeting only misclassified photos: ${photosToProcess.length}`);
	}

	// Apply limit
	if (CONFIG.limit > 0 && CONFIG.limit < photosToProcess.length) {
		photosToProcess = photosToProcess.slice(0, CONFIG.limit);
		console.log(`\n🔢 Limited to: ${photosToProcess.length} photos`);
	}

	// Cost estimation
	const costTracker: CostTracker = {
		estimated_verification: photosToProcess.length * COST_PER_CALL.verification,
		estimated_enrichment_cheap: photosToProcess.length * COST_PER_CALL['gemini-2.5-flash-lite'],
		estimated_enrichment_accurate: photosToProcess.length * COST_PER_CALL['gemini-2.5-flash'],
		estimated_total: photosToProcess.length * (COST_PER_CALL.verification + COST_PER_CALL['gemini-2.5-flash-lite']),
		actual_verification: 0,
		actual_enrichment: 0,
		actual_total: 0,
		api_calls: 0
	};

	console.log('\n💰 COST ESTIMATES:');
	console.log(`   Verification only:     $${costTracker.estimated_verification.toFixed(4)}`);
	console.log(`   + Cheap enrichment:    $${(costTracker.estimated_verification + costTracker.estimated_enrichment_cheap).toFixed(4)}`);
	console.log(`   + Accurate enrichment: $${(costTracker.estimated_verification + costTracker.estimated_enrichment_accurate).toFixed(4)}`);
	console.log(`   Estimated (two-tier):  $${costTracker.estimated_total.toFixed(4)}`);

	if (CONFIG.dryRun) {
		console.log('\n🧪 DRY RUN - No changes will be made\n');
	}

	// Process photos
	console.log('\n🔄 Processing photos...\n');

	const photoChanges: TestResult['photo_changes'] = [];
	const context: EnrichmentContext = {
		albumName,
		usePortfolioContext: true
	};

	let sportChanged = 0;
	let playTypeChanged = 0;
	let confidenceImproved = 0;
	let processed = 0;

	for (const photo of photosToProcess) {
		processed++;
		const progress = `[${processed}/${photosToProcess.length}]`;

		console.log(`${progress} ${photo.image_key}`);
		console.log(`   Before: ${photo.sport_type} | conf: ${photo.ai_confidence?.toFixed(2) || 'N/A'}`);

		// Step 1: Verify sport
		const verification = await verifySport(photo.ImageUrl, context, costTracker);
		console.log(`   Verify: ${verification.sport} (${(verification.confidence * 100).toFixed(0)}%) - ${verification.evidence.slice(0, 2).join(', ')}`);

		// Step 2: Full enrichment
		const metadata = await enrichPhoto(
			photo.ImageUrl,
			verification.sport,
			verification.confidence,
			context,
			costTracker
		);

		if (!metadata) {
			console.log(`   ❌ Enrichment failed`);
			continue;
		}

		const newSport = metadata.bucket1.sport_type;
		const newConfidence = metadata.bucket2.ai_confidence;
		const newPlayType = metadata.bucket1.play_type;

		console.log(`   After:  ${newSport} | conf: ${newConfidence?.toFixed(2)} | play: ${newPlayType || 'N/A'}`);

		// Track changes
		const didSportChange = newSport !== photo.sport_type;
		const didPlayTypeChange = newPlayType !== photo.play_type;
		const didConfidenceImprove = newConfidence !== null &&
			(photo.ai_confidence === null || newConfidence > photo.ai_confidence);

		if (didSportChange) {
			sportChanged++;
			console.log(`   ⚠️  SPORT CHANGED: ${photo.sport_type} → ${newSport}`);
		}
		if (didPlayTypeChange) playTypeChanged++;
		if (didConfidenceImprove) confidenceImproved++;

		// Record change
		photoChanges.push({
			photo_id: photo.photo_id,
			image_key: photo.image_key,
			before: {
				sport_type: photo.sport_type,
				play_type: photo.play_type,
				ai_confidence: photo.ai_confidence
			},
			after: {
				sport_type: newSport,
				play_type: newPlayType,
				ai_confidence: newConfidence
			},
			verification: {
				sport: verification.sport,
				confidence: verification.confidence,
				evidence: verification.evidence
			}
		});

		// Update database
		if (!CONFIG.dryRun) {
			const success = await updatePhoto(photo.photo_id, metadata);
			console.log(`   ${success ? '✅ Updated' : '❌ Update failed'}`);
		}

		// Rate limiting
		await new Promise(r => setTimeout(r, 300));
	}

	// Calculate actual total cost
	costTracker.actual_total = costTracker.actual_verification + costTracker.actual_enrichment;

	// Capture AFTER state
	console.log('\n📸 Capturing AFTER state...');
	const { photos: afterPhotos } = await captureAlbumState(CONFIG.albumKey);
	const afterStats = calculateStats(afterPhotos);

	// Generate report
	const testResult: TestResult = {
		album_key: CONFIG.albumKey,
		album_name: albumName,
		test_started: new Date().toISOString(),
		test_completed: new Date().toISOString(),
		before_state: {
			total_photos: beforePhotos.length,
			sport_breakdown: beforeStats.sportBreakdown,
			avg_confidence: beforeStats.avgConfidence,
			photos: beforePhotos
		},
		after_state: {
			total_photos: afterPhotos.length,
			sport_breakdown: afterStats.sportBreakdown,
			avg_confidence: afterStats.avgConfidence,
			photos: afterPhotos
		},
		changes: {
			sport_type_changed: sportChanged,
			play_type_changed: playTypeChanged,
			confidence_improved: confidenceImproved,
			photos_processed: processed
		},
		cost: costTracker,
		photo_changes: photoChanges
	};

	// Print summary
	console.log('\n' + '='.repeat(60));
	console.log('📊 TEST RESULTS');
	console.log('='.repeat(60));

	console.log('\n📈 BEFORE vs AFTER:');
	console.log('   Sport Breakdown:');
	console.log('   BEFORE:');
	Object.entries(beforeStats.sportBreakdown)
		.sort((a, b) => b[1] - a[1])
		.forEach(([sport, count]) => console.log(`     ${sport}: ${count}`));
	console.log('   AFTER:');
	Object.entries(afterStats.sportBreakdown)
		.sort((a, b) => b[1] - a[1])
		.forEach(([sport, count]) => console.log(`     ${sport}: ${count}`));

	console.log(`\n   Avg Confidence: ${beforeStats.avgConfidence?.toFixed(3)} → ${afterStats.avgConfidence?.toFixed(3)}`);

	console.log('\n🔄 CHANGES:');
	console.log(`   Photos Processed: ${processed}`);
	console.log(`   Sport Type Changed: ${sportChanged}`);
	console.log(`   Play Type Changed: ${playTypeChanged}`);
	console.log(`   Confidence Improved: ${confidenceImproved}`);

	console.log('\n💰 COST ANALYSIS:');
	console.log(`   Estimated Total: $${costTracker.estimated_total.toFixed(4)}`);
	console.log(`   Actual Total:    $${costTracker.actual_total.toFixed(4)}`);
	console.log(`   Difference:      $${(costTracker.actual_total - costTracker.estimated_total).toFixed(4)}`);
	console.log(`   API Calls:       ${costTracker.api_calls}`);
	console.log(`   Cost per Photo:  $${(costTracker.actual_total / processed).toFixed(5)}`);

	// Save report
	if (!existsSync('.temp/reports')) {
		mkdirSync('.temp/reports', { recursive: true });
	}

	const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
	const reportPath = `.temp/reports/reenrich-test-${CONFIG.albumKey}-${dateStr}.json`;
	writeFileSync(reportPath, JSON.stringify(testResult, null, 2));
	console.log(`\n📄 Full report saved: ${reportPath}`);

	console.log('\n✅ Test complete!\n');
}

runTest().catch(error => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
