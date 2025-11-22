#!/usr/bin/env node
/**
 * Delta Enrichment: Jersey Numbers (2025 Volleyball Only)
 *
 * Cost-optimized enrichment targeting only 2025 volleyball photos
 * where jersey numbers are likely visible (action/portrait categories).
 *
 * Filters:
 * - Sport: Volleyball only
 * - Year: 2025 (photo_date >= 2025-01-01)
 * - Categories: Action, Portrait (where jerseys visible)
 * - Missing: jersey_number IS NULL
 *
 * Cost: ~$11 for 3,138 photos (vs $40 for all volleyball)
 *
 * Usage:
 *   npx tsx scripts/enrich-delta-jersey-volleyball-2025.ts              # Process all 2025 volleyball
 *   npx tsx scripts/enrich-delta-jersey-volleyball-2025.ts --limit 50   # Test with 50 photos
 *   npx tsx scripts/enrich-delta-jersey-volleyball-2025.ts --dry-run    # Preview only
 */

import { config } from 'dotenv';
import { resolve } from 'path';

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
	batchSize: 5, // Conservative for vision API
	costPerPhoto: 0.0035, // Gemini vision API cost
	year: 2025
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
// Jersey Number Extraction
// =============================================================================

interface Photo {
	image_key: string;
	ThumbnailUrl: string | null;
	OriginalUrl: string | null;
	photo_category: string;
	sport_type: string;
}

async function extractJerseyNumber(imageUrl: string): Promise<number | null> {
	try {
		// Fetch image
		const response = await fetch(imageUrl);
		if (!response.ok) {
			throw new Error(`Failed to fetch image: ${response.statusText}`);
		}

		const imageBuffer = await response.arrayBuffer();
		const base64Image = Buffer.from(imageBuffer).toString('base64');

		// Use Gemini 2.0 Flash Lite (working model from enrich-local-photos.ts)
		const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);
		const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

		// Call vision model
		const result = await model.generateContent([
			'Look at this volleyball photo. Is there a player jersey number clearly visible? If yes, respond with ONLY the number (e.g., "15"). If no jersey number is visible or readable, respond with "NONE". Do not include any other text.',
			{
				inlineData: {
					data: base64Image,
					mimeType: 'image/jpeg'
				}
			}
		]);

		const text = result.response.text().trim().toUpperCase();

		// Parse response
		if (text === 'NONE' || text.includes('NO') || text.includes('NOT')) {
			return null;
		}

		// Extract first number found
		const numberMatch = text.match(/\d+/);
		if (numberMatch) {
			const jerseyNumber = parseInt(numberMatch[0]);
			// Validate reasonable jersey number range
			if (jerseyNumber >= 0 && jerseyNumber <= 99) {
				return jerseyNumber;
			}
		}

		return null;
	} catch (error: any) {
		console.error(`   ⚠️  Failed to extract jersey number:`, error.message);
		return null;
	}
}

// =============================================================================
// Processing
// =============================================================================

async function processDeltaEnrichment() {
	console.log('🏐 Starting Delta Enrichment: Jersey Numbers (2025 Volleyball Only)\n');

	// Fetch 2025 volleyball photos that need jersey number enrichment
	let query = supabase
		.from('photo_metadata')
		.select('image_key, ThumbnailUrl, OriginalUrl, photo_category, sport_type')
		.eq('sport_type', 'volleyball')
		.in('photo_category', ['action', 'portrait'])
		.gte('photo_date', '2025-01-01')
		.lt('photo_date', '2026-01-01')
		.is('jersey_number', null);

	if (CONFIG.limit) {
		query = query.limit(CONFIG.limit);
	}

	const { data: photos, error } = await query;

	if (error) {
		console.error('❌ Failed to fetch photos:', error);
		process.exit(1);
	}

	if (!photos || photos.length === 0) {
		console.log('✅ No photos need jersey number enrichment!');
		return;
	}

	console.log(`📊 Found ${photos.length} photos to process`);
	console.log(`   Sport: Volleyball`);
	console.log(`   Year: ${CONFIG.year}`);
	console.log(`   Categories: Action, Portrait`);
	console.log(`💰 Estimated cost: $${(photos.length * CONFIG.costPerPhoto).toFixed(2)}`);
	console.log(`⏱️  Estimated time: ~${Math.ceil(photos.length / CONFIG.batchSize)} minutes\n`);

	if (CONFIG.dryRun) {
		console.log('🏃 Dry run mode - showing sample photos:\n');
		photos.slice(0, 5).forEach((photo) => {
			console.log(`   ${photo.image_key} (${photo.photo_category})`);
		});
		console.log('\nNo changes will be saved in dry-run mode.\n');
		return;
	}

	let processed = 0;
	let enriched = 0; // Photos where jersey number was found
	let notVisible = 0; // Photos where jersey not visible
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

				// Use thumbnail for faster processing
				const imageUrl = photo.ThumbnailUrl || photo.OriginalUrl;

				if (!imageUrl) {
					console.log(`   ⏭️  ${photo.image_key} - No image URL`);
					failed++;
					return;
				}

				console.log(`   🔄 ${photo.image_key} - Extracting jersey number...`);

				const jerseyNumber = await extractJerseyNumber(imageUrl);

				if (jerseyNumber !== null) {
					// Save jersey number
					const { error: updateError } = await supabase
						.from('photo_metadata')
						.update({ jersey_number: jerseyNumber })
						.eq('image_key', photo.image_key);

					if (updateError) {
						console.error(`   ❌ ${photo.image_key} - Failed to save:`, updateError.message);
						failed++;
						return;
					}

					enriched++;
					console.log(`   ✅ ${photo.image_key} - Jersey #${jerseyNumber}`);
				} else {
					// Jersey not visible - this is OK, we just don't update
					notVisible++;
					console.log(`   ⚪ ${photo.image_key} - No jersey visible`);
				}
			})
		);

		// Progress update
		const elapsed = (Date.now() - startTime) / 1000;
		const rate = processed / elapsed;
		const remaining = photos.length - processed;
		const eta = remaining / rate;

		console.log(`\n   Progress: ${processed}/${photos.length} (${((processed / photos.length) * 100).toFixed(1)}%)`);
		console.log(`   Enriched: ${enriched} | Not visible: ${notVisible} | Failed: ${failed}`);
		console.log(`   Rate: ${rate.toFixed(1)} photos/sec | ETA: ${Math.ceil(eta / 60)} min`);

		// Rate limiting between batches
		if (i + CONFIG.batchSize < photos.length) {
			console.log('   ⏸️  Waiting 1s for rate limit...');
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}

	const totalTime = (Date.now() - startTime) / 1000;

	// Summary
	console.log('\n' + '='.repeat(70));
	console.log('📊 Summary:');
	console.log(`   Total processed: ${processed.toLocaleString()}`);
	console.log(`   ✅ Enriched (jersey found): ${enriched.toLocaleString()}`);
	console.log(`   ⚪ Not visible (jersey not in photo): ${notVisible.toLocaleString()}`);
	console.log(`   ❌ Failed: ${failed.toLocaleString()}`);
	console.log(`   ⏱️  Total time: ${Math.ceil(totalTime / 60)} minutes (${(totalTime / 60).toFixed(1)}min)`);
	console.log(`   💰 Actual cost: $${(processed * CONFIG.costPerPhoto).toFixed(2)}`);
	console.log('='.repeat(70));

	console.log('\n🎉 Jersey number enrichment complete!');
	console.log(`   ${enriched} photos enriched with jersey numbers`);
	console.log(`   ${notVisible} photos had no visible jersey (expected for some categories)\n`);
}

// =============================================================================
// Main
// =============================================================================

processDeltaEnrichment().catch((error) => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
