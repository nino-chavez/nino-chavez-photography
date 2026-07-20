#!/usr/bin/env node
/**
 * Backfill: fix black default thumbnails on already-live Cloudflare Stream
 * videos (see scripts/lib/video-thumbnail.ts for why they're black).
 *
 * Idempotent and safe to re-run or run unscoped over the whole table: each
 * video's CURRENT thumbnail is brightness-checked first, and only near-black
 * ones get re-picked + patched. Concurrency-limited worker pool, same pattern
 * as scripts/ingest-album.ts.
 *
 * Usage:
 *   npx tsx scripts/backfill-video-thumbnails.ts [--album-key jq1Rp7] \
 *     [--concurrency 4] [--limit N] [--dry-run]
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';
import { fetchThumbnailBuffer, meanBrightness, isNearBlack, fixThumbnail } from './lib/video-thumbnail';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_STREAM_API_TOKEN = process.env.CF_STREAM_API_TOKEN;
const SUBDOMAIN = process.env.VITE_CF_STREAM_SUBDOMAIN;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !CF_ACCOUNT_ID || !CF_STREAM_API_TOKEN || !SUBDOMAIN) {
	console.error('Missing env (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CF_ACCOUNT_ID, CF_STREAM_API_TOKEN, VITE_CF_STREAM_SUBDOMAIN)');
	process.exit(1);
}

const arg = (k: string, d?: string) => {
	const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
	if (hit) return hit.split('=').slice(1).join('=');
	const i = process.argv.indexOf(`--${k}`);
	return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};
const ALBUM_KEY = arg('album-key');
const CONCURRENCY = Math.max(1, parseInt(arg('concurrency', '4')!, 10));
const LIMIT = arg('limit') ? parseInt(arg('limit')!, 10) : undefined;
const DRY = process.argv.includes('--dry-run');

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

interface VideoRow {
	video_id: string;
	cf_stream_id: string;
	duration_seconds: number | null;
	title: string | null;
	album_key: string | null;
}

async function main() {
	let query = supabase
		.from('video_metadata')
		.select('video_id, cf_stream_id, duration_seconds, title, album_key')
		.order('created_at', { ascending: true });
	if (ALBUM_KEY) query = query.eq('album_key', ALBUM_KEY);
	const { data, error } = await query;
	if (error) { console.error('Query failed:', error.message); process.exit(1); }

	let rows = (data || []) as VideoRow[];
	if (LIMIT) rows = rows.slice(0, LIMIT);
	console.log(`${rows.length} videos to check${ALBUM_KEY ? ` (album ${ALBUM_KEY})` : ''}${DRY ? ' [dry-run]' : ''}\n`);

	let checked = 0, fixed = 0, alreadyOk = 0, failed = 0, index = 0;
	const t0 = Date.now();

	async function worker() {
		while (index < rows.length) {
			const row = rows[index++];
			const duration = row.duration_seconds || 6; // Stream rejects pct=NaN; floor for missing durations
			try {
				const currentBuf = await fetchThumbnailBuffer(row.cf_stream_id, SUBDOMAIN!);
				const brightness = await meanBrightness(currentBuf);
				checked++;

				if (!isNearBlack(brightness)) {
					alreadyOk++;
				} else if (DRY) {
					console.log(`  [DRY] would fix ${row.cf_stream_id} "${row.title || row.video_id}" (brightness ${brightness.toFixed(1)})`);
					fixed++;
				} else {
					const pick = await fixThumbnail(row.cf_stream_id, duration, SUBDOMAIN!, CF_ACCOUNT_ID!, CF_STREAM_API_TOKEN!);
					fixed++;
					console.log(`  ✅ ${row.cf_stream_id} "${(row.title || row.video_id).slice(0, 50)}" — ${brightness.toFixed(1)} → ${pick.meanBrightness.toFixed(1)} @${pick.time.toFixed(1)}s`);
				}
			} catch (e) {
				failed++;
				console.error(`  ❌ ${row.cf_stream_id}: ${(e as Error).message}`);
			}
			if (checked % 25 === 0) {
				const rate = checked / ((Date.now() - t0) / 1000);
				const eta = (rows.length - checked) / (rate || 1);
				console.log(`  📊 ${checked}/${rows.length} · fixed ${fixed} · ok ${alreadyOk} · failed ${failed} · ETA ${Math.ceil(eta / 60)}m`);
			}
		}
	}

	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, () => worker()));

	console.log(`\n${'='.repeat(50)}`);
	console.log(`Checked: ${checked}  Fixed: ${fixed}  Already OK: ${alreadyOk}  Failed: ${failed}`);
	console.log('='.repeat(50));
}

main();
