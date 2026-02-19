#!/usr/bin/env node
/**
 * Migrate Photos to Cloudflare Images
 *
 * Uploads photos from SmugMug to Cloudflare Images and stores the
 * returned image ID as cf_image_id in Supabase. Re-runnable: only
 * processes photos where cf_image_id IS NULL.
 *
 * Uses image_key as the CF image ID for predictable URLs.
 *
 * Required env vars in .env.local:
 *   CF_ACCOUNT_ID        - Cloudflare account ID
 *   CF_IMAGES_API_TOKEN   - Cloudflare Images API token
 *   VITE_SUPABASE_URL     - Supabase URL
 *   SUPABASE_SERVICE_ROLE_KEY - Supabase service role key
 *
 * Usage:
 *   npx tsx scripts/migrate-to-cloudflare-images.ts                # Run migration
 *   npx tsx scripts/migrate-to-cloudflare-images.ts --dry-run      # Preview only
 *   npx tsx scripts/migrate-to-cloudflare-images.ts --limit=100    # Process first 100
 *   npx tsx scripts/migrate-to-cloudflare-images.ts --batch-size=25 # Custom batch size
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

// =============================================================================
// Configuration
// =============================================================================

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_IMAGES_API_TOKEN = process.env.CF_IMAGES_API_TOKEN;

const CONFIG = {
	dryRun: process.argv.includes('--dry-run'),
	limit: parseInt(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || '0') || undefined,
	batchSize: parseInt(process.argv.find((arg) => arg.startsWith('--batch-size='))?.split('=')[1] || '50'),
	concurrency: parseInt(process.argv.find((arg) => arg.startsWith('--concurrency='))?.split('=')[1] || '10'),
	batchDelayMs: 500
};

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('Missing Supabase credentials (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
	process.exit(1);
}

if (!CF_ACCOUNT_ID || !CF_IMAGES_API_TOKEN) {
	console.error('Missing Cloudflare credentials (CF_ACCOUNT_ID, CF_IMAGES_API_TOKEN)');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CF_IMAGES_API = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/images/v1`;

// =============================================================================
// Types
// =============================================================================

interface PhotoRow {
	image_key: string;
	ImageUrl: string | null;
	OriginalUrl: string | null;
}

interface MigrationError {
	image_key: string;
	url: string;
	error: string;
	status?: number;
}

interface MigrationStats {
	total: number;
	uploaded: number;
	alreadyExists: number;
	failed: number;
	skipped: number;
	errors: MigrationError[];
	startTime: string;
	endTime?: string;
	durationMs?: number;
}

// =============================================================================
// Cloudflare Images API
// =============================================================================

interface CFUploadResponse {
	success: boolean;
	errors: Array<{ code: number; message: string }>;
	result?: {
		id: string;
		filename: string;
		uploaded: string;
		variants: string[];
	};
}

async function uploadToCFImages(imageUrl: string, imageId: string): Promise<CFUploadResponse> {
	const formData = new FormData();
	formData.append('url', imageUrl);
	formData.append('id', imageId);

	const response = await fetch(CF_IMAGES_API, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${CF_IMAGES_API_TOKEN}`
		},
		body: formData
	});

	return (await response.json()) as CFUploadResponse;
}

// =============================================================================
// Migration Logic
// =============================================================================

async function fetchPendingPhotos(limit?: number): Promise<PhotoRow[]> {
	const PAGE_SIZE = 1000;
	const allPhotos: PhotoRow[] = [];
	let offset = 0;

	while (true) {
		const currentLimit = limit ? Math.min(PAGE_SIZE, limit - allPhotos.length) : PAGE_SIZE;

		const { data, error } = await supabase
			.from('photo_metadata')
			.select('image_key, ImageUrl, OriginalUrl')
			.is('cf_image_id', null)
			.not('ImageUrl', 'is', null)
			.order('image_key')
			.range(offset, offset + currentLimit - 1);

		if (error) {
			console.error('Failed to fetch pending photos:', error.message);
			process.exit(1);
		}

		if (!data || data.length === 0) break;
		allPhotos.push(...data);

		// Stop if we hit the user-specified limit or got fewer than a full page
		if (limit && allPhotos.length >= limit) break;
		if (data.length < currentLimit) break;
		offset += data.length;
	}

	return allPhotos;
}

async function updateCfImageId(imageKey: string, cfImageId: string): Promise<boolean> {
	const { error } = await supabase
		.from('photo_metadata')
		.update({ cf_image_id: cfImageId })
		.eq('image_key', imageKey);

	if (error) {
		console.error(`  Failed to update ${imageKey}:`, error.message);
		return false;
	}

	return true;
}

function getSourceUrl(photo: PhotoRow): string | null {
	return photo.OriginalUrl || photo.ImageUrl;
}

/**
 * Get a SmugMug resized URL (X4 = 4000px, ~1-2MB) as fallback for oversized originals.
 * SmugMug URL pattern: .../SIZE/filename-SIZE.jpg
 */
function getResizedSmugMugUrl(photo: PhotoRow): string | null {
	const url = photo.ImageUrl || photo.OriginalUrl;
	if (!url || !url.includes('smugmug.com')) return null;

	// Replace size code in path and filename (e.g., /O/ -> /X4/, -O.jpg -> -X4.jpg)
	return url
		.replace(/\/([A-Z][a-z0-9]?|O|Th|X[2-5])\//, '/X4/')
		.replace(/-([A-Z][a-z0-9]?|O|Th|X[2-5])\./, '-X4.');
}

async function processOnePhoto(photo: PhotoRow, stats: MigrationStats): Promise<void> {
	const sourceUrl = getSourceUrl(photo);
	if (!sourceUrl) {
		stats.skipped++;
		return;
	}

	if (CONFIG.dryRun) {
		stats.uploaded++;
		return;
	}

	try {
		let result = await uploadToCFImages(sourceUrl, photo.image_key);

		// Retry once on transient errors (auth errors, network issues)
		const isTransient = result.errors?.some((e) => e.message?.includes('internal server error') || e.message?.includes('authentication'));
		if (isTransient) {
			await new Promise((r) => setTimeout(r, 1000));
			result = await uploadToCFImages(sourceUrl, photo.image_key);
		}

		// Fallback: if original is too large, retry with SmugMug X4 resize (4000px, ~1-2MB)
		const isSizeError = result.errors?.some((e) => e.message?.includes('size limit'));
		if (isSizeError) {
			const resizedUrl = getResizedSmugMugUrl(photo);
			if (resizedUrl) {
				result = await uploadToCFImages(resizedUrl, photo.image_key);
			}
		}

		if (result.success && result.result) {
			const updated = await updateCfImageId(photo.image_key, result.result.id);
			if (updated) {
				stats.uploaded++;
			} else {
				stats.failed++;
				stats.errors.push({ image_key: photo.image_key, url: sourceUrl, error: 'Supabase update failed' });
			}
		} else if (result.errors?.some((e) => e.code === 5409)) {
			const updated = await updateCfImageId(photo.image_key, photo.image_key);
			if (updated) stats.alreadyExists++;
		} else {
			const errorMsg = result.errors?.map((e) => e.message).join('; ') || 'Unknown error';
			stats.failed++;
			stats.errors.push({ image_key: photo.image_key, url: sourceUrl, error: errorMsg, status: result.errors?.[0]?.code });
			console.error(`    FAIL ${photo.image_key}: ${errorMsg}`);
		}
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		stats.failed++;
		stats.errors.push({ image_key: photo.image_key, url: sourceUrl, error: errorMsg });
		console.error(`    FAIL ${photo.image_key}: ${errorMsg}`);
	}
}

/** Run up to N promises concurrently */
async function runConcurrent<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
	let index = 0;
	async function worker() {
		while (index < items.length) {
			const i = index++;
			await fn(items[i]);
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
}

async function processBatch(
	batch: PhotoRow[],
	batchNum: number,
	totalBatches: number,
	stats: MigrationStats
): Promise<void> {
	console.log(`\n  Batch ${batchNum}/${totalBatches} (${batch.length} photos, ${CONFIG.concurrency} concurrent)`);

	await runConcurrent(batch, CONFIG.concurrency, (photo) => processOnePhoto(photo, stats));

	// Progress bar
	const processed = stats.uploaded + stats.alreadyExists + stats.failed + stats.skipped;
	const pct = Math.round((processed / stats.total) * 100);
	const bar = '\u2588'.repeat(Math.round(pct / 2)) + '\u2591'.repeat(50 - Math.round(pct / 2));
	console.log(`  [${bar}] ${pct}% (${processed}/${stats.total})`);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
	const dateStr = new Date().toISOString().split('T')[0];

	console.log('\n\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510');
	console.log('\u2502  Cloudflare Images Migration                    \u2502');
	console.log('\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518');

	if (CONFIG.dryRun) {
		console.log('\n  MODE: DRY RUN (no changes will be made)\n');
	}

	console.log(`  Batch size: ${CONFIG.batchSize}`);
	console.log(`  Concurrency: ${CONFIG.concurrency} parallel uploads`);
	console.log(`  Batch delay: ${CONFIG.batchDelayMs}ms`);
	if (CONFIG.limit) {
		console.log(`  Limit: ${CONFIG.limit} photos`);
	}

	// Fetch pending photos
	console.log('\n  Querying pending photos (cf_image_id IS NULL)...');
	const photos = await fetchPendingPhotos(CONFIG.limit);

	if (photos.length === 0) {
		console.log('\n  All photos already migrated! Nothing to do.');
		return;
	}

	console.log(`  Found ${photos.length.toLocaleString()} photos to migrate\n`);

	const stats: MigrationStats = {
		total: photos.length,
		uploaded: 0,
		alreadyExists: 0,
		failed: 0,
		skipped: 0,
		errors: [],
		startTime: new Date().toISOString()
	};

	// Process in batches
	const totalBatches = Math.ceil(photos.length / CONFIG.batchSize);

	for (let i = 0; i < photos.length; i += CONFIG.batchSize) {
		const batchNum = Math.floor(i / CONFIG.batchSize) + 1;
		const batch = photos.slice(i, i + CONFIG.batchSize);

		await processBatch(batch, batchNum, totalBatches, stats);

		// Delay between batches (except last)
		if (i + CONFIG.batchSize < photos.length) {
			await new Promise((r) => setTimeout(r, CONFIG.batchDelayMs));
		}
	}

	// Summary
	stats.endTime = new Date().toISOString();
	stats.durationMs = new Date(stats.endTime).getTime() - new Date(stats.startTime).getTime();

	const durationSec = Math.round(stats.durationMs / 1000);
	const durationMin = Math.round(durationSec / 60);

	console.log('\n\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510');
	console.log('\u2502  Migration Complete                              \u2502');
	console.log('\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518');
	console.log(`  Uploaded:       ${stats.uploaded.toLocaleString()}`);
	console.log(`  Already exists: ${stats.alreadyExists.toLocaleString()}`);
	console.log(`  Failed:         ${stats.failed.toLocaleString()}`);
	console.log(`  Skipped:        ${stats.skipped.toLocaleString()}`);
	console.log(`  Duration:       ${durationMin > 0 ? `${durationMin}m ${durationSec % 60}s` : `${durationSec}s`}`);

	// Write error log if any failures
	if (stats.errors.length > 0) {
		const logDir = resolve(process.cwd(), '.temp/logs');
		mkdirSync(logDir, { recursive: true });
		const logPath = resolve(logDir, `cf-migration-${dateStr}.json`);
		writeFileSync(logPath, JSON.stringify(stats, null, 2));
		console.log(`\n  Error log: ${logPath}`);
	}

	// Verification query hint
	console.log('\n  Verify with:');
	console.log('    SELECT COUNT(*) FROM photo_metadata WHERE cf_image_id IS NULL AND "ImageUrl" IS NOT NULL;');
	console.log('');
}

main().catch((err) => {
	console.error('Migration failed:', err);
	process.exit(1);
});
