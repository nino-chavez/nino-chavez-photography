#!/usr/bin/env node
/**
 * Enrich Local Photos with AI Vision
 *
 * Analyzes photos using Gemini and writes enriched metadata to EXIF.
 * Use this before uploading to SmugMug for new albums.
 *
 * Usage:
 *   npx tsx scripts/enrich-local-photos.ts /path/to/photos
 *   npx tsx scripts/enrich-local-photos.ts /path/to/photos --dry-run
 *   npx tsx scripts/enrich-local-photos.ts /path/to/photos --overwrite
 *   npx tsx scripts/enrich-local-photos.ts /path/to/photos --album-name="DGN vs Plainfield Volleyball"
 *   npx tsx scripts/enrich-local-photos.ts /path/to/photos --album-name="Tournament" --album-sport="volleyball"
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import { GoogleGenerativeAI } from '@google/generative-ai';
import { readdir } from 'fs/promises';
import { readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import {
	buildCombinedPrompt,
	type CombinedResponse,
	type EnrichmentContext
} from '../src/lib/ai/enrichment-prompts';

// =============================================================================
// CLI Argument Parsing
// =============================================================================

function parseArgs(): {
	photoDir: string;
	albumName?: string;
	albumSport?: string;
	dryRun: boolean;
	overwrite: boolean;
} {
	const args = process.argv.slice(2);
	let photoDir = '';
	let albumName: string | undefined;
	let albumSport: string | undefined;
	const dryRun = args.includes('--dry-run');
	const overwrite = args.includes('--overwrite');

	for (const arg of args) {
		if (arg.startsWith('--album-name=')) {
			albumName = arg.replace('--album-name=', '').replace(/^["']|["']$/g, '');
		} else if (arg.startsWith('--album-sport=')) {
			albumSport = arg.replace('--album-sport=', '').replace(/^["']|["']$/g, '');
		} else if (!arg.startsWith('--')) {
			photoDir = arg;
		}
	}

	return { photoDir, albumName, albumSport, dryRun, overwrite };
}

// =============================================================================
// Configuration
// =============================================================================

const GEMINI_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash-lite'; // Cheap and effective

const parsedArgs = parseArgs();

const CONFIG = {
	dryRun: parsedArgs.dryRun,
	overwrite: parsedArgs.overwrite,
	albumName: parsedArgs.albumName,
	albumSport: parsedArgs.albumSport,
	concurrency: 10,
	costPerImage: 0.00014 // Gemini 2.0 Flash Lite
};

if (!GEMINI_API_KEY) {
	console.error('❌ Missing GOOGLE_API_KEY or GEMINI_API_KEY environment variable');
	process.exit(1);
}

// =============================================================================
// AI Enrichment
// =============================================================================

interface EnrichmentResult {
	success: boolean;
	metadata?: CombinedResponse;
	error?: string;
	cost: number;
}

async function enrichPhoto(photoPath: string, context?: EnrichmentContext): Promise<EnrichmentResult> {
	try {
		const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);
		const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

		// Read photo as base64 using native Node (no shell spawn)
		const base64Data = readFileSync(photoPath).toString('base64');

		// Build prompt with context (album name improves sport detection accuracy)
		const prompt = buildCombinedPrompt(context);

		// Call Gemini with context-aware prompt
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

		// Extract JSON from response
		const jsonMatch = responseText.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			throw new Error(`Could not extract JSON from response: ${responseText.substring(0, 100)}`);
		}

		const metadata = JSON.parse(jsonMatch[0]) as CombinedResponse;

		return {
			success: true,
			metadata,
			cost: CONFIG.costPerImage
		};
	} catch (error: any) {
		return {
			success: false,
			error: error.message,
			cost: CONFIG.costPerImage
		};
	}
}

// =============================================================================
// EXIF Writing
// =============================================================================

function writeMetadataToExif(photoPath: string, metadata: CombinedResponse): void {
	const bucket1 = metadata.bucket1;
	const bucket2 = metadata.bucket2;

	// Build keyword array
	const keywords: string[] = [];

	// Add structured metadata as keywords (with null safety)
	if (bucket1.play_type) keywords.push(`play_${bucket1.play_type}`);
	if (bucket1.action_intensity) keywords.push(`intensity_${bucket1.action_intensity}`);
	if (bucket1.sport_type) keywords.push(`sport_${bucket1.sport_type}`);
	if (bucket1.photo_category) keywords.push(`category_${bucket1.photo_category}`);
	if (bucket1.composition) keywords.push(`composition_${bucket1.composition}`);
	if (bucket1.time_of_day) keywords.push(`time_${bucket1.time_of_day}`);
	if (bucket1.lighting) keywords.push(`lighting_${bucket1.lighting}`);
	if (bucket1.color_temperature) keywords.push(`color_${bucket1.color_temperature}`);

	// Add bucket2 data (with null safety)
	if (bucket2.emotion) keywords.push(`emotion_${bucket2.emotion}`);
	if (bucket2.sharpness != null) keywords.push(`sharpness_${bucket2.sharpness.toFixed(1)}`);
	if (bucket2.composition_score != null) keywords.push(`composition_score_${bucket2.composition_score.toFixed(1)}`);
	if (bucket2.exposure_accuracy != null) keywords.push(`exposure_${bucket2.exposure_accuracy.toFixed(1)}`);
	if (bucket2.emotional_impact != null) keywords.push(`emotional_impact_${bucket2.emotional_impact.toFixed(1)}`);
	if (bucket2.time_in_game) keywords.push(`game_time_${bucket2.time_in_game}`);

	// Portfolio flags (with null safety)
	const sharpness = bucket2.sharpness ?? 0;
	const compositionScore = bucket2.composition_score ?? 0;
	const emotionalImpact = bucket2.emotional_impact ?? 0;
	const exposureAccuracy = bucket2.exposure_accuracy ?? 0;

	if (sharpness >= 8.5 && compositionScore >= 8.5 && emotionalImpact >= 8.5) {
		keywords.push('portfolio_worthy');
	}
	if (sharpness >= 9.0 && exposureAccuracy >= 8.5) {
		keywords.push('print_ready');
	}
	keywords.push('social_media_optimized');

	// Generate title
	const title = generateTitle(bucket1, bucket2);

	// Write to EXIF using spawnSync to avoid shell buffer issues
	const keywordString = keywords.join(',');
	const args = [
		'-overwrite_original',
		`-Title=${title}`,
		`-Keywords=${keywordString}`,
		`-Subject=${keywordString}`,
		photoPath
	];

	const result = spawnSync('exiftool', args, { stdio: 'inherit' });
	if (result.error) {
		throw result.error;
	}
}

function generateTitle(bucket1: any, bucket2: any): string {
	const playType = bucket1.play_type ? bucket1.play_type.replace('_', ' ') : 'action';
	const sport = bucket1.sport_type || 'volleyball';
	const intensity = bucket1.action_intensity || 'moderate';

	const titleParts = [
		sport.charAt(0).toUpperCase() + sport.slice(1),
		playType.charAt(0).toUpperCase() + playType.slice(1)
	];

	if (intensity === 'peak') {
		titleParts.push('- Peak Action');
	} else if (bucket2.emotional_impact >= 8.5 && bucket2.emotion) {
		titleParts.push(`- ${bucket2.emotion.charAt(0).toUpperCase() + bucket2.emotion.slice(1)}`);
	}

	return titleParts.join(' ');
}

// =============================================================================
// Main Workflow
// =============================================================================

async function main() {
	const photoDir = parsedArgs.photoDir;

	if (!photoDir) {
		console.error('Usage: npx tsx scripts/enrich-local-photos.ts <photo-directory> [options]');
		console.error('');
		console.error('Options:');
		console.error('  --dry-run           Preview without making changes');
		console.error('  --overwrite         Re-enrich already processed photos');
		console.error('  --album-name=NAME   Album name for context (improves sport detection)');
		console.error('  --album-sport=SPORT Known sport type (volleyball, basketball, etc.)');
		console.error('');
		console.error('Examples:');
		console.error('  npx tsx scripts/enrich-local-photos.ts /path/to/photos');
		console.error('  npx tsx scripts/enrich-local-photos.ts /path/to/photos --dry-run');
		console.error('  npx tsx scripts/enrich-local-photos.ts /path/to/photos --album-name="DGN Volleyball"');
		process.exit(1);
	}

	// Build enrichment context from CLI args
	const enrichmentContext: EnrichmentContext = {
		albumName: CONFIG.albumName,
		albumSport: CONFIG.albumSport,
		usePortfolioContext: true
	};

	console.log('\n🎨 Enriching Local Photos with AI Vision\n');
	console.log(`📂 Directory: ${photoDir}`);
	console.log(`🤖 Model: ${GEMINI_MODEL}`);
	console.log(`⚡ Concurrency: ${CONFIG.concurrency}`);
	if (CONFIG.albumName) {
		console.log(`📁 Album Context: ${CONFIG.albumName}`);
	}
	if (CONFIG.albumSport) {
		console.log(`🏐 Known Sport: ${CONFIG.albumSport}`);
	}
	if (CONFIG.dryRun) {
		console.log('🧪 DRY RUN MODE - No changes will be made\n');
	}

	// Get all photos
	const files = await readdir(photoDir);
	const photos = files.filter(f => /\.(jpg|jpeg)$/i.test(f));

	if (photos.length === 0) {
		console.error('❌ No photos found in directory');
		process.exit(1);
	}

	console.log(`\n📸 Found ${photos.length} photos`);
	console.log(`💰 Estimated cost: $${(photos.length * CONFIG.costPerImage).toFixed(2)}\n`);

	let enriched = 0;
	let errors = 0;
	let totalCost = 0;
	let portfolioWorthy = 0;

	// Process in batches
	for (let i = 0; i < photos.length; i += CONFIG.concurrency) {
		const batch = photos.slice(i, i + CONFIG.concurrency);
		const batchPromises = batch.map(async (photo) => {
			const photoPath = join(photoDir, photo);

			console.log(`  🔍 Analyzing: ${photo}`);

			// Check if already enriched (using spawnSync to avoid buffer issues)
			if (!CONFIG.overwrite) {
				try {
					const checkResult = spawnSync('exiftool', ['-Keywords', photoPath], { encoding: 'utf-8' });
					const exifCheck = checkResult.stdout || '';
					if (exifCheck.includes('play_') || exifCheck.includes('portfolio_worthy')) {
						console.log(`     ⏭️  Already enriched (use --overwrite to re-enrich)`);
						return;
					}
				} catch {
					// No keywords, proceed
				}
			}

			// Enrich with AI (pass album context for better sport detection)
			const result = await enrichPhoto(photoPath, enrichmentContext);

			if (!result.success) {
				console.error(`     ❌ Error: ${result.error}`);
				errors++;
				return;
			}

			if (!result.metadata) {
				console.error(`     ❌ No metadata returned`);
				errors++;
				return;
			}

			// Write to EXIF
			if (!CONFIG.dryRun) {
				writeMetadataToExif(photoPath, result.metadata);
			}

			// Display summary (with null safety)
			const sharpness = result.metadata.bucket2.sharpness ?? 0;
			const compositionScore = result.metadata.bucket2.composition_score ?? 0;
			const emotionalImpact = result.metadata.bucket2.emotional_impact ?? 0;
			const quality = (sharpness + compositionScore + emotionalImpact) / 3;

			const isPortfolioWorthy =
				sharpness >= 8.5 &&
				compositionScore >= 8.5 &&
				emotionalImpact >= 8.5;

			if (isPortfolioWorthy) portfolioWorthy++;

			console.log(`     ⭐ Quality: ${quality.toFixed(1)}/10${isPortfolioWorthy ? ' (portfolio-worthy)' : ''}`);
			console.log(
				`     🏐 ${result.metadata.bucket1.play_type || 'N/A'} | ${result.metadata.bucket1.action_intensity} intensity`
			);

			enriched++;
			totalCost += result.cost;
		});

		await Promise.all(batchPromises);

		// Progress update
		console.log(`\n📊 Progress: ${Math.min(i + CONFIG.concurrency, photos.length)}/${photos.length}\n`);
	}

	// Final summary
	console.log('\n' + '='.repeat(60));
	console.log('✅ Enrichment Complete!\n');
	console.log(`   Total: ${photos.length}`);
	console.log(`   Enriched: ${enriched}`);
	console.log(`   Errors: ${errors}`);
	console.log(`   Portfolio Worthy: ${portfolioWorthy} (${((portfolioWorthy / photos.length) * 100).toFixed(0)}%)`);
	console.log(`   💵 Total Cost: $${totalCost.toFixed(2)}`);
	console.log('\n✨ Next step: Upload to SmugMug');
	console.log(`   npx tsx scripts/upload-to-smugmug.ts ${photoDir}`);
}

main().catch((error) => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
