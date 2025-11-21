#!/usr/bin/env node
/**
 * Delta Enrichment: Jersey Numbers for Volleyball Only
 *
 * Cost-optimized solution to add jersey_number to volleyball photos only.
 *
 * Filters:
 * - sport_type = 'volleyball' (only volleyball photos)
 * - photo_category IN ('action', 'portrait') (jersey likely visible)
 * - jersey_number IS NULL (not already enriched)
 *
 * This reduces the enrichment scope from 20,234 photos to ~11,431 photos,
 * saving 44% on costs while targeting the photos that matter most.
 *
 * Usage:
 *   npx tsx scripts/enrich-delta-jersey-volleyball.ts
 *   npx tsx scripts/enrich-delta-jersey-volleyball.ts --limit 100
 *   npx tsx scripts/enrich-delta-jersey-volleyball.ts --dry-run
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });

import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// Configuration
// =============================================================================

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

const CONFIG = {
	dryRun: process.argv.includes('--dry-run'),
	limit: parseInt(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || '0') || undefined,
	batchSize: 5, // Conservative rate limiting
	costPerImage: 0.0035 // Gemini Flash vision cost
};

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('❌ Missing Supabase credentials');
	process.exit(1);
}

if (!GEMINI_API_KEY) {
	console.error('❌ Missing GOOGLE_API_KEY or GEMINI_API_KEY');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// =============================================================================
// Delta Enrichment Prompt (Jersey Number ONLY)
// =============================================================================

const JERSEY_NUMBER_PROMPT = `Analyze this volleyball photo and extract ONLY the jersey number.

**jersey_number** (number | null): Player's jersey number (if visible)
- Look for visible jersey numbers on volleyball uniforms
- Return the number as an integer
- Return NULL if:
  - Number not visible or obscured
  - Multiple players with different numbers (ambiguous)
  - Photo is too blurry to read number
  - No players visible with jerseys

CRITICAL: Only return a number if you're CONFIDENT it's correct.

Return ONLY JSON in this exact format:
{
  "jersey_number": 12
}

OR if not visible/uncertain:
{
  "jersey_number": null
}

NO explanations. NO markdown. ONLY JSON.`;

// =============================================================================
// Delta Enrichment
// =============================================================================

interface Photo {
	image_key: string;
	thumbnail_url: string | null;
	photo_category: string | null;
	sport_type: string | null;
}

interface JerseyNumberResponse {
	jersey_number: number | null;
}

async function extractJerseyNumber(imageUrl: string): Promise<number | null> {
	try {
		const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

		// Fetch image
		const response = await fetch(imageUrl);
		if (!response.ok) {
			throw new Error(`Failed to fetch image: ${response.statusText}`);
		}

		const imageBuffer = await response.arrayBuffer();
		const base64Image = Buffer.from(imageBuffer).toString('base64');

		// Generate analysis
		const result = await model.generateContent([
			JERSEY_NUMBER_PROMPT,
			{
				inlineData: {
					data: base64Image,
					mimeType: 'image/jpeg'
				}
			}
		]);

		const text = result.response.text();
		const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
		const parsed: JerseyNumberResponse = JSON.parse(cleaned);

		return parsed.jersey_number;
	} catch (error: any) {
		console.error(`   ⚠️  Extraction failed:`, error.message);
		return null;
	}
}

async function processDeltaEnrichment() {
	console.log('🏐 Starting Delta Enrichment: Jersey Numbers (Volleyball Only)\n');

	// Fetch volleyball photos that need jersey number enrichment
	let query = supabase
		.from('photo_metadata')
		.select('image_key, thumbnail_url, photo_category, sport_type')
		.eq('sport_type', 'volleyball') // ONLY volleyball
		.in('photo_category', ['action', 'portrait']) // Only categories where jersey likely visible
		.is('jersey_number', null); // Only photos without jersey number

	if (CONFIG.limit) {
		query = query.limit(CONFIG.limit);
	}

	const { data: photos, error } = await query;

	if (error) {
		console.error('❌ Failed to fetch photos:', error);
		process.exit(1);
	}

	if (!photos || photos.length === 0) {
		console.log('✅ No volleyball photos need jersey number enrichment!');
		return;
	}

	console.log(`📊 Volleyball Photos Analysis:`);
	console.log(`   Sport: volleyball only`);
	console.log(`   Categories: action, portrait`);
	console.log(`   Photos to process: ${photos.length.toLocaleString()}`);
	console.log(`   💰 Estimated cost: $${(photos.length * CONFIG.costPerImage).toFixed(2)}\n`);

	if (CONFIG.dryRun) {
		console.log('🏃 Dry run mode - no changes will be saved\n');
	}

	let processed = 0;
	let found = 0;
	let notFound = 0;
	let failed = 0;

	const startTime = Date.now();

	// Process in batches
	for (let i = 0; i < photos.length; i += CONFIG.batchSize) {
		const batch = photos.slice(i, i + CONFIG.batchSize);
		const batchNum = Math.floor(i / CONFIG.batchSize) + 1;
		const totalBatches = Math.ceil(photos.length / CONFIG.batchSize);

		console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${i + 1}-${Math.min(i + CONFIG.batchSize, photos.length)} of ${photos.length})`);

		await Promise.all(
			batch.map(async (photo) => {
				processed++;

				const imageUrl = photo.thumbnail_url;

				if (!imageUrl) {
					console.log(`   ⏭️  ${photo.image_key} - No image URL`);
					failed++;
					return;
				}

				console.log(`   🔄 ${photo.image_key} - Analyzing...`);

				const jerseyNumber = await extractJerseyNumber(imageUrl);

				if (jerseyNumber === null) {
					notFound++;
					console.log(`   ⚪ ${photo.image_key} - No jersey number detected`);
				} else {
					found++;
					console.log(`   ✅ ${photo.image_key} - Found jersey #${jerseyNumber}`);
				}

				if (!CONFIG.dryRun) {
					const { error: updateError } = await supabase
						.from('photo_metadata')
						.update({ jersey_number: jerseyNumber })
						.eq('image_key', photo.image_key);

					if (updateError) {
						console.error(`   ❌ ${photo.image_key} - Failed to save:`, updateError.message);
						failed++;
					}
				}
			})
		);

		// Progress update
		const elapsed = (Date.now() - startTime) / 1000;
		const rate = processed / elapsed;
		const remaining = photos.length - processed;
		const eta = remaining / rate;

		console.log(`\n   Progress: ${processed}/${photos.length} (${((processed / photos.length) * 100).toFixed(1)}%)`);
		console.log(`   Rate: ${rate.toFixed(1)} photos/sec | ETA: ${Math.ceil(eta / 60)} min`);

		// Rate limiting between batches
		if (i + CONFIG.batchSize < photos.length) {
			console.log('   ⏸️  Waiting 2s for rate limit...');
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}
	}

	const totalTime = (Date.now() - startTime) / 1000;

	// Summary
	console.log('\n' + '='.repeat(70));
	console.log('📊 Summary:');
	console.log(`   Total processed: ${processed.toLocaleString()}`);
	console.log(`   ✅ Found jersey numbers: ${found.toLocaleString()} (${((found / processed) * 100).toFixed(1)}%)`);
	console.log(`   ⚪ No jersey number: ${notFound.toLocaleString()} (${((notFound / processed) * 100).toFixed(1)}%)`);
	console.log(`   ❌ Failed: ${failed.toLocaleString()}`);
	console.log(`   ⏱️  Total time: ${Math.ceil(totalTime / 60)} minutes`);
	console.log(`   💰 Actual cost: $${(processed * CONFIG.costPerImage).toFixed(2)}`);
	console.log('='.repeat(70));

	// Export results for analysis
	const reportPath = `.temp/reports/jersey-enrichment-volleyball-${new Date().toISOString().split('T')[0]}.json`;
	const fs = await import('fs/promises');
	await fs.mkdir('.temp/reports', { recursive: true });
	await fs.writeFile(
		reportPath,
		JSON.stringify(
			{
				timestamp: new Date().toISOString(),
				total_processed: processed,
				found: found,
				not_found: notFound,
				failed: failed,
				total_time_seconds: totalTime,
				cost: processed * CONFIG.costPerImage
			},
			null,
			2
		)
	);
	console.log(`\n📄 Report saved: ${reportPath}\n`);
}

// =============================================================================
// Main
// =============================================================================

processDeltaEnrichment().catch((error) => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
