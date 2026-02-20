#!/usr/bin/env node
/**
 * Process New Album - Complete Workflow
 *
 * One-command workflow for new album processing:
 * 1. Enrich photos with AI vision (Gemini)
 * 2. Upload to Cloudflare Images + sync to Supabase
 *
 * Usage:
 *   npx tsx scripts/process-new-album.ts /path/to/photos
 *   npx tsx scripts/process-new-album.ts /path/to/photos --dry-run
 *   npx tsx scripts/process-new-album.ts /path/to/photos --skip-enrichment
 *   npx tsx scripts/process-new-album.ts /path/to/photos --skip-upload
 */

import { execSync } from 'child_process';

// =============================================================================
// Configuration
// =============================================================================

const photoDir = process.argv[2];

const CONFIG = {
	dryRun: process.argv.includes('--dry-run'),
	skipEnrichment: process.argv.includes('--skip-enrichment'),
	skipUpload: process.argv.includes('--skip-upload'),
	skipSync: process.argv.includes('--skip-sync')
};

if (!photoDir) {
	console.error('Usage: npx tsx scripts/process-new-album.ts <photo-directory> [options]');
	console.error('');
	console.error('Options:');
	console.error('  --dry-run            Preview changes without making them');
	console.error('  --skip-enrichment    Skip AI enrichment (photos already enriched)');
	console.error('  --skip-upload        Skip CF Images upload (already uploaded)');
	console.error('  --skip-sync          Skip Supabase sync');
	console.error('');
	console.error('Examples:');
	console.error('  npx tsx scripts/process-new-album.ts /path/to/photos');
	console.error('  npx tsx scripts/process-new-album.ts /path/to/photos --dry-run');
	console.error('  npx tsx scripts/process-new-album.ts /path/to/photos --skip-enrichment');
	process.exit(1);
}

// =============================================================================
// Workflow Steps
// =============================================================================

let albumKey: string | null = null;

console.log('\n' + '='.repeat(70));
console.log('🚀 PROCESS NEW ALBUM - Complete Workflow');
console.log('='.repeat(70));
console.log('\n📂 Photo Directory:', photoDir);

if (CONFIG.dryRun) {
	console.log('🧪 DRY RUN MODE - No changes will be made');
}

console.log('\n📋 Workflow Steps:');
console.log(`   ${CONFIG.skipEnrichment ? '⏭️ ' : '✓ '} Step 1: AI Enrichment (Gemini)`);
console.log(`   ${CONFIG.skipUpload || CONFIG.skipSync ? '⏭️ ' : '✓ '} Step 2: Upload to CF Images + Sync to Supabase`);

// =============================================================================
// Step 1: AI Enrichment
// =============================================================================

if (!CONFIG.skipEnrichment) {
	console.log('\n' + '='.repeat(70));
	console.log('STEP 1: AI Enrichment with Gemini');
	console.log('='.repeat(70));

	try {
		const enrichCmd = `npx tsx scripts/enrich-local-photos.ts "${photoDir}"${CONFIG.dryRun ? ' --dry-run' : ''}`;
		console.log(`\n💡 Running: ${enrichCmd}\n`);
		execSync(enrichCmd, { stdio: 'inherit' });
	} catch (error) {
		console.error('\n❌ Enrichment failed');
		process.exit(1);
	}
} else {
	console.log('\n⏭️  Skipping enrichment (--skip-enrichment)');
}

// =============================================================================
// Step 2: Upload to CF Images + Sync to Supabase
// =============================================================================

if (!CONFIG.skipUpload && !CONFIG.skipSync) {
	console.log('\n' + '='.repeat(70));
	console.log('STEP 2: Upload to Cloudflare Images + Sync to Supabase');
	console.log('='.repeat(70));

	try {
		const syncCmd = `npx tsx scripts/sync-local-to-supabase.ts "${photoDir}"${CONFIG.dryRun ? ' --dry-run' : ''}`;
		console.log(`\n💡 Running: ${syncCmd}\n`);

		// Capture output to extract album key
		const output = execSync(syncCmd, { encoding: 'utf-8', stdio: 'pipe' });

		// Display output
		console.log(output);

		// Extract album key from output
		const albumKeyMatch = output.match(/Album Key: (\w+)/);
		if (albumKeyMatch) {
			albumKey = albumKeyMatch[1];
			console.log(`\n✅ Captured Album Key: ${albumKey}`);
		}
	} catch (error) {
		console.error('\n❌ Upload + sync failed');
		process.exit(1);
	}
} else {
	console.log('\n⏭️  Skipping upload/sync');
}

// =============================================================================
// Final Summary
// =============================================================================

console.log('\n' + '='.repeat(70));
console.log('✅ WORKFLOW COMPLETE!');
console.log('='.repeat(70));

if (!CONFIG.dryRun) {
	console.log('\n🎉 Your album is now live!\n');
	console.log('📸 Photos enriched with AI metadata');
	console.log('☁️  Uploaded to Cloudflare Images');
	console.log('💾 Synced to Supabase database');
	console.log('\n🌐 Visit your gallery:');
	console.log('   https://photography.ninochavez.co');

	if (albumKey) {
		console.log(`\n📊 Album Key: ${albumKey}`);
		console.log('   Save this for future reference');
	}
} else {
	console.log('\n🧪 Dry run complete - no changes were made');
	console.log('   Remove --dry-run to process for real');
}

console.log('\n' + '='.repeat(70) + '\n');
