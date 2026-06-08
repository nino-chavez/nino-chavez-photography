#!/usr/bin/env node
/**
 * Upload Local Photos to Cloudflare Images
 *
 * Uploads local photo files directly to Cloudflare Images and updates
 * cf_image_id in Supabase. Works with photos already synced to Supabase
 * that have cf_image_id IS NULL.
 *
 * Usage:
 *   npx tsx scripts/upload-local-to-cloudflare.ts <photo-directory> <album-key>
 *   npx tsx scripts/upload-local-to-cloudflare.ts <photo-directory> <album-key> --dry-run
 *
 * Examples:
 *   npx tsx scripts/upload-local-to-cloudflare.ts /path/to/photos apdtqV
 *   npx tsx scripts/upload-local-to-cloudflare.ts /path/to/photos apdtqV --dry-run
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { readdir } from 'fs/promises';
import { readFileSync } from 'fs';
import { join, basename } from 'path';

// =============================================================================
// Configuration
// =============================================================================

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_IMAGES_API_TOKEN = process.env.CF_IMAGES_API_TOKEN;

const DRY_RUN = process.argv.includes('--dry-run');
const CONCURRENCY = 3; // CF Images write limit is ~4/s; stay under it with backoff

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
// Cloudflare Images Upload (local file)
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

async function uploadFileToCF(
	filePath: string,
	imageId: string,
	attempt = 1
): Promise<CFUploadResponse> {
	const fileBuffer = readFileSync(filePath);
	const blob = new Blob([fileBuffer], { type: 'image/jpeg' });

	const formData = new FormData();
	formData.append('file', blob, basename(filePath));
	formData.append('id', imageId);

	const response = await fetch(CF_IMAGES_API, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${CF_IMAGES_API_TOKEN}`
		},
		body: formData
	});

	// Retry on rate-limit (429) / transient 5xx with exponential backoff.
	if ((response.status === 429 || response.status >= 500) && attempt <= 6) {
		const retryAfter = parseInt(response.headers.get('retry-after') || '0', 10);
		const backoffMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(2000 * 2 ** (attempt - 1), 30000);
		await new Promise((r) => setTimeout(r, backoffMs));
		return uploadFileToCF(filePath, imageId, attempt + 1);
	}

	return (await response.json()) as CFUploadResponse;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
	const photoDir = process.argv[2];
	const albumKey = process.argv[3];

	if (!photoDir || !albumKey) {
		console.error('Usage: npx tsx scripts/upload-local-to-cloudflare.ts <photo-directory> <album-key> [--dry-run]');
		process.exit(1);
	}

	console.log('\n📤 Upload Local Photos to Cloudflare Images\n');
	console.log(`   Photo Directory: ${photoDir}`);
	console.log(`   Album Key: ${albumKey}`);
	console.log(`   Concurrency: ${CONCURRENCY}`);
	if (DRY_RUN) console.log('   🧪 DRY RUN MODE\n');

	// Get local photo files
	const files = await readdir(photoDir);
	const photos = files.filter((f) => /\.(jpg|jpeg)$/i.test(f)).sort();
	console.log(`\n📸 Found ${photos.length} local photos`);

	// Get DB records missing cf_image_id for this album
	const { data: dbRows, error } = await supabase
		.from('photo_metadata')
		.select('photo_id, image_key')
		.eq('album_key', albumKey)
		.is('cf_image_id', null);

	if (error) {
		console.error('Failed to query Supabase:', error.message);
		process.exit(1);
	}

	const pendingKeys = new Map((dbRows || []).map((r) => [r.image_key, r.photo_id]));
	console.log(`   ${pendingKeys.size} photos need Cloudflare upload\n`);

	// Match local files to pending DB records
	const toUpload = photos
		.map((f) => ({
			file: f,
			path: join(photoDir, f),
			imageKey: f.replace(/\.(jpg|jpeg)$/i, '')
		}))
		.filter((p) => pendingKeys.has(p.imageKey));

	console.log(`   ${toUpload.length} photos matched for upload\n`);

	if (toUpload.length === 0) {
		console.log('Nothing to upload!');
		return;
	}

	let uploaded = 0;
	let alreadyExists = 0;
	let failed = 0;

	// Process with concurrency
	let index = 0;
	async function worker() {
		while (index < toUpload.length) {
			const i = index++;
			const photo = toUpload[i];

			if (DRY_RUN) {
				console.log(`   [DRY] Would upload: ${photo.file} → ${albumKey}-${photo.imageKey}`);
				uploaded++;
				continue;
			}

			try {
				// Album-scoped CF id: cameras reset numbering per card, so a bare imageKey
				// collides across albums; a bare-id 5409 used to silently alias this row to
				// another album's CDN image. Prefixing album_key makes that impossible.
				const cfImageId = `${albumKey}-${photo.imageKey}`;
				const result = await uploadFileToCF(photo.path, cfImageId);

				if (result.success && result.result) {
					// Update Supabase with cf_image_id
					const { error: updateError } = await supabase
						.from('photo_metadata')
						.update({ cf_image_id: result.result.id })
						.eq('image_key', photo.imageKey)
						.eq('album_key', albumKey);

					if (updateError) {
						console.error(`   ❌ DB update failed for ${photo.imageKey}: ${updateError.message}`);
						failed++;
					} else {
						uploaded++;
					}
				} else if (result.errors?.some((e) => e.code === 5409)) {
					// 5409: an image already exists under this album-scoped id. Because the id
					// encodes album_key this is NOT a cross-album collision — but we still REFUSE
					// to silently link (that was the aliasing bug). Fail loud; never alias to an
					// image we did not just upload.
					console.error(
						`   ❌ ${photo.imageKey}: Cloudflare id "${cfImageId}" already exists — refusing to ` +
						`auto-link. If this is a re-run after a partial failure, confirm the CF image ` +
						`belongs to album ${albumKey}, then set cf_image_id="${cfImageId}" manually.`
					);
					failed++;
				} else {
					const errorMsg = result.errors?.map((e) => e.message).join('; ') || 'Unknown error';
					console.error(`   ❌ ${photo.imageKey}: ${errorMsg}`);
					failed++;
				}
			} catch (err) {
				console.error(`   ❌ ${photo.imageKey}: ${err instanceof Error ? err.message : err}`);
				failed++;
			}

			// Progress
			const done = uploaded + alreadyExists + failed;
			if (done % 10 === 0 || done === toUpload.length) {
				console.log(`   📊 Progress: ${done}/${toUpload.length} (${uploaded} uploaded, ${failed} failed)`);
			}
		}
	}

	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toUpload.length) }, () => worker()));

	// Summary
	console.log('\n============================================================');
	console.log('✅ Upload Complete!\n');
	console.log(`   Uploaded:       ${uploaded}`);
	console.log(`   Already exists: ${alreadyExists}`);
	console.log(`   Failed:         ${failed}`);
	console.log(`   Album Key:      ${albumKey}`);
	console.log('\n✨ Photos should now appear in the gallery!');
}

main().catch((err) => {
	console.error('Upload failed:', err);
	process.exit(1);
});
