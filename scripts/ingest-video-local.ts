#!/usr/bin/env node
/**
 * Ingest LOCAL video files into Cloudflare Stream + video_metadata.
 *
 * Companion to migrate-smugmug-videos.ts, for videos that originate locally
 * (e.g. exported reels) rather than from SmugMug. Direct-uploads each file to
 * Cloudflare Stream, polls until ready, enables an MP4 download (so the file is
 * fetchable by external services like the Instagram publishing API), records
 * the row in video_metadata, and writes a filename → {stream id, download URL,
 * thumbnail} map for downstream consumers.
 *
 * Required env (.env.local): VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   CF_ACCOUNT_ID, CF_STREAM_API_TOKEN, VITE_CF_STREAM_SUBDOMAIN
 *
 * Usage:
 *   npx tsx scripts/ingest-video-local.ts --dir "/path/to/videos" \
 *     --album-key bell-pepper-2026 --album-name "Bell Pepper Open 2026" \
 *     --out /tmp/stream-map.json [--dry-run]
 */
import { config } from 'dotenv';
import { resolve, basename, join } from 'path';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'fs';

config({ path: resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_STREAM_API_TOKEN = process.env.CF_STREAM_API_TOKEN;
const SUBDOMAIN = process.env.VITE_CF_STREAM_SUBDOMAIN;
const CF_STREAM_API = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream`;

const arg = (k: string, d?: string) => {
	const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
	if (hit) return hit.split('=').slice(1).join('=');
	const i = process.argv.indexOf(`--${k}`);
	return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};
const DIR = arg('dir');
const ALBUM_KEY = arg('album-key', 'local');
const ALBUM_NAME = arg('album-name', ALBUM_KEY);
const OUT = arg('out', '/tmp/stream-map.json');
const DRY = process.argv.includes('--dry-run');
const POLL_INTERVAL = 5000;
const POLL_TIMEOUT = 300_000;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !CF_ACCOUNT_ID || !CF_STREAM_API_TOKEN) {
	console.error('Missing env (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CF_ACCOUNT_ID, CF_STREAM_API_TOKEN)');
	process.exit(1);
}
if (!DIR || !existsSync(DIR)) { console.error(`--dir not found: ${DIR}`); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function directUpload(filePath: string, name: string): Promise<string> {
	const buf = readFileSync(filePath);
	const form = new FormData();
	form.append('file', new Blob([buf], { type: 'video/mp4' }), name);
	const res = await fetch(CF_STREAM_API, {
		method: 'POST',
		headers: { Authorization: `Bearer ${CF_STREAM_API_TOKEN}` },
		body: form,
	});
	if (!res.ok) throw new Error(`Stream upload ${res.status}: ${await res.text()}`);
	const data = await res.json();
	return data.result.uid;
}

async function pollReady(uid: string): Promise<{ thumbnail: string; duration: number }> {
	const start = Date.now();
	while (Date.now() - start < POLL_TIMEOUT) {
		const res = await fetch(`${CF_STREAM_API}/${uid}`, { headers: { Authorization: `Bearer ${CF_STREAM_API_TOKEN}` } });
		if (!res.ok) throw new Error(`Stream poll ${res.status}`);
		const v = (await res.json()).result;
		if (v.status?.state === 'error') throw new Error(`Stream error: ${v.status.errorReasonCode}`);
		if (v.readyToStream) return {
			thumbnail: v.thumbnail || `https://customer-${SUBDOMAIN}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg`,
			duration: Math.round(v.duration || 0),
		};
		await sleep(POLL_INTERVAL);
	}
	throw new Error(`Timeout: ${uid} not ready`);
}

// Enable an MP4 download and wait until it's generated. Returns the public MP4 URL.
async function enableDownload(uid: string): Promise<string> {
	const res = await fetch(`${CF_STREAM_API}/${uid}/downloads`, {
		method: 'POST', headers: { Authorization: `Bearer ${CF_STREAM_API_TOKEN}` },
	});
	if (!res.ok) throw new Error(`Stream downloads ${res.status}: ${await res.text()}`);
	const start = Date.now();
	while (Date.now() - start < POLL_TIMEOUT) {
		const r = await fetch(`${CF_STREAM_API}/${uid}/downloads`, { headers: { Authorization: `Bearer ${CF_STREAM_API_TOKEN}` } });
		const d = (await r.json()).result?.default;
		if (d?.status === 'ready') return d.url;
		await sleep(POLL_INTERVAL);
	}
	throw new Error(`Timeout: download for ${uid} not ready`);
}

async function main() {
	const files = readdirSync(DIR!).filter((f) => f.toLowerCase().endsWith('.mp4'))
		.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
	console.log(`${files.length} mp4s in ${DIR} → album "${ALBUM_KEY}"${DRY ? ' [dry-run]' : ''}\n`);

	const map: Record<string, { cf_stream_id: string; download_url: string; thumbnail: string }> = existsSync(OUT!)
		? JSON.parse(readFileSync(OUT!, 'utf8')) : {};

	for (const file of files) {
		if (map[file]?.download_url) { console.log(`• ${file} — already ingested, skip`); continue; }
		// idempotent: skip if a row with this title already exists for the album
		const { data: existing } = await supabase.from('video_metadata').select('cf_stream_id')
			.eq('album_key', ALBUM_KEY).eq('title', file).maybeSingle();
		if (existing) { console.log(`• ${file} — in DB, skip`); continue; }
		if (DRY) { console.log(`• ${file} — would upload`); continue; }

		try {
			process.stdout.write(`• ${file} — uploading… `);
			const uid = await directUpload(join(DIR!, file), file);
			const { thumbnail, duration } = await pollReady(uid);
			const download_url = await enableDownload(uid);
			const { error } = await supabase.from('video_metadata').insert({
				cf_stream_id: uid, cf_stream_thumbnail: thumbnail,
				source_platform: 'local', source_url: file,
				album_key: ALBUM_KEY, album_name: ALBUM_NAME,
				title: file, duration_seconds: duration || null,
				sport_type: 'volleyball', video_category: 'highlights',
			});
			if (error) throw new Error(`Supabase insert: ${error.message}`);
			map[file] = { cf_stream_id: uid, download_url, thumbnail };
			writeFileSync(OUT!, JSON.stringify(map, null, 2)); // persist after each
			console.log(`done (${uid}, ${duration}s)`);
		} catch (e) {
			console.error(`FAILED ${file}: ${(e as Error).message}`);
		}
	}
	console.log(`\nMap written to ${OUT} (${Object.keys(map).length} entries)`);
}

main();
