#!/usr/bin/env node
/**
 * Unified Photo Enrichment Pipeline
 *
 * Automates the full photo processing pipeline:
 * 1. Enrich: Generate AI metadata from local photos (Gemini Vision)
 * 2. Sync: Write enriched metadata to Supabase
 * 3. Upload: Upload local photos to Cloudflare Images
 *
 * Usage:
 *   # Process photos from a local directory
 *   npx tsx scripts/run-pipeline.ts --dir ./photos/tournament-2024 --album-key ABC123
 *
 *   # Dry run (preview without uploading)
 *   npx tsx scripts/run-pipeline.ts --dir ./photos --album-key ABC123 --dry-run
 *
 *   # Resume from specific step
 *   npx tsx scripts/run-pipeline.ts --dir ./photos --album-key ABC123 --start-from sync
 *   npx tsx scripts/run-pipeline.ts --dir ./photos --album-key ABC123 --start-from upload
 */

import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

// Load environment variables
loadEnv({ path: resolve(process.cwd(), '.env.local') });

// =============================================================================
// Configuration
// =============================================================================

interface PipelineConfig {
	photoDir: string;
	albumKey: string;
	dryRun: boolean;
	startFrom: 'enrich' | 'sync' | 'upload';
	batchSize: number;
	albumName?: string;
	uploadDate?: string;
}

function parseArgs(): PipelineConfig {
	const args = process.argv.slice(2);
	const config: Partial<PipelineConfig> = {
		dryRun: args.includes('--dry-run'),
		startFrom: 'enrich',
		batchSize: 20
	};

	// Parse --dir
	const dirIndex = args.indexOf('--dir');
	if (dirIndex !== -1 && args[dirIndex + 1]) {
		config.photoDir = resolve(process.cwd(), args[dirIndex + 1]);
	}

	// Parse --album-key
	const albumIndex = args.indexOf('--album-key');
	if (albumIndex !== -1 && args[albumIndex + 1]) {
		config.albumKey = args[albumIndex + 1];
	}

	// Parse --album-name
	const nameIndex = args.indexOf('--album-name');
	if (nameIndex !== -1 && args[nameIndex + 1]) {
		config.albumName = args[nameIndex + 1];
	}

	// Parse --upload-date
	const dateIndex = args.indexOf('--upload-date');
	if (dateIndex !== -1 && args[dateIndex + 1]) {
		config.uploadDate = args[dateIndex + 1];
	}

	// Parse --start-from
	const startFromIndex = args.indexOf('--start-from');
	if (startFromIndex !== -1 && args[startFromIndex + 1]) {
		const step = args[startFromIndex + 1];
		if (['enrich', 'sync', 'upload'].includes(step)) {
			config.startFrom = step as 'enrich' | 'sync' | 'upload';
		}
	}

	// Parse --batch-size
	const batchIndex = args.indexOf('--batch-size');
	if (batchIndex !== -1 && args[batchIndex + 1]) {
		config.batchSize = parseInt(args[batchIndex + 1], 10);
	}

	// Validation
	if (!config.photoDir) {
		console.error('❌ Missing required argument: --dir <photo-directory>');
		console.error('\nUsage:');
		console.error('  npx tsx scripts/run-pipeline.ts --dir ./photos --album-key ABC123');
		process.exit(1);
	}

	if (!config.albumKey) {
		console.error('❌ Missing required argument: --album-key <album-key>');
		console.error('\nUsage:');
		console.error('  npx tsx scripts/run-pipeline.ts --dir ./photos --album-key ABC123');
		process.exit(1);
	}

	if (!existsSync(config.photoDir)) {
		console.error(`❌ Photo directory does not exist: ${config.photoDir}`);
		process.exit(1);
	}

	return config as PipelineConfig;
}

// =============================================================================
// Pipeline Steps
// =============================================================================

interface StepResult {
	success: boolean;
	duration: number;
	error?: string;
}

async function runStep(
	name: string,
	command: string,
	description: string
): Promise<StepResult> {
	const startTime = Date.now();

	console.log('\n' + '='.repeat(80));
	console.log(`📋 Step: ${name}`);
	console.log('='.repeat(80));
	console.log(`📝 ${description}\n`);

	try {
		console.log(`🔧 Running: ${command}\n`);

		execSync(command, {
			stdio: 'inherit',
			cwd: process.cwd(),
			env: process.env
		});

		const duration = Date.now() - startTime;
		console.log(`\n✅ ${name} completed in ${(duration / 1000).toFixed(1)}s`);

		return { success: true, duration };
	} catch (error: any) {
		const duration = Date.now() - startTime;
		console.error(`\n❌ ${name} failed after ${(duration / 1000).toFixed(1)}s`);
		console.error(`Error: ${error.message}`);

		return { success: false, duration, error: error.message };
	}
}

// =============================================================================
// Main Pipeline
// =============================================================================

async function runPipeline(config: PipelineConfig) {
	console.log('\n🚀 Photo Enrichment Pipeline Starting...\n');
	console.log('Configuration:');
	console.log(`  📁 Photo Directory: ${config.photoDir}`);
	console.log(`  📸 Album Key: ${config.albumKey}`);
	if (config.albumName) console.log(`  🏷️  Album Name: ${config.albumName}`);
	if (config.uploadDate) console.log(`  📅 Upload Date: ${config.uploadDate}`);
	console.log(`  🔄 Batch Size: ${config.batchSize}`);
	console.log(`  🏁 Starting From: ${config.startFrom}`);
	console.log(`  🔍 Dry Run: ${config.dryRun ? 'Yes' : 'No'}`);

	const pipelineStartTime = Date.now();
	const results: Record<string, StepResult> = {};

	const steps: ('enrich' | 'sync' | 'upload')[] = ['enrich', 'sync', 'upload'];
	const startIdx = steps.indexOf(config.startFrom);

	// Step 1: Enrich - Generate AI metadata via Gemini Vision
	if (startIdx <= 0) {
		const albumNameArg = config.albumName ? ` --album-name="${config.albumName}"` : '';
		const enrichCmd = `npx tsx scripts/enrich-local-photos.ts ${config.photoDir}${albumNameArg}${
			config.dryRun ? ' --dry-run' : ''
		}`;

		results.enrich = await runStep(
			'Enrich',
			enrichCmd,
			`Generate AI metadata for photos in ${config.photoDir}`
		);

		if (!results.enrich.success) {
			console.error('\n❌ Pipeline failed at Enrich step');
			printSummary(results, pipelineStartTime);
			process.exit(1);
		}
	}

	// Step 2: Sync - Write enriched metadata to Supabase
	if (startIdx <= 1) {
		const albumNameArg = config.albumName ? ` --album-name="${config.albumName}"` : '';
		const uploadDateArg = config.uploadDate ? ` --upload-date="${config.uploadDate}"` : '';
		const syncCmd = `npx tsx scripts/sync-local-to-supabase.ts ${config.photoDir} ${config.albumKey}${albumNameArg}${uploadDateArg}${
			config.dryRun ? ' --dry-run' : ''
		}`;

		results.sync = await runStep(
			'Sync',
			syncCmd,
			`Sync enriched metadata for album ${config.albumKey} to Supabase`
		);

		if (!results.sync.success) {
			console.error('\n❌ Pipeline failed at Sync step');
			printSummary(results, pipelineStartTime);
			process.exit(1);
		}
	}

	// Step 3: Upload - Upload local photos to Cloudflare Images
	if (startIdx <= 2) {
		const uploadCmd = `npx tsx scripts/upload-local-to-cloudflare.ts ${config.photoDir} ${config.albumKey}${
			config.dryRun ? ' --dry-run' : ''
		}`;

		results.upload = await runStep(
			'Upload',
			uploadCmd,
			`Upload photos to Cloudflare Images for album ${config.albumKey}`
		);

		if (!results.upload.success) {
			console.error('\n❌ Pipeline failed at Upload step');
			printSummary(results, pipelineStartTime);
			process.exit(1);
		}
	}

	// Success!
	printSummary(results, pipelineStartTime);
}

function printSummary(results: Record<string, StepResult>, startTime: number) {
	const totalDuration = Date.now() - startTime;

	console.log('\n' + '='.repeat(80));
	console.log('📊 Pipeline Summary');
	console.log('='.repeat(80));

	Object.entries(results).forEach(([step, result]) => {
		const status = result.success ? '✅' : '❌';
		const duration = (result.duration / 1000).toFixed(1);
		console.log(`${status} ${step.padEnd(10)} - ${duration}s`);
	});

	console.log('─'.repeat(80));
	console.log(`⏱️  Total Time: ${(totalDuration / 1000).toFixed(1)}s`);

	const allSuccess = Object.values(results).every((r) => r.success);
	if (allSuccess) {
		console.log('🎉 Pipeline completed successfully!');
	} else {
		console.log('❌ Pipeline completed with errors');
	}

	console.log('='.repeat(80) + '\n');
}

// =============================================================================
// Entry Point
// =============================================================================

const config = parseArgs();
runPipeline(config).catch((error) => {
	console.error('\n💥 Fatal pipeline error:', error);
	process.exit(1);
});
