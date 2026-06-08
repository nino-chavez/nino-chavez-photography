#!/usr/bin/env node
/**
 * Generate Vector Embeddings from Photo Metadata
 *
 * Uses existing photo metadata to create semantic text descriptions,
 * then generates embeddings using Google Gemini.
 *
 * Much cheaper and faster than vision-based approach:
 * - Cost: ~$0.20 for 20K photos (vs $70 with vision)
 * - Speed: 1 API call per photo (vs 2)
 * - Reliability: No vision model complexity
 *
 * Usage:
 *   npx tsx scripts/generate-embeddings-metadata.ts                  # Process all photos
 *   npx tsx scripts/generate-embeddings-metadata.ts --limit 100      # Process first 100
 *   npx tsx scripts/generate-embeddings-metadata.ts --overwrite      # Regenerate all
 *   npx tsx scripts/generate-embeddings-metadata.ts --dry-run        # Preview only
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { embedText } from '../src/lib/ai/embeddings';

// =============================================================================
// Configuration
// =============================================================================

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Embeddings route through OpenRouter (text-embedding-3-large @768) — the project's
// only live gateway. Direct Google embedding keys are revoked. See embeddings.ts.
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const CONFIG = {
	dryRun: process.argv.includes('--dry-run'),
	overwrite: process.argv.includes('--overwrite'),
	limit: parseInt(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || '0') || undefined,
	batchSize: 20, // Faster batches since we're only doing text embeddings
	costPerImage: 0.00001 // Just embedding cost, no vision API
};

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('❌ Missing Supabase credentials');
	process.exit(1);
}

if (!OPENROUTER_API_KEY) {
	console.error('❌ Missing OPENROUTER_API_KEY (embeddings route through OpenRouter)');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// =============================================================================
// Metadata to Text Description
// =============================================================================

interface PhotoMetadata {
	image_key: string;
	caption?: string | null;
	sport_type?: string | null;
	play_type?: string | null;
	photo_category?: string | null;
	emotion?: string | null;
	action_intensity?: string | null;
	composition?: string | null;
	time_of_day?: string | null;
	lighting?: string | null;
	color_temperature?: string | null;
}

function createSemanticDescription(photo: PhotoMetadata): string {
	const parts: string[] = [];

	// Sport and action
	if (photo.sport_type) {
		parts.push(photo.sport_type);
		if (photo.play_type) {
			parts.push(photo.play_type);
		}
	}

	// Category and intensity
	if (photo.photo_category) {
		parts.push(photo.photo_category);
		if (photo.action_intensity && photo.photo_category === 'action') {
			parts.push(`${photo.action_intensity} intensity`);
		}
	}

	// Emotion
	if (photo.emotion) {
		parts.push(`${photo.emotion} emotion`);
	}

	// Visual characteristics
	if (photo.composition) {
		parts.push(`${photo.composition.replace(/_/g, ' ')} composition`);
	}

	if (photo.lighting) {
		parts.push(`${photo.lighting} lighting`);
	}

	if (photo.color_temperature) {
		parts.push(`${photo.color_temperature} color tone`);
	}

	if (photo.time_of_day) {
		parts.push(`${photo.time_of_day.replace(/_/g, ' ')}`);
	}

	// Create semantic description
	const description = parts.join(', ');

	return description || 'sports photo';
}

// =============================================================================
// Embedding Generation
// =============================================================================

async function generateEmbedding(description: string): Promise<number[] | null> {
	// Delegates to the shared embedder (OpenRouter text-embedding-3-large @768) so the
	// write path matches the query path exactly. See src/lib/ai/embeddings.ts.
	return embedText(description, OPENROUTER_API_KEY);
}

// =============================================================================
// Photo Processing
// =============================================================================

async function processPhotos() {
	console.log('🚀 Starting metadata-based embedding generation...\n');

	// Fetch photos with metadata
	let query = supabase
		.from('photo_metadata')
		.select('image_key, caption, sport_type, play_type, photo_category, emotion, action_intensity, composition, time_of_day, lighting, color_temperature')
		// Phase 1: embed the AI caption. Only photos that have one are eligible; the
		// enum-string fallback is kept only for rows captured before captions existed.
		.not('caption', 'is', null);

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
	console.log(`💰 Estimated cost: $${(photos.length * CONFIG.costPerImage).toFixed(4)}`);
	console.log(`⚡ Using metadata-based approach (fast & cheap)\n`);

	if (CONFIG.dryRun) {
		console.log('🏃 Dry run mode - showing sample descriptions:\n');
		photos.slice(0, 5).forEach(photo => {
			const description = photo.caption?.trim() || createSemanticDescription(photo);
			console.log(`   ${photo.image_key}: "${description}"`);
		});
		console.log('\nNo changes will be saved in dry-run mode.\n');
		return;
	}

	let processed = 0;
	let succeeded = 0;
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

				// Create semantic description from metadata
				const description = photo.caption?.trim() || createSemanticDescription(photo);

				console.log(`   🔄 ${photo.image_key} - "${description.slice(0, 50)}..."`);

				// Generate embedding from description
				const embedding = await generateEmbedding(description);

				if (!embedding) {
					failed++;
					return;
				}

				// Save to database
				const { error: updateError } = await supabase
					.from('photo_metadata')
					.update({ embedding: embedding })
					.eq('image_key', photo.image_key);

				if (updateError) {
					console.error(`   ❌ ${photo.image_key} - Failed to save:`, updateError.message);
					failed++;
					return;
				}

				succeeded++;
				console.log(`   ✅ ${photo.image_key} - Success`);
			})
		);

		// Progress update
		const elapsed = (Date.now() - startTime) / 1000;
		const rate = processed / elapsed;
		const remaining = photos.length - processed;
		const eta = remaining / rate;

		console.log(`\n   Progress: ${processed}/${photos.length} (${((processed / photos.length) * 100).toFixed(1)}%)`);
		console.log(`   Rate: ${rate.toFixed(1)} photos/sec | ETA: ${Math.ceil(eta / 60)} min`);

		// Rate limiting between batches (conservative)
		if (i + CONFIG.batchSize < photos.length) {
			console.log('   ⏸️  Waiting 2s for rate limit...');
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}
	}

	const totalTime = (Date.now() - startTime) / 1000;

	// Summary
	console.log('\n' + '='.repeat(70));
	console.log('📊 Summary:');
	console.log(`   Total: ${processed.toLocaleString()}`);
	console.log(`   ✅ Succeeded: ${succeeded.toLocaleString()}`);
	console.log(`   ❌ Failed: ${failed.toLocaleString()}`);
	console.log(`   ⏱️  Total time: ${Math.ceil(totalTime / 60)} minutes (${(totalTime / 60).toFixed(1)}min)`);
	console.log(`   💰 Actual cost: $${(succeeded * CONFIG.costPerImage).toFixed(4)}`);
	console.log('='.repeat(70));

	console.log('\n🎉 Embedding generation complete!');
	console.log('   Your photos now have semantic embeddings for similarity search.\n');
}

// =============================================================================
// Main
// =============================================================================

processPhotos().catch((error) => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
