#!/usr/bin/env node
/**
 * Automated Photo Pipeline
 *
 * Consolidates the photo processing workflow into a single automated pipeline:
 * 1. Enrich local photos with AI (Gemini vision analysis)
 * 2. Upload to Cloudflare Images + sync to Supabase
 * 3. [Optional] Generate embeddings for similarity search
 *
 * Part of Initiative 2.1: Pipeline Automation & Efficiency
 *
 * Usage:
 *   npx tsx scripts/automated-pipeline.ts /path/to/photos <album-key>
 *   npx tsx scripts/automated-pipeline.ts /path/to/photos <album-key> --skip-enrich
 *   npx tsx scripts/automated-pipeline.ts /path/to/photos <album-key> --skip-upload
 *   npx tsx scripts/automated-pipeline.ts /path/to/photos <album-key> --with-embeddings
 *   npx tsx scripts/automated-pipeline.ts /path/to/photos <album-key> --dry-run
 *
 * Examples:
 *   # Full pipeline
 *   npx tsx scripts/automated-pipeline.ts ~/Photos/Tournament-2024 abc123
 *
 *   # Skip enrichment (photos already enriched)
 *   npx tsx scripts/automated-pipeline.ts ~/Photos/Tournament-2024 abc123 --skip-enrich
 *
 *   # Dry run (preview without changes)
 *   npx tsx scripts/automated-pipeline.ts ~/Photos/Tournament-2024 abc123 --dry-run
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });

const execAsync = promisify(exec);

// =============================================================================
// Configuration
// =============================================================================

const args = process.argv.slice(2);
const photoDir = args.find((arg) => !arg.startsWith('--') && !arg.match(/^[a-z0-9]+$/i));
const albumKey = args.find((arg) => !arg.startsWith('--') && arg.match(/^[a-z0-9]+$/i));

const CONFIG = {
	photoDir,
	albumKey,
	skipEnrich: args.includes('--skip-enrich'),
	skipUpload: args.includes('--skip-upload'),
	skipSync: args.includes('--skip-sync'),
	withEmbeddings: args.includes('--with-embeddings'),
	dryRun: args.includes('--dry-run')
};

// Validation
if (!CONFIG.photoDir && !CONFIG.skipEnrich && !CONFIG.skipUpload) {
	console.error('❌ Missing photo directory path');
	console.error('Usage: npx tsx scripts/automated-pipeline.ts /path/to/photos <album-key>');
	process.exit(1);
}

if (!CONFIG.albumKey && !CONFIG.skipSync) {
	console.error('❌ Missing album key');
	console.error('Usage: npx tsx scripts/automated-pipeline.ts /path/to/photos <album-key>');
	process.exit(1);
}

// =============================================================================
// Pipeline Steps
// =============================================================================

interface PipelineResult {
	step: string;
	success: boolean;
	duration: number;
	output?: string;
	error?: string;
}

const results: PipelineResult[] = [];

async function runStep(
	step: string,
	command: string,
	skipCondition: boolean = false
): Promise<void> {
	if (skipCondition) {
		console.log(`⏭️  Skipping: ${step}\n`);
		results.push({ step, success: true, duration: 0 });
		return;
	}

	console.log(`🚀 Starting: ${step}`);
	console.log(`📝 Command: ${command}\n`);

	const startTime = Date.now();

	try {
		const { stdout, stderr } = await execAsync(command, {
			maxBuffer: 10 * 1024 * 1024 // 10MB buffer
		});

		const duration = Date.now() - startTime;

		console.log(stdout);
		if (stderr) console.error(stderr);

		console.log(`✅ Completed: ${step} (${(duration / 1000).toFixed(1)}s)\n`);

		results.push({ step, success: true, duration, output: stdout });
	} catch (error: any) {
		const duration = Date.now() - startTime;

		console.error(`❌ Failed: ${step}`);
		console.error(error.stdout || error.message);
		console.error(error.stderr || '');

		results.push({
			step,
			success: false,
			duration,
			error: error.message
		});

		throw error;
	}
}

async function runPipeline() {
	console.log('╔════════════════════════════════════════════════════════════════╗');
	console.log('║          AUTOMATED PHOTO PIPELINE - INITIATIVE 2.1            ║');
	console.log('╚════════════════════════════════════════════════════════════════╝\n');

	if (CONFIG.dryRun) {
		console.log('🏃 DRY RUN MODE - No changes will be made\n');
	}

	console.log('📋 Configuration:');
	console.log(`   Photo Directory: ${CONFIG.photoDir || 'N/A'}`);
	console.log(`   Album Key: ${CONFIG.albumKey || 'N/A'}`);
	console.log(`   Skip Enrich: ${CONFIG.skipEnrich}`);
	console.log(`   Skip Upload: ${CONFIG.skipUpload}`);
	console.log(`   Skip Sync: ${CONFIG.skipSync}`);
	console.log(`   With Embeddings: ${CONFIG.withEmbeddings}`);
	console.log('\n' + '='.repeat(70) + '\n');

	const pipelineStart = Date.now();

	try {
		// Step 1: Enrich photos with AI
		await runStep(
			'Step 1: AI Enrichment',
			`npx tsx scripts/enrich-local-photos.ts "${CONFIG.photoDir}"${CONFIG.dryRun ? ' --dry-run' : ''}`,
			CONFIG.skipEnrich
		);

		// Step 2: Upload to Cloudflare Images + sync to Supabase
		await runStep(
			'Step 2: CF Images Upload + Supabase Sync',
			`npx tsx scripts/sync-local-to-supabase.ts "${CONFIG.photoDir}" ${CONFIG.albumKey}${CONFIG.dryRun ? ' --dry-run' : ''}`,
			CONFIG.skipUpload || CONFIG.skipSync
		);

		// Step 3: Generate embeddings (optional)
		if (CONFIG.withEmbeddings) {
			await runStep(
				'Step 3: Generate Embeddings',
				`npx tsx scripts/generate-embeddings.ts${CONFIG.dryRun ? ' --dry-run' : ''}`,
				false
			);
		}

		// Success!
		const totalDuration = Date.now() - pipelineStart;

		console.log('\n' + '='.repeat(70));
		console.log('🎉 PIPELINE COMPLETE!\n');
		console.log('📊 Summary:');

		results.forEach((result) => {
			const status = result.success ? '✅' : '❌';
			const duration = result.duration ? `(${(result.duration / 1000).toFixed(1)}s)` : '';
			console.log(`   ${status} ${result.step} ${duration}`);
		});

		console.log(`\n⏱️  Total Time: ${(totalDuration / 1000).toFixed(1)}s`);
		console.log('='.repeat(70) + '\n');

		console.log('✨ Your photos are now:');
		console.log('   • AI-enriched with metadata');
		console.log('   • Uploaded to Cloudflare Images');
		console.log('   • Synced to Supabase for search');
		if (CONFIG.withEmbeddings) {
			console.log('   • Vector-embedded for similarity search');
		}
		console.log('\n🔗 Next Steps:');
		console.log('   • View your photos at photography.ninochavez.co');
		console.log('   • Try searching with Focus Bot!');
		console.log('   • Explore similar photos with vector search\n');
	} catch (error) {
		const totalDuration = Date.now() - pipelineStart;

		console.log('\n' + '='.repeat(70));
		console.log('❌ PIPELINE FAILED\n');
		console.log('📊 Summary:');

		results.forEach((result) => {
			const status = result.success ? '✅' : '❌';
			const duration = result.duration ? `(${(result.duration / 1000).toFixed(1)}s)` : '';
			console.log(`   ${status} ${result.step} ${duration}`);
		});

		console.log(`\n⏱️  Total Time: ${(totalDuration / 1000).toFixed(1)}s`);
		console.log('='.repeat(70) + '\n');

		process.exit(1);
	}
}

// =============================================================================
// Main
// =============================================================================

runPipeline().catch((error) => {
	console.error('💥 Fatal error:', error);
	process.exit(1);
});
