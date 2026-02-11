#!/usr/bin/env node
/**
 * Pilot: Gemini 3 Flash Agentic Vision
 *
 * Tests the new agentic vision capabilities on photos that would most benefit:
 * - Low confidence scores (uncertain classifications)
 * - Missing jersey numbers (small detail detection)
 * - Potential sport misclassifications
 *
 * Usage:
 *   npx tsx scripts/pilot-gemini3-agentic.ts --find-candidates
 *   npx tsx scripts/pilot-gemini3-agentic.ts --run-pilot --limit=10
 *   npx tsx scripts/pilot-gemini3-agentic.ts --run-pilot --photo-ids=id1,id2,id3
 *   npx tsx scripts/pilot-gemini3-agentic.ts --compare-results
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
	buildAgenticPrompt,
	type AgenticEnrichmentContext,
} from '../src/lib/ai/enrichment-prompts';

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

// Model configurations
const MODELS = {
	current: 'gemini-2.0-flash-lite',
	agentic: 'gemini-2.0-flash', // Use 2.0 flash as proxy until 3.0 available
	// agentic: 'gemini-3-flash', // Uncomment when available
};

// Output directory
const OUTPUT_DIR = '.temp/pilot-gemini3';

// =============================================================================
// CLI Parsing
// =============================================================================

interface CLIArgs {
	findCandidates: boolean;
	runPilot: boolean;
	compareResults: boolean;
	limit: number;
	photoIds: string[];
	useAgentic: boolean;
}

function parseArgs(): CLIArgs {
	const args = process.argv.slice(2);

	return {
		findCandidates: args.includes('--find-candidates'),
		runPilot: args.includes('--run-pilot'),
		compareResults: args.includes('--compare-results'),
		limit: parseInt(args.find((a) => a.startsWith('--limit='))?.replace('--limit=', '') || '10'),
		photoIds: (args.find((a) => a.startsWith('--photo-ids='))?.replace('--photo-ids=', '') || '')
			.split(',')
			.filter(Boolean),
		useAgentic: args.includes('--agentic'),
	};
}

// =============================================================================
// Find Pilot Candidates
// =============================================================================

interface PilotCandidate {
	photo_id: string;
	image_key: string;
	album_name: string;
	sport_type: string;
	play_type: string | null;
	ai_confidence: number | null;
	jersey_number: number | null;
	ThumbnailUrl: string | null;
	ImageUrl: string | null;
	candidate_reason: string;
}

async function findPilotCandidates(): Promise<PilotCandidate[]> {
	console.log('🔍 Finding pilot candidates...\n');

	const candidates: PilotCandidate[] = [];

	// 1. Low confidence photos (AI was uncertain)
	console.log('Category 1: Low confidence photos (<0.7)');
	const { data: lowConf, error: e1 } = await supabase
		.from('photo_metadata')
		.select(
			'photo_id, image_key, album_name, sport_type, play_type, ai_confidence, jersey_number, ThumbnailUrl, ImageUrl'
		)
		.lt('ai_confidence', 0.7)
		.not('ai_confidence', 'is', null)
		.order('ai_confidence', { ascending: true })
		.limit(20);

	if (e1) console.error('  Error:', e1.message);
	else {
		console.log(`  Found: ${lowConf?.length || 0} photos`);
		lowConf?.forEach((p) => candidates.push({ ...p, candidate_reason: 'low_confidence' }));
	}

	// 2. Action photos missing jersey numbers (small detail detection)
	console.log('\nCategory 2: Action photos missing jersey numbers');
	const { data: missingJersey, error: e2 } = await supabase
		.from('photo_metadata')
		.select(
			'photo_id, image_key, album_name, sport_type, play_type, ai_confidence, jersey_number, ThumbnailUrl, ImageUrl'
		)
		.eq('photo_category', 'action')
		.is('jersey_number', null)
		.not('ai_confidence', 'is', null)
		.gte('ai_confidence', 0.7) // High confidence but missing jersey
		.order('ai_confidence', { ascending: false })
		.limit(20);

	if (e2) console.error('  Error:', e2.message);
	else {
		console.log(`  Found: ${missingJersey?.length || 0} photos`);
		missingJersey?.forEach((p) => candidates.push({ ...p, candidate_reason: 'missing_jersey' }));
	}

	// 3. Sport mismatches (non-volleyball in volleyball albums)
	console.log('\nCategory 3: Potential sport misclassifications');
	const { data: mismatch, error: e3 } = await supabase
		.from('photo_metadata')
		.select(
			'photo_id, image_key, album_name, sport_type, play_type, ai_confidence, jersey_number, ThumbnailUrl, ImageUrl'
		)
		.neq('sport_type', 'volleyball')
		.ilike('album_name', '%volleyball%')
		.limit(20);

	if (e3) console.error('  Error:', e3.message);
	else {
		console.log(`  Found: ${mismatch?.length || 0} photos`);
		mismatch?.forEach((p) => candidates.push({ ...p, candidate_reason: 'sport_mismatch' }));
	}

	// Dedupe by photo_id
	const seen = new Set<string>();
	const unique = candidates.filter((c) => {
		if (seen.has(c.photo_id)) return false;
		seen.add(c.photo_id);
		return true;
	});

	// Summary stats
	console.log('\n' + '='.repeat(60));
	console.log('PILOT CANDIDATE SUMMARY');
	console.log('='.repeat(60));
	console.log(`Total unique candidates: ${unique.length}`);
	console.log(`  - Low confidence: ${unique.filter((c) => c.candidate_reason === 'low_confidence').length}`);
	console.log(`  - Missing jersey: ${unique.filter((c) => c.candidate_reason === 'missing_jersey').length}`);
	console.log(`  - Sport mismatch: ${unique.filter((c) => c.candidate_reason === 'sport_mismatch').length}`);

	// Show samples
	console.log('\n📸 Sample candidates:');
	unique.slice(0, 10).forEach((p, i) => {
		console.log(
			`  ${i + 1}. ${p.image_key} [${p.candidate_reason}]`
		);
		console.log(
			`     sport=${p.sport_type} play=${p.play_type || 'null'} conf=${p.ai_confidence?.toFixed(2) || 'null'} jersey=${p.jersey_number || 'null'}`
		);
	});

	// Save candidates to file
	if (!existsSync(OUTPUT_DIR)) {
		mkdirSync(OUTPUT_DIR, { recursive: true });
	}

	const outputPath = `${OUTPUT_DIR}/candidates.json`;
	writeFileSync(outputPath, JSON.stringify(unique, null, 2));
	console.log(`\n✅ Saved ${unique.length} candidates to ${outputPath}`);

	return unique;
}

// =============================================================================
// Agentic Vision Prompt (Now imported from enrichment-prompts.ts)
// =============================================================================

// The agentic prompt is now built using buildAgenticPrompt() from enrichment-prompts.ts
// This allows for context-aware prompt generation with album hints, previous enrichment data, etc.

// =============================================================================
// Run Pilot Enrichment
// =============================================================================

interface EnrichmentResult {
	photo_id: string;
	image_key: string;
	model: string;
	original: {
		sport_type: string;
		play_type: string | null;
		ai_confidence: number | null;
		jersey_number: number | null;
	};
	new_result: {
		sport_type: string;
		sport_confidence: number;
		sport_evidence: string[];
		play_type: string;
		play_confidence: number;
		jersey_numbers: Array<{ number: number; confidence: number; notes: string }>;
		quality_assessment: {
			sharpness: number;
			composition_score: number;
			emotional_impact: number;
		};
		agentic_notes: string;
	} | null;
	error: string | null;
	processing_time_ms: number;
}

async function enrichWithAgenticVision(
	photo: PilotCandidate,
	model: string
): Promise<EnrichmentResult> {
	const startTime = Date.now();

	const result: EnrichmentResult = {
		photo_id: photo.photo_id,
		image_key: photo.image_key,
		model,
		original: {
			sport_type: photo.sport_type,
			play_type: photo.play_type,
			ai_confidence: photo.ai_confidence,
			jersey_number: photo.jersey_number,
		},
		new_result: null,
		error: null,
		processing_time_ms: 0,
	};

	try {
		// Fetch image from URL
		const imageUrl = photo.ImageUrl || photo.ThumbnailUrl;
		if (!imageUrl) {
			throw new Error('No image URL available');
		}

		console.log(`  Fetching image: ${imageUrl.substring(0, 80)}...`);
		const imageResponse = await fetch(imageUrl);
		if (!imageResponse.ok) {
			throw new Error(`Failed to fetch image: ${imageResponse.status}`);
		}

		const imageBuffer = await imageResponse.arrayBuffer();
		const base64Data = Buffer.from(imageBuffer).toString('base64');

		// Build context-aware agentic prompt
		const agenticContext: AgenticEnrichmentContext = {
			albumName: photo.album_name,
			previousSportType: photo.sport_type,
			previousConfidence: photo.ai_confidence ?? undefined,
			focusOnJerseys: photo.candidate_reason === 'missing_jersey',
		};
		const prompt = buildAgenticPrompt(agenticContext);

		// Call Gemini
		const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);
		const genModel = genAI.getGenerativeModel({ model });

		const response = await genModel.generateContent([
			prompt,
			{
				inlineData: {
					data: base64Data,
					mimeType: 'image/jpeg',
				},
			},
		]);

		const responseText = response.response.text();

		// Extract JSON
		const jsonMatch = responseText.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			throw new Error(`Could not extract JSON: ${responseText.substring(0, 200)}`);
		}

		result.new_result = JSON.parse(jsonMatch[0]);
	} catch (error: unknown) {
		result.error = error instanceof Error ? error.message : String(error);
	}

	result.processing_time_ms = Date.now() - startTime;
	return result;
}

async function runPilot(candidates: PilotCandidate[], limit: number): Promise<void> {
	console.log(`\n🚀 Running pilot on ${Math.min(limit, candidates.length)} photos...\n`);

	const results: EnrichmentResult[] = [];
	const photosToProcess = candidates.slice(0, limit);

	for (let i = 0; i < photosToProcess.length; i++) {
		const photo = photosToProcess[i];
		console.log(`\n[${i + 1}/${photosToProcess.length}] Processing: ${photo.image_key}`);
		console.log(`  Reason: ${photo.candidate_reason}`);
		console.log(`  Current: sport=${photo.sport_type} conf=${photo.ai_confidence?.toFixed(2)}`);

		const result = await enrichWithAgenticVision(photo, MODELS.agentic);
		results.push(result);

		if (result.error) {
			console.log(`  ❌ Error: ${result.error}`);
		} else if (result.new_result) {
			const nr = result.new_result;
			console.log(`  ✅ New result (${result.processing_time_ms}ms):`);
			console.log(`     sport=${nr.sport_type} (${(nr.sport_confidence * 100).toFixed(0)}%)`);
			console.log(`     evidence: ${nr.sport_evidence?.slice(0, 2).join(', ')}`);
			console.log(`     play=${nr.play_type} (${(nr.play_confidence * 100).toFixed(0)}%)`);
			if (nr.jersey_numbers?.length > 0) {
				console.log(`     jerseys: ${nr.jersey_numbers.map((j) => `#${j.number}`).join(', ')}`);
			}

			// Highlight improvements
			if (photo.sport_type !== nr.sport_type) {
				console.log(`     🔄 SPORT CHANGED: ${photo.sport_type} → ${nr.sport_type}`);
			}
			if (!photo.jersey_number && nr.jersey_numbers?.length > 0) {
				console.log(`     🆕 JERSEY DETECTED: ${nr.jersey_numbers[0].number}`);
			}
			if (photo.ai_confidence && nr.sport_confidence > photo.ai_confidence) {
				console.log(
					`     📈 CONFIDENCE UP: ${(photo.ai_confidence * 100).toFixed(0)}% → ${(nr.sport_confidence * 100).toFixed(0)}%`
				);
			}
		}

		// Rate limiting
		await new Promise((r) => setTimeout(r, 1000));
	}

	// Save results
	const outputPath = `${OUTPUT_DIR}/pilot-results-${Date.now()}.json`;
	writeFileSync(outputPath, JSON.stringify(results, null, 2));
	console.log(`\n✅ Saved results to ${outputPath}`);

	// Summary
	printPilotSummary(results);
}

function printPilotSummary(results: EnrichmentResult[]): void {
	console.log('\n' + '='.repeat(60));
	console.log('PILOT RESULTS SUMMARY');
	console.log('='.repeat(60));

	const successful = results.filter((r) => r.new_result);
	const failed = results.filter((r) => r.error);

	console.log(`Total processed: ${results.length}`);
	console.log(`Successful: ${successful.length}`);
	console.log(`Failed: ${failed.length}`);

	if (successful.length > 0) {
		// Sport changes
		const sportChanges = successful.filter(
			(r) => r.new_result && r.original.sport_type !== r.new_result.sport_type
		);
		console.log(`\nSport type changes: ${sportChanges.length}`);
		sportChanges.forEach((r) => {
			console.log(`  ${r.image_key}: ${r.original.sport_type} → ${r.new_result?.sport_type}`);
		});

		// Jersey detections
		const jerseyDetected = successful.filter(
			(r) => !r.original.jersey_number && r.new_result?.jersey_numbers?.length
		);
		console.log(`\nNew jersey detections: ${jerseyDetected.length}`);
		jerseyDetected.forEach((r) => {
			const jerseys = r.new_result?.jersey_numbers?.map((j) => `#${j.number}`).join(', ');
			console.log(`  ${r.image_key}: ${jerseys}`);
		});

		// Confidence improvements
		const confImproved = successful.filter(
			(r) =>
				r.original.ai_confidence &&
				r.new_result &&
				r.new_result.sport_confidence > r.original.ai_confidence
		);
		console.log(`\nConfidence improvements: ${confImproved.length}`);

		// Average processing time
		const avgTime = successful.reduce((sum, r) => sum + r.processing_time_ms, 0) / successful.length;
		console.log(`\nAverage processing time: ${avgTime.toFixed(0)}ms`);
	}
}

// =============================================================================
// Compare Results
// =============================================================================

async function compareResults(): Promise<void> {
	console.log('📊 Comparing pilot results...\n');

	// Find most recent results file
	const { readdirSync } = await import('fs');
	const files = readdirSync(OUTPUT_DIR).filter((f) => f.startsWith('pilot-results-'));

	if (files.length === 0) {
		console.log('No pilot results found. Run --run-pilot first.');
		return;
	}

	const latestFile = files.sort().pop()!;
	const results: EnrichmentResult[] = JSON.parse(
		readFileSync(`${OUTPUT_DIR}/${latestFile}`, 'utf-8')
	);

	console.log(`Analyzing: ${latestFile}`);
	printPilotSummary(results);

	// Generate CSV for detailed review
	const csvRows = [
		[
			'photo_id',
			'image_key',
			'candidate_reason',
			'orig_sport',
			'new_sport',
			'sport_changed',
			'orig_confidence',
			'new_confidence',
			'conf_improved',
			'orig_jersey',
			'new_jerseys',
			'jersey_detected',
			'processing_ms',
		].join(','),
	];

	results.forEach((r) => {
		const nr = r.new_result;
		csvRows.push(
			[
				r.photo_id,
				r.image_key,
				'', // Would need to join with candidates
				r.original.sport_type,
				nr?.sport_type || '',
				r.original.sport_type !== nr?.sport_type ? 'YES' : '',
				r.original.ai_confidence?.toFixed(2) || '',
				nr?.sport_confidence?.toFixed(2) || '',
				nr && r.original.ai_confidence && nr.sport_confidence > r.original.ai_confidence
					? 'YES'
					: '',
				r.original.jersey_number || '',
				nr?.jersey_numbers?.map((j) => j.number).join(';') || '',
				!r.original.jersey_number && nr?.jersey_numbers?.length ? 'YES' : '',
				r.processing_time_ms.toString(),
			].join(',')
		);
	});

	const csvPath = `${OUTPUT_DIR}/pilot-comparison-${Date.now()}.csv`;
	writeFileSync(csvPath, csvRows.join('\n'));
	console.log(`\n📄 Detailed CSV saved: ${csvPath}`);
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
	const args = parseArgs();

	console.log('🧪 Gemini 3 Flash Agentic Vision Pilot\n');
	console.log(`Using model: ${MODELS.agentic}`);
	console.log(`Output directory: ${OUTPUT_DIR}\n`);

	if (!existsSync(OUTPUT_DIR)) {
		mkdirSync(OUTPUT_DIR, { recursive: true });
	}

	if (args.findCandidates) {
		await findPilotCandidates();
	} else if (args.runPilot) {
		// Load candidates
		let candidates: PilotCandidate[];

		if (args.photoIds.length > 0) {
			// Fetch specific photos
			const { data, error } = await supabase
				.from('photo_metadata')
				.select(
					'photo_id, image_key, album_name, sport_type, play_type, ai_confidence, jersey_number, ThumbnailUrl, ImageUrl'
				)
				.in('photo_id', args.photoIds);

			if (error || !data) {
				console.error('Failed to fetch specified photos:', error);
				return;
			}
			candidates = data.map((p) => ({ ...p, candidate_reason: 'specified' }));
		} else {
			// Load from candidates file or generate
			const candidatesPath = `${OUTPUT_DIR}/candidates.json`;
			if (existsSync(candidatesPath)) {
				candidates = JSON.parse(readFileSync(candidatesPath, 'utf-8'));
				console.log(`Loaded ${candidates.length} candidates from ${candidatesPath}`);
			} else {
				candidates = await findPilotCandidates();
			}
		}

		await runPilot(candidates, args.limit);
	} else if (args.compareResults) {
		await compareResults();
	} else {
		console.log('Usage:');
		console.log('  --find-candidates   Find photos that would benefit from agentic vision');
		console.log('  --run-pilot         Run enrichment on candidates');
		console.log('    --limit=N         Limit number of photos (default: 10)');
		console.log('    --photo-ids=a,b   Test specific photo IDs');
		console.log('  --compare-results   Analyze pilot results');
	}
}

main().catch(console.error);
