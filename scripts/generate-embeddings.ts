#!/usr/bin/env node
/**
 * Generate Vector Embeddings for Photos
 *
 * Uses Google Gemini Embedding Model to create semantic vectors for similarity search.
 * Part of Initiative 2.2: Closing the Data Gaps (Next-Gen CV)
 *
 * Usage:
 *   npx tsx scripts/generate-embeddings.ts                  # Process all photos without embeddings
 *   npx tsx scripts/generate-embeddings.ts --limit 100      # Process first 100 photos
 *   npx tsx scripts/generate-embeddings.ts --overwrite      # Regenerate all embeddings
 *   npx tsx scripts/generate-embeddings.ts --dry-run        # Preview without saving
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
	overwrite: process.argv.includes('--overwrite'),
	limit: parseInt(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || '0') || undefined,
	batchSize: 10, // Process in batches to avoid rate limits
	costPerImage: 0.00001 // Gemini embedding model cost estimate
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
// Embedding Generation
// =============================================================================

interface Photo {
	image_key: string;
	thumbnail_url: string | null;
	original_url: string | null;
	sport_type?: string;
	play_type?: string;
	photo_category?: string;
}

async function generateEmbedding(imageUrl: string): Promise<number[] | null> {
	try {
		// Use Gemini's embedding model
		const model = genAI.getGenerativeModel({ model: 'embedding-001' });

		// Fetch image
		const response = await fetch(imageUrl);
		if (!response.ok) {
			throw new Error(`Failed to fetch image: ${response.statusText}`);
		}

		const imageBuffer = await response.arrayBuffer();
		const base64Image = Buffer.from(imageBuffer).toString('base64');

		// Generate embedding
		const result = await model.embedContent({
			content: {
				parts: [{
					inlineData: {
						data: base64Image,
						mimeType: 'image/jpeg'
					}
				}]
			}
		});

		return result.embedding.values;
	} catch (error) {
		console.error(`   ⚠️  Failed to generate embedding:`, error);
		return null;
	}
}

async function processPhotos() {
	console.log('🚀 Starting embedding generation...\n');

	// Fetch photos that need embeddings
	let query = supabase
		.from('photo_metadata')
		.select('image_key, thumbnail_url, original_url, sport_type, play_type, photo_category');

	if (!CONFIG.overwrite) {
		query = query.is('embedding', null);
	}

	if (CONFIG.limit) {
		query = query.limit(CONFIG.limit);
	}

	const { data: photos, error } = await query;

	if (error) {
		console.error('❌ Failed to fetch photos:', error);
		process.exit(1);
	}

	if (!photos || photos.length === 0) {
		console.log('✅ No photos need embeddings!');
		return;
	}

	console.log(`📊 Found ${photos.length} photos to process`);
	console.log(`💰 Estimated cost: $${(photos.length * CONFIG.costPerImage).toFixed(4)}\n`);

	if (CONFIG.dryRun) {
		console.log('🏃 Dry run mode - no changes will be saved\n');
	}

	let processed = 0;
	let succeeded = 0;
	let failed = 0;

	// Process in batches
	for (let i = 0; i < photos.length; i += CONFIG.batchSize) {
		const batch = photos.slice(i, i + CONFIG.batchSize);

		console.log(`\n📦 Processing batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(photos.length / CONFIG.batchSize)}`);

		await Promise.all(
			batch.map(async (photo) => {
				processed++;

				// Use thumbnail for faster processing, fallback to original
				const imageUrl = photo.thumbnail_url || photo.original_url;

				if (!imageUrl) {
					console.log(`   ⏭️  ${photo.image_key} - No image URL`);
					failed++;
					return;
				}

				console.log(`   🔄 ${photo.image_key} - Generating embedding...`);

				const embedding = await generateEmbedding(imageUrl);

				if (!embedding) {
					failed++;
					return;
				}

				if (!CONFIG.dryRun) {
					const { error: updateError } = await supabase
						.from('photo_metadata')
						.update({ embedding: embedding })
						.eq('image_key', photo.image_key);

					if (updateError) {
						console.error(`   ❌ ${photo.image_key} - Failed to save:`, updateError.message);
						failed++;
						return;
					}
				}

				succeeded++;
				console.log(`   ✅ ${photo.image_key} - Success`);
			})
		);

		// Rate limiting between batches
		if (i + CONFIG.batchSize < photos.length) {
			console.log('   ⏸️  Waiting 1s for rate limit...');
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}

	// Summary
	console.log('\n' + '='.repeat(60));
	console.log('📊 Summary:');
	console.log(`   Total: ${processed}`);
	console.log(`   ✅ Succeeded: ${succeeded}`);
	console.log(`   ❌ Failed: ${failed}`);
	console.log(`   💰 Actual cost: $${(succeeded * CONFIG.costPerImage).toFixed(4)}`);
	console.log('='.repeat(60));
}

// =============================================================================
// Main
// =============================================================================

processPhotos().catch((error) => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
