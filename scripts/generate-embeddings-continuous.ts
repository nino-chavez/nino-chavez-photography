#!/usr/bin/env node
/**
 * Continuous Embeddings Generation
 *
 * Runs embedding generation in a loop until 95%+ coverage is achieved.
 * Automatically handles batching and progress tracking.
 *
 * Usage:
 *   npx tsx scripts/generate-embeddings-continuous.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { execSync } from 'child_process';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_COVERAGE = 95; // Stop when 95% coverage reached
const BATCH_SIZE = 1000;
const COST_PER_BATCH = 0.01;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('❌ Missing Supabase credentials');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Get current coverage
async function getCoverage() {
	const { count: totalPhotos } = await supabase
		.from('photo_metadata')
		.select('*', { count: 'exact', head: true });

	const { count: withEmbeddings } = await supabase
		.from('photo_metadata')
		.select('*', { count: 'exact', head: true })
		.not('embedding', 'is', null);

	const coverage = ((withEmbeddings || 0) / (totalPhotos || 0)) * 100;
	const remaining = (totalPhotos || 0) - (withEmbeddings || 0);

	return {
		total: totalPhotos || 0,
		withEmbeddings: withEmbeddings || 0,
		coverage,
		remaining
	};
}

// Run embeddings generation batch
async function runBatch() {
	try {
		execSync('npx tsx scripts/generate-embeddings-metadata.ts', {
			stdio: 'inherit',
			cwd: process.cwd()
		});
		return true;
	} catch (error) {
		console.error('❌ Batch failed:', error);
		return false;
	}
}

// Main loop
async function runContinuous() {
	console.log('🚀 Starting Continuous Embeddings Generation\n');
	console.log(`Target: ${TARGET_COVERAGE}% coverage`);
	console.log(`Batch size: ${BATCH_SIZE} photos`);
	console.log(`Cost per batch: $${COST_PER_BATCH}\n`);

	let batchNumber = 1;
	const startTime = Date.now();

	while (true) {
		// Check current coverage
		const stats = await getCoverage();

		console.log('\n' + '='.repeat(70));
		console.log(`📊 Coverage Status:`);
		console.log(`   Total: ${stats.total.toLocaleString()} photos`);
		console.log(`   With embeddings: ${stats.withEmbeddings.toLocaleString()} (${stats.coverage.toFixed(1)}%)`);
		console.log(`   Remaining: ${stats.remaining.toLocaleString()} photos`);
		console.log('='.repeat(70));

		// Check if target reached
		if (stats.coverage >= TARGET_COVERAGE) {
			console.log('\n🎉 Target coverage reached!');
			console.log(`   Final coverage: ${stats.coverage.toFixed(1)}%`);
			console.log(`   Photos with embeddings: ${stats.withEmbeddings.toLocaleString()}`);

			const totalTime = (Date.now() - startTime) / 1000;
			const totalCost = (batchNumber - 1) * COST_PER_BATCH;

			console.log(`\n📊 Final Summary:`);
			console.log(`   Batches processed: ${batchNumber - 1}`);
			console.log(`   Total time: ${Math.ceil(totalTime / 60)} minutes`);
			console.log(`   Total cost: $${totalCost.toFixed(2)}`);
			break;
		}

		// Check if there are no more photos to process
		if (stats.remaining === 0) {
			console.log('\n✅ All photos have embeddings!');
			break;
		}

		// Run next batch
		console.log(`\n🔄 Starting Batch ${batchNumber}...`);
		const success = await runBatch();

		if (!success) {
			console.error('\n❌ Batch failed. Stopping.');
			process.exit(1);
		}

		batchNumber++;

		// Brief pause between batches
		console.log('\n⏸️  Pausing 5 seconds before next batch...');
		await new Promise((resolve) => setTimeout(resolve, 5000));
	}

	console.log('\n✅ Continuous generation complete!\n');
}

// Run
runContinuous().catch((error) => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
