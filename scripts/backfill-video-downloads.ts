/**
 * Reconcile Cloudflare Stream MP4 download renditions against video_metadata.
 *
 * The gallery's video player offers a Download button and (on mobile) a Share
 * button for every clip. Both fetch `/{uid}/downloads/default.mp4`, which only
 * exists if the rendition was explicitly created — Stream does not generate one
 * on upload. `ingest-video-local.ts` creates it per clip and waits for it, but
 * anything uploaded before that step existed has none, and there is nothing in
 * the schema recording which is which: the app derives the download URL from
 * `cf_stream_id` alone, so a missing rendition is invisible until a visitor
 * clicks and lands on a 404.
 *
 * That is how 108 clips across the two video-only albums (p4J2jk, QwhCK5 — the
 * July 2025 Bell Pepper highlight sets, the earliest video work in the gallery)
 * came to show two buttons that could not work. This script is the reconciler:
 * it asks Cloudflare which clips are missing a rendition and creates the ones
 * that are, so the answer is derived from Cloudflare rather than assumed from
 * ingest history.
 *
 * Usage:
 *   npx tsx scripts/backfill-video-downloads.ts --dry-run
 *   npx tsx scripts/backfill-video-downloads.ts [--album=<album_key>]
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_STREAM_API_TOKEN = process.env.CF_STREAM_API_TOKEN;
const CF_STREAM_API = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream`;

const arg = (k: string, d?: string) => {
	const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
	if (hit) return hit.split('=').slice(1).join('=');
	const i = process.argv.indexOf(`--${k}`);
	return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};
const ALBUM = arg('album');
const DRY = process.argv.includes('--dry-run');
const CONCURRENCY = 6;
const POLL_INTERVAL = 5000;
const POLL_TIMEOUT = 600_000;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !CF_ACCOUNT_ID || !CF_STREAM_API_TOKEN) {
	console.error('Missing env (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CF_ACCOUNT_ID, CF_STREAM_API_TOKEN)');
	process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const auth = { Authorization: `Bearer ${CF_STREAM_API_TOKEN}` };

type Clip = { cf_stream_id: string; album_key: string; video_id: number };
type Rendition = { status?: string; url?: string; percentComplete?: number } | undefined;

/**
 * Stream's API rate-limits a batch this size: polling 108 clips every 5s earned a bare
 * `429` (empty body) partway through a verification run, and an unretried 429 aborts the
 * whole reconcile — which for a partially-created batch is the worst outcome, since the
 * next run cannot tell "not created" from "created, encode in flight". Retry those and
 * 5xx with backoff; let 4xx that mean something (401, 404) fail loudly.
 */
async function cfFetch(uid: string, init?: RequestInit): Promise<Response> {
	const url = `${CF_STREAM_API}/${uid}/downloads`;
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(url, { ...init, headers: auth });
		if (res.ok || (res.status !== 429 && res.status < 500) || attempt >= 5) return res;
		await sleep(2000 * 2 ** attempt);
	}
}

async function readDownload(uid: string): Promise<Rendition> {
	const res = await cfFetch(uid);
	if (!res.ok) throw new Error(`GET downloads ${uid}: ${res.status} ${await res.text()}`);
	return (await res.json()).result?.default;
}

async function createDownload(uid: string): Promise<void> {
	const res = await cfFetch(uid, { method: 'POST' });
	if (!res.ok) throw new Error(`POST downloads ${uid}: ${res.status} ${await res.text()}`);
}

/** Run `task` over `items` with a fixed number of workers, preserving input order in the result. */
async function mapLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
	const out = new Array<R>(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (next < items.length) {
				const i = next++;
				out[i] = await task(items[i]);
			}
		})
	);
	return out;
}

async function main() {
	const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);
	let query = supabase
		.from('video_metadata')
		.select('cf_stream_id, album_key, video_id')
		.order('album_key')
		.order('video_id');
	if (ALBUM) query = query.eq('album_key', ALBUM);
	const { data, error } = await query;
	if (error) throw new Error(`video_metadata: ${error.message}`);

	const clips = (data ?? []) as Clip[];
	console.log(`${clips.length} clip(s)${ALBUM ? ` in ${ALBUM}` : ''}`);

	const states = await mapLimit(clips, CONCURRENCY, async (c) => ({
		clip: c,
		rendition: await readDownload(c.cf_stream_id)
	}));

	const missing = states.filter((s) => !s.rendition);
	const pending = states.filter((s) => s.rendition && s.rendition.status !== 'ready');
	const byAlbum = new Map<string, number>();
	for (const s of missing) byAlbum.set(s.clip.album_key, (byAlbum.get(s.clip.album_key) ?? 0) + 1);

	console.log(`  ready:   ${states.length - missing.length - pending.length}`);
	console.log(`  pending: ${pending.length}`);
	console.log(`  missing: ${missing.length}`);
	for (const [album, n] of [...byAlbum].sort((a, b) => b[1] - a[1])) console.log(`    ${album}: ${n}`);

	if (!missing.length) {
		console.log('Nothing to create.');
		return;
	}
	if (DRY) {
		console.log('--dry-run: no renditions created.');
		return;
	}

	await mapLimit(missing, CONCURRENCY, async (s) => {
		await createDownload(s.clip.cf_stream_id);
	});
	console.log(`Requested ${missing.length} rendition(s); waiting for Cloudflare to encode.`);

	// Poll the whole batch rather than each clip: Stream encodes them in parallel and the
	// per-clip wait would serialize a 100-clip album into an hour of sequential timeouts.
	const start = Date.now();
	let outstanding = missing.map((s) => s.clip);
	while (outstanding.length && Date.now() - start < POLL_TIMEOUT) {
		await sleep(POLL_INTERVAL);
		const checked = await mapLimit(outstanding, CONCURRENCY, async (c) => ({
			clip: c,
			rendition: await readDownload(c.cf_stream_id)
		}));
		outstanding = checked.filter((c) => c.rendition?.status !== 'ready').map((c) => c.clip);
		const done = missing.length - outstanding.length;
		console.log(`  ready ${done}/${missing.length} (${Math.round((Date.now() - start) / 1000)}s)`);
	}

	if (outstanding.length) {
		console.error(`Timed out with ${outstanding.length} rendition(s) not ready:`);
		for (const c of outstanding) console.error(`  ${c.album_key} ${c.cf_stream_id}`);
		process.exit(1);
	}
	console.log(`Done — ${missing.length} clip(s) now downloadable.`);
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
