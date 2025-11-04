#!/usr/bin/env node
/**
 * Process New Album - Complete Workflow
 *
 * One-command workflow for new album processing:
 * 1. Enrich photos with AI vision (Gemini)
 * 2. Upload to SmugMug with AI-generated album
 * 3. Sync to Supabase database
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
	console.error('  --skip-upload        Skip SmugMug upload (already uploaded)');
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
console.log(`   ${CONFIG.skipUpload ? '⏭️ ' : '✓ '} Step 2: Upload to SmugMug`);
console.log(`   ${CONFIG.skipSync ? '⏭️ ' : '✓ '} Step 3: Sync to Supabase`);

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
// Step 2: Upload to SmugMug
// =============================================================================

if (!CONFIG.skipUpload) {
	console.log('\n' + '='.repeat(70));
	console.log('STEP 2: Upload to SmugMug');
	console.log('='.repeat(70));

	try {
		const uploadCmd = `npx tsx scripts/upload-to-smugmug.ts "${photoDir}"${CONFIG.dryRun ? ' --dry-run' : ''}`;
		console.log(`\n💡 Running: ${uploadCmd}\n`);

		// Capture output to extract album key
		const output = execSync(uploadCmd, { encoding: 'utf-8', stdio: 'pipe' });

		// Display output
		console.log(output);

		// Extract album key from output
		const albumKeyMatch = output.match(/Album Key: (\w+)/);
		if (albumKeyMatch) {
			albumKey = albumKeyMatch[1];
			console.log(`\n✅ Captured Album Key: ${albumKey}`);
		} else if (!CONFIG.dryRun) {
			console.error('\n⚠️  Could not extract Album Key from output');
			console.error('You may need to manually sync with:');
			console.error('  npx tsx scripts/sync-smugmug-album.ts <album-key>');
			process.exit(1);
		}
	} catch (error) {
		console.error('\n❌ Upload failed');
		process.exit(1);
	}
} else {
	console.log('\n⏭️  Skipping upload (--skip-upload)');

	// If skipping upload, user must provide album key
	const albumKeyArg = process.argv.find((arg) => arg.startsWith('--album-key='));
	if (albumKeyArg) {
		albumKey = albumKeyArg.split('=')[1];
		console.log(`   Using provided Album Key: ${albumKey}`);
	} else if (!CONFIG.skipSync) {
		console.error('\n❌ --skip-upload requires --album-key=<key> for sync step');
		console.error('Example: --skip-upload --album-key=xSqPJB');
		process.exit(1);
	}
}

// =============================================================================
// Step 3: Sync to Supabase
// =============================================================================

if (!CONFIG.skipSync) {
	if (!albumKey && !CONFIG.dryRun) {
		console.error('\n❌ No album key available for sync');
		process.exit(1);
	}

	console.log('\n' + '='.repeat(70));
	console.log('STEP 3: Sync to Supabase');
	console.log('='.repeat(70));

	try {
		const syncCmd = `npx tsx scripts/sync-smugmug-album.ts ${albumKey || 'DRYRUN'}${CONFIG.dryRun ? ' --dry-run' : ''}`;
		console.log(`\n💡 Running: ${syncCmd}\n`);
		execSync(syncCmd, { stdio: 'inherit' });
	} catch (error) {
		console.error('\n❌ Sync failed');
		process.exit(1);
	}
} else {
	console.log('\n⏭️  Skipping sync (--skip-sync)');
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
	console.log('☁️  Uploaded to SmugMug');
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
