#!/usr/bin/env node
/**
 * Migrate SmugMug Videos to Cloudflare Stream
 *
 * Fetches video metadata from SmugMug albums, uploads to Cloudflare Stream
 * via copy-from-URL, polls for readyToStream status, and inserts metadata
 * into the video_metadata Supabase table.
 *
 * Required env vars in .env.local:
 *   VITE_SUPABASE_URL         - Supabase URL
 *   SUPABASE_SERVICE_ROLE_KEY  - Supabase service role key
 *   SMUGMUG_API_KEY            - SmugMug API consumer key
 *   SMUGMUG_API_SECRET         - SmugMug API consumer secret
 *   SMUGMUG_ACCESS_TOKEN       - SmugMug OAuth access token
 *   SMUGMUG_ACCESS_TOKEN_SECRET - SmugMug OAuth access token secret
 *   CF_ACCOUNT_ID              - Cloudflare account ID
 *   CF_STREAM_API_TOKEN        - Cloudflare Stream API token
 *
 * Usage:
 *   npx tsx scripts/migrate-smugmug-videos.ts                 # Run migration
 *   npx tsx scripts/migrate-smugmug-videos.ts --dry-run       # Preview only
 *   npx tsx scripts/migrate-smugmug-videos.ts --album=QwhCK5  # Single album
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

// =============================================================================
// Configuration
// =============================================================================

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SMUGMUG_API_KEY = process.env.SMUGMUG_API_KEY || process.env.VITE_SMUGMUG_API_KEY;
const SMUGMUG_API_SECRET = process.env.SMUGMUG_API_SECRET || process.env.VITE_SMUGMUG_API_SECRET;
const SMUGMUG_ACCESS_TOKEN = process.env.SMUGMUG_ACCESS_TOKEN || process.env.VITE_SMUGMUG_ACCESS_TOKEN;
const SMUGMUG_ACCESS_TOKEN_SECRET = process.env.SMUGMUG_ACCESS_TOKEN_SECRET || process.env.VITE_SMUGMUG_ACCESS_TOKEN_SECRET;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_STREAM_API_TOKEN = process.env.CF_STREAM_API_TOKEN;

const CONFIG = {
	dryRun: process.argv.includes('--dry-run'),
	singleAlbum: process.argv.find((arg) => arg.startsWith('--album='))?.split('=')[1],
	pollIntervalMs: 5000,
	pollTimeoutMs: 300_000, // 5 minutes per video
};

// LPO video albums to migrate
const VIDEO_ALBUM_KEYS = ['QwhCK5', 'p4J2jk'];

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('Missing Supabase credentials (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
	process.exit(1);
}

if (!SMUGMUG_API_KEY || !SMUGMUG_API_SECRET || !SMUGMUG_ACCESS_TOKEN || !SMUGMUG_ACCESS_TOKEN_SECRET) {
	console.error('Missing SmugMug credentials');
	process.exit(1);
}

if (!CF_ACCOUNT_ID || !CF_STREAM_API_TOKEN) {
	console.error('Missing Cloudflare Stream credentials (CF_ACCOUNT_ID, CF_STREAM_API_TOKEN)');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CF_STREAM_API = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream`;

// =============================================================================
// SmugMug OAuth Client
// =============================================================================

function createOAuthClient() {
	return new OAuth({
		consumer: {
			key: SMUGMUG_API_KEY!,
			secret: SMUGMUG_API_SECRET!,
		},
		signature_method: 'HMAC-SHA1',
		hash_function(baseString, key) {
			return crypto.createHmac('sha1', key).update(baseString).digest('base64');
		},
	});
}

const oauthToken = { key: SMUGMUG_ACCESS_TOKEN!, secret: SMUGMUG_ACCESS_TOKEN_SECRET! };

async function smugmugFetch(endpoint: string): Promise<any> {
	const oauth = createOAuthClient();
	const url = `https://api.smugmug.com${endpoint}`;
	const authHeader = oauth.toHeader(oauth.authorize({ url, method: 'GET' }, oauthToken));

	const response = await fetch(url, {
		headers: {
			...authHeader,
			Accept: 'application/json',
		},
	});

	if (!response.ok) {
		throw new Error(`SmugMug API error ${response.status}: ${await response.text()}`);
	}

	return response.json();
}

// =============================================================================
// Types
// =============================================================================

interface SmugMugVideo {
	ImageKey: string;
	Title: string;
	Caption: string;
	FileName: string;
	Duration: number;
	OriginalWidth: number;
	OriginalHeight: number;
	Date: string;
	ArchivedUri: string;
	WebUri: string;
	IsVideo: boolean;
	// Resolved from LargestVideo expansion
	videoUrl?: string;
	videoDuration?: number;
}

interface MigrationResult {
	albumKey: string;
	videoKey: string;
	title: string;
	cfStreamId: string;
	status: 'uploaded' | 'skipped' | 'error';
	error?: string;
}

// =============================================================================
// SmugMug: Fetch video metadata from album
// =============================================================================

async function fetchAlbumVideos(albumKey: string): Promise<SmugMugVideo[]> {
	console.log(`\n  Fetching videos from album ${albumKey}...`);

	const data = await smugmugFetch(
		`/api/v2/album/${albumKey}!images?count=100&_expand=LargestVideo&_filter=ImageKey,Title,Caption,FileName,Duration,OriginalWidth,OriginalHeight,Date,ArchivedUri,WebUri,IsVideo`
	);

	const images = data.Response?.AlbumImage || [];
	const expansions = data.Expansions || {};
	const videos = images.filter((img: any) => img.IsVideo);

	// Resolve actual video URLs from LargestVideo expansions
	for (const video of videos) {
		const key = video.ImageKey;
		// Expansion keys use the format: /api/v2/image/{key}-0!largestvideo
		const expKey = Object.keys(expansions).find((k) => k.includes(key) && k.includes('largestvideo'));
		if (expKey) {
			const largest = expansions[expKey]?.LargestVideo;
			if (largest?.Url) {
				video.videoUrl = largest.Url;
				video.videoDuration = largest.Duration ? parseFloat(largest.Duration) : undefined;
			}
		}
	}

	const withUrl = videos.filter((v: SmugMugVideo) => v.videoUrl);
	console.log(`  Found ${videos.length} videos (${withUrl.length} with download URLs) of ${images.length} total items`);
	return videos;
}

// =============================================================================
// Cloudflare Stream: Upload via copy-from-URL
// =============================================================================

async function uploadToStream(videoUrl: string, meta: Record<string, string>): Promise<string> {
	const response = await fetch(`${CF_STREAM_API}/copy`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${CF_STREAM_API_TOKEN}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			url: videoUrl,
			meta,
		}),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`CF Stream upload error ${response.status}: ${text}`);
	}

	const data = await response.json();
	return data.result.uid;
}

async function pollStreamReady(streamId: string): Promise<{ thumbnail: string; duration: number }> {
	const startTime = Date.now();

	while (Date.now() - startTime < CONFIG.pollTimeoutMs) {
		const response = await fetch(`${CF_STREAM_API}/${streamId}`, {
			headers: { Authorization: `Bearer ${CF_STREAM_API_TOKEN}` },
		});

		if (!response.ok) {
			throw new Error(`CF Stream poll error ${response.status}`);
		}

		const data = await response.json();
		const video = data.result;

		if (video.readyToStream) {
			return {
				thumbnail: video.thumbnail || `https://customer-f77l9nwspm9h0g13.cloudflarestream.com/${streamId}/thumbnails/thumbnail.jpg`,
				duration: Math.round(video.duration || 0),
			};
		}

		if (video.status?.state === 'error') {
			throw new Error(`CF Stream processing error: ${video.status.errorReasonCode}`);
		}

		console.log(`    Waiting for stream ${streamId} to be ready...`);
		await new Promise((resolve) => setTimeout(resolve, CONFIG.pollIntervalMs));
	}

	throw new Error(`Timeout waiting for stream ${streamId} to be ready`);
}

// =============================================================================
// Main Migration
// =============================================================================

async function migrateAlbum(albumKey: string): Promise<MigrationResult[]> {
	const results: MigrationResult[] = [];

	// Get album name
	const albumData = await smugmugFetch(`/api/v2/album/${albumKey}?_filter=Name`);
	const albumName = albumData.Response?.Album?.Name || albumKey;
	console.log(`\nMigrating album: ${albumName} (${albumKey})`);

	// Fetch videos
	const videos = await fetchAlbumVideos(albumKey);

	for (const video of videos) {
		const videoKey = video.ImageKey;
		console.log(`\n  Processing: ${video.Title || video.FileName} (${videoKey})`);

		// Check if already migrated
		const { data: existing } = await supabase
			.from('video_metadata')
			.select('video_id')
			.eq('album_key', albumKey)
			.ilike('source_url', `%${videoKey}%`)
			.maybeSingle();

		if (existing) {
			console.log(`    Skipping (already migrated)`);
			results.push({ albumKey, videoKey, title: video.Title, cfStreamId: '', status: 'skipped' });
			continue;
		}

		if (CONFIG.dryRun) {
			console.log(`    [DRY RUN] Would upload: ${video.videoUrl || '(no video URL)'}`);
			results.push({ albumKey, videoKey, title: video.Title, cfStreamId: 'dry-run', status: 'skipped' });
			continue;
		}

		try {
			// Get actual video file URL from LargestVideo expansion
			const sourceUrl = video.videoUrl;
			if (!sourceUrl) {
				throw new Error('No video download URL found (LargestVideo expansion missing)');
			}

			// Upload to CF Stream
			console.log(`    Uploading to Cloudflare Stream...`);
			const cfStreamId = await uploadToStream(sourceUrl, {
				albumKey,
				albumName,
				sourceKey: videoKey,
				title: video.Title || video.FileName,
			});
			console.log(`    Stream ID: ${cfStreamId}`);

			// Poll for ready
			console.log(`    Waiting for processing...`);
			const streamInfo = await pollStreamReady(cfStreamId);
			console.log(`    Ready! Duration: ${streamInfo.duration}s`);

			// Insert into Supabase
			const { error: insertError } = await supabase.from('video_metadata').insert({
				cf_stream_id: cfStreamId,
				cf_stream_thumbnail: streamInfo.thumbnail,
				source_platform: 'smugmug',
				source_url: sourceUrl,
				album_key: albumKey,
				album_name: albumName,
				title: video.Title || video.FileName || null,
				description: video.Caption || null,
				duration_seconds: streamInfo.duration || video.videoDuration || video.Duration || null,
				width: video.OriginalWidth || null,
				height: video.OriginalHeight || null,
				sport_type: 'volleyball',
				video_category: 'highlights',
				video_date: video.Date || null,
			});

			if (insertError) {
				throw new Error(`Supabase insert error: ${insertError.message}`);
			}

			results.push({ albumKey, videoKey, title: video.Title, cfStreamId, status: 'uploaded' });
			console.log(`    Saved to database`);
		} catch (err: any) {
			console.error(`    ERROR: ${err.message}`);
			results.push({ albumKey, videoKey, title: video.Title, cfStreamId: '', status: 'error', error: err.message });
		}
	}

	return results;
}

async function main() {
	console.log('='.repeat(60));
	console.log('SmugMug Video -> Cloudflare Stream Migration');
	console.log('='.repeat(60));

	if (CONFIG.dryRun) {
		console.log('\n  MODE: DRY RUN (no uploads or database writes)\n');
	}

	const albumKeys = CONFIG.singleAlbum ? [CONFIG.singleAlbum] : VIDEO_ALBUM_KEYS;
	const allResults: MigrationResult[] = [];

	for (const albumKey of albumKeys) {
		const results = await migrateAlbum(albumKey);
		allResults.push(...results);
	}

	// Refresh materialized view
	if (!CONFIG.dryRun && allResults.some((r) => r.status === 'uploaded')) {
		console.log('\nRefreshing videos_summary materialized view...');
		const { error } = await supabase.rpc('refresh_videos_summary');
		if (error) {
			console.error('  Warning: Could not refresh view:', error.message);
		} else {
			console.log('  Done.');
		}
	}

	// Summary
	console.log('\n' + '='.repeat(60));
	console.log('Migration Summary');
	console.log('='.repeat(60));
	const uploaded = allResults.filter((r) => r.status === 'uploaded').length;
	const skipped = allResults.filter((r) => r.status === 'skipped').length;
	const errors = allResults.filter((r) => r.status === 'error').length;
	console.log(`  Uploaded: ${uploaded}`);
	console.log(`  Skipped:  ${skipped}`);
	console.log(`  Errors:   ${errors}`);

	// Save report
	if (allResults.length > 0) {
		const dateStr = new Date().toISOString().slice(0, 10);
		mkdirSync('.temp/reports', { recursive: true });
		const reportPath = `.temp/reports/video-migration-${dateStr}.json`;
		writeFileSync(reportPath, JSON.stringify(allResults, null, 2));
		console.log(`\n  Report saved: ${reportPath}`);
	}

	if (errors > 0) {
		process.exit(1);
	}
}

main().catch((err) => {
	console.error('\nFatal error:', err);
	process.exit(1);
});
