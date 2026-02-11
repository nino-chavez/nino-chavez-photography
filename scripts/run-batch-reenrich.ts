#!/usr/bin/env node
/**
 * Run Batch Re-enrichment with Agentic Vision
 *
 * Processes photos from batch-candidates.json using Gemini agentic vision.
 * Saves results and can optionally update the database.
 *
 * Usage:
 *   npx tsx scripts/run-batch-reenrich.ts --limit=50
 *   npx tsx scripts/run-batch-reenrich.ts --limit=100 --dry-run
 *   npx tsx scripts/run-batch-reenrich.ts --limit=50 --update-db
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, readFileSync, existsSync } from 'fs';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildAgenticPrompt, type AgenticEnrichmentContext } from '../src/lib/ai/enrichment-prompts';

// =============================================================================
// Configuration
// =============================================================================

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
	console.error('❌ Missing Supabase environment variables');
	process.exit(1);
}

if (!GEMINI_API_KEY) {
	console.error('❌ Missing GOOGLE_API_KEY or GEMINI_API_KEY');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const MODEL = 'gemini-2.0-flash'; // Or 'gemini-3-flash' when available
const OUTPUT_DIR = '.temp/pilot-gemini3';
// Check for max-batch first, fall back to regular batch
const MAX_BATCH_FILE = `${OUTPUT_DIR}/max-batch-candidates.json`;
const REGULAR_BATCH_FILE = `${OUTPUT_DIR}/batch-candidates.json`;
const CANDIDATES_FILE = existsSync(MAX_BATCH_FILE) ? MAX_BATCH_FILE : REGULAR_BATCH_FILE;

// =============================================================================
// CLI Arguments
// =============================================================================

interface CLIArgs {
	limit: number;
	dryRun: boolean;
	updateDb: boolean;
	startFrom: number;
}

function parseArgs(): CLIArgs {
	const args = process.argv.slice(2);
	return {
		limit: parseInt(args.find((a) => a.startsWith('--limit='))?.replace('--limit=', '') || '50'),
		dryRun: args.includes('--dry-run'),
		updateDb: args.includes('--update-db'),
		startFrom: parseInt(args.find((a) => a.startsWith('--start-from='))?.replace('--start-from=', '') || '0'),
	};
}

// =============================================================================
// Batch Candidate Type
// =============================================================================

interface BatchCandidate {
	photo_id: string;
	image_key: string;
	album_name: string;
	sport_type: string;
	play_type: string | null;
	ai_confidence: number | null;
	jersey_number: number | null;
	ThumbnailUrl: string | null;
	ImageUrl: string | null;
	photo_category: string;
	candidate_reason: string;
	priority: number;
}

interface EnrichmentResult {
	photo_id: string;
	image_key: string;
	candidate_reason: string;
	original: {
		sport_type: string;
		play_type: string | null;
		ai_confidence: number | null;
		jersey_number: number | null;
	};
	new_result: Record<string, unknown> | null;
	improvements: string[];
	error: string | null;
	processing_time_ms: number;
}

// =============================================================================
// Enrichment Function
// =============================================================================

async function enrichPhoto(photo: BatchCandidate): Promise<EnrichmentResult> {
	const startTime = Date.now();

	const result: EnrichmentResult = {
		photo_id: photo.photo_id,
		image_key: photo.image_key,
		candidate_reason: photo.candidate_reason,
		original: {
			sport_type: photo.sport_type,
			play_type: photo.play_type,
			ai_confidence: photo.ai_confidence,
			jersey_number: photo.jersey_number,
		},
		new_result: null,
		improvements: [],
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

		// Build context-aware prompt
		const context: AgenticEnrichmentContext = {
			albumName: photo.album_name,
			previousSportType: photo.sport_type,
			previousConfidence: photo.ai_confidence ?? undefined,
			focusOnJerseys: photo.candidate_reason === 'missing_jersey_action',
		};
		const prompt = buildAgenticPrompt(context);

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

		const newData = JSON.parse(jsonMatch[0]);
		result.new_result = newData;

		// Identify improvements
		if (photo.sport_type !== newData.sport_type) {
			result.improvements.push(`sport: ${photo.sport_type} → ${newData.sport_type}`);
		}
		if (newData.sport_confidence > (photo.ai_confidence || 0)) {
			result.improvements.push(
				`confidence: ${((photo.ai_confidence || 0) * 100).toFixed(0)}% → ${(newData.sport_confidence * 100).toFixed(0)}%`
			);
		}
		if (!photo.jersey_number && newData.jersey_numbers?.length > 0) {
			const jerseys = newData.jersey_numbers.map((j: { number: number }) => `#${j.number}`).join(', ');
			result.improvements.push(`jerseys detected: ${jerseys}`);
		}
		if (photo.play_type !== newData.play_type && newData.play_type) {
			result.improvements.push(`play: ${photo.play_type || 'null'} → ${newData.play_type}`);
		}
	} catch (error: unknown) {
		result.error = error instanceof Error ? error.message : String(error);
	}

	result.processing_time_ms = Date.now() - startTime;
	return result;
}

// =============================================================================
// Database Update
// =============================================================================

async function updateDatabase(result: EnrichmentResult): Promise<boolean> {
	if (!result.new_result) return false;

	const nr = result.new_result as Record<string, unknown>;

	// Extract primary jersey number (highest confidence)
	let primaryJersey: number | null = null;
	const jerseyNumbers = nr.jersey_numbers as Array<{ number: number; confidence: number }> | undefined;
	if (jerseyNumbers && jerseyNumbers.length > 0) {
		const best = jerseyNumbers.filter((j) => j.confidence >= 0.7).sort((a, b) => b.confidence - a.confidence)[0];
		primaryJersey = best?.number ?? null;
	}

	const updateData: Record<string, unknown> = {
		sport_type: nr.sport_type,
		play_type: nr.play_type || null,
		ai_confidence: nr.sport_confidence,
		action_intensity: nr.action_intensity,
		composition: nr.composition,
		lighting: nr.lighting,
		color_temperature: nr.color_temperature,
		emotion: nr.emotion,
	};

	// Only update jersey if we detected one
	if (primaryJersey !== null) {
		updateData.jersey_number = primaryJersey;
	}

	// Update quality scores if available
	const qa = nr.quality_assessment as { sharpness?: number; composition_score?: number; emotional_impact?: number } | undefined;
	if (qa) {
		if (qa.sharpness !== undefined) updateData.sharpness = qa.sharpness;
		if (qa.composition_score !== undefined) updateData.composition_score = qa.composition_score;
		if (qa.emotional_impact !== undefined) updateData.emotional_impact = qa.emotional_impact;
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

	console.log('🤖 Batch Re-enrichment with Agentic Vision\n');
	console.log(`Model: ${MODEL}`);
	console.log(`Limit: ${args.limit}`);
	console.log(`Dry run: ${args.dryRun}`);
	console.log(`Update DB: ${args.updateDb}`);
	console.log('');

	// Load candidates
	if (!existsSync(CANDIDATES_FILE)) {
		console.error(`❌ Candidates file not found: ${CANDIDATES_FILE}`);
		console.log('Run: npx tsx scripts/build-reenrich-batch.ts');
		process.exit(1);
	}

	const candidates: BatchCandidate[] = JSON.parse(readFileSync(CANDIDATES_FILE, 'utf-8'));
	const toProcess = candidates.slice(args.startFrom, args.startFrom + args.limit);

	console.log(`📋 Processing ${toProcess.length} photos (${args.startFrom} to ${args.startFrom + toProcess.length - 1})\n`);

	const results: EnrichmentResult[] = [];
	let successCount = 0;
	let improvementCount = 0;
	let jerseyDetections = 0;

	for (let i = 0; i < toProcess.length; i++) {
		const photo = toProcess[i];
		const progress = `[${i + 1}/${toProcess.length}]`;

		process.stdout.write(`${progress} ${photo.image_key} (${photo.candidate_reason})... `);

		if (args.dryRun) {
			console.log('SKIP (dry run)');
			continue;
		}

		const result = await enrichPhoto(photo);
		results.push(result);

		if (result.error) {
			console.log(`❌ ${result.error}`);
		} else {
			successCount++;
			if (result.improvements.length > 0) {
				improvementCount++;
				console.log(`✅ ${result.processing_time_ms}ms`);
				result.improvements.forEach((imp) => console.log(`   📈 ${imp}`));

				if (result.improvements.some((i) => i.includes('jerseys'))) {
					jerseyDetections++;
				}

				// Update database if requested
				if (args.updateDb) {
					const updated = await updateDatabase(result);
					if (updated) console.log('   💾 Database updated');
				}
			} else {
				console.log(`✅ ${result.processing_time_ms}ms (no changes)`);
			}
		}

		// Rate limiting - 1 second between requests
		if (i < toProcess.length - 1) {
			await new Promise((r) => setTimeout(r, 1000));
		}
	}

	// Save results
	const timestamp = Date.now();
	const outputPath = `${OUTPUT_DIR}/batch-results-${timestamp}.json`;
	writeFileSync(outputPath, JSON.stringify(results, null, 2));

	// Summary
	console.log('\n' + '='.repeat(50));
	console.log('BATCH COMPLETE');
	console.log('='.repeat(50));
	console.log(`Processed: ${results.length}`);
	console.log(`Successful: ${successCount}`);
	console.log(`With improvements: ${improvementCount}`);
	console.log(`Jersey detections: ${jerseyDetections}`);
	console.log(`Avg time: ${results.length > 0 ? (results.reduce((s, r) => s + r.processing_time_ms, 0) / results.length).toFixed(0) : 0}ms`);
	console.log('');
	console.log(`📁 Results saved: ${outputPath}`);

	if (!args.updateDb && improvementCount > 0) {
		console.log('');
		console.log('💡 To apply changes to database, run with --update-db');
	}
}

main().catch(console.error);
