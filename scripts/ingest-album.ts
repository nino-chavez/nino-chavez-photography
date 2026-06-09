#!/usr/bin/env node
/**
 * Unified album ingest (#10) — ONE pass per photo, directly to the DB. No EXIF round-trip.
 *
 * For each local image in a directory this: uploads to Cloudflare Images (album-scoped id),
 * runs the sport-aware structured extraction (caption + category + play_type + quality
 * sub-scores + players[]), embeds the caption, UPSERTs photo_metadata, and writes
 * photo_jersey_sightings. It NEVER writes EXIF, never shells out to exiftool, never writes
 * the deprecated `players`/vanity columns, and never sets sport_type (the enforce_album_sport
 * trigger mirrors it from albums.sport).
 *
 * Replaces the legacy 3-script chain (enrich-local-photos -> sync-local-to-supabase -> upload).
 *
 * SPORT IS ALBUM-AUTHORITATIVE. The album row (albums.sport) must exist before ingest, or be
 * created here with an explicit operator --sport. A photo's sport is NEVER guessed.
 *
 * Resumable: a checkpoint (.temp/ingest-<album-key>.checkpoint.json) records done image_keys;
 * idempotent because photo_id = `${albumKey}-${imageKey}` (UPSERT) and sightings dedup on
 * dedup_key. Re-running is safe.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... npx tsx scripts/ingest-album.ts \
 *     --dir /path/to/album --album-key xSqPJB --album-name "FUTURE — Fall 2025" \
 *     --sport volleyball --upload-date 2025-11-03 [--concurrency 4] [--limit N] [--dry-run] [--overwrite]
 *
 * Credentials (runtime-injected; see [[photography-live-credentials]]):
 *   OPENROUTER_API_KEY (1Password "OpenRouter photography"), Supabase creds + CF creds (.env.local).
 */
import { config } from 'dotenv';
import { resolve, join } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { readdir } from 'fs/promises';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import sharp from 'sharp';
import exifReader from 'exif-reader';

import { embedText } from '../src/lib/ai/embeddings';
import { extractOne, EXTRACTION_VERSION, INGEST_MODEL } from '../src/lib/ai/ingest-extraction';
import { shredCaptionPlayers } from '../src/lib/identity/sightings';
import { SPORTS, type Sport } from '../src/lib/ai/taxonomy';

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
function flagValue(name: string): string | undefined {
	const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
	if (eq) return eq.split('=').slice(1).join('=');
	const i = process.argv.indexOf(`--${name}`);
	if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
	return undefined;
}

const DIR = flagValue('dir');
const ALBUM_KEY = flagValue('album-key');
const ALBUM_NAME_ARG = flagValue('album-name');
const SPORT_ARG = flagValue('sport'); // 'volleyball' | ... | 'none'/'null' for non-sport
const UPLOAD_DATE = flagValue('upload-date') || new Date().toISOString().split('T')[0];
const CONCURRENCY = Math.max(1, parseInt(flagValue('concurrency') || '4', 10));
const LIMIT = parseInt(flagValue('limit') || '0', 10) || 0;
const DRY = process.argv.includes('--dry-run');
const OVERWRITE = process.argv.includes('--overwrite');
const MODEL = flagValue('model') || INGEST_MODEL;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_IMAGES_API_TOKEN = process.env.CF_IMAGES_API_TOKEN;

function die(msg: string): never {
	console.error(`❌ ${msg}`);
	process.exit(1);
}

if (!DIR || !ALBUM_KEY) {
	die('Usage: npx tsx scripts/ingest-album.ts --dir <photo-dir> --album-key <KEY> [--album-name "..."] [--sport volleyball] [--upload-date YYYY-MM-DD] [--concurrency 4] [--limit N] [--dry-run] [--overwrite]');
}
if (!OPENROUTER_API_KEY) die('OPENROUTER_API_KEY required (1Password "OpenRouter photography")');
if (!SUPABASE_URL || !SUPABASE_KEY) die('Supabase creds required (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
if (!CF_ACCOUNT_ID || !CF_IMAGES_API_TOKEN) die('Cloudflare creds required (CF_ACCOUNT_ID, CF_IMAGES_API_TOKEN)');

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const CF_IMAGES_API = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/images/v1`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Cloudflare upload (album-scoped id; 5409 is an ERROR, never an alias — Phase 0 invariant)
// ---------------------------------------------------------------------------
interface CFUploadResponse {
	success: boolean;
	errors: Array<{ code: number; message: string }>;
	result?: { id: string; variants: string[] };
}

async function uploadToCF(fileBuffer: Buffer, imageId: string, fileName: string, attempt = 1): Promise<CFUploadResponse> {
	const form = new FormData();
	form.append('file', new Blob([new Uint8Array(fileBuffer)], { type: 'image/jpeg' }), fileName);
	form.append('id', imageId);
	const res = await fetch(CF_IMAGES_API, {
		method: 'POST',
		headers: { Authorization: `Bearer ${CF_IMAGES_API_TOKEN}` },
		body: form,
	});
	if ((res.status === 429 || res.status >= 500) && attempt <= 6) {
		const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
		await sleep(retryAfter > 0 ? retryAfter * 1000 : Math.min(2000 * 2 ** (attempt - 1), 30000));
		return uploadToCF(fileBuffer, imageId, fileName, attempt + 1);
	}
	return (await res.json()) as CFUploadResponse;
}

// ---------------------------------------------------------------------------
// Checkpoint
// ---------------------------------------------------------------------------
const CK_DIR = '.temp';
if (!existsSync(CK_DIR)) mkdirSync(CK_DIR, { recursive: true });
const CK_PATH = join(CK_DIR, `ingest-${ALBUM_KEY}.checkpoint.json`);
interface Checkpoint { done: string[]; failed: Record<string, string>; updatedAt: string; }
let ck: Checkpoint = { done: [], failed: {}, updatedAt: '' };
if (existsSync(CK_PATH) && !OVERWRITE) {
	try { ck = JSON.parse(readFileSync(CK_PATH, 'utf-8')); } catch { /* fresh */ }
}
const done = new Set(ck.done);
function saveCheckpoint() {
	ck.done = [...done];
	ck.updatedAt = new Date().toISOString();
	writeFileSync(CK_PATH, JSON.stringify(ck, null, 2));
}

// ---------------------------------------------------------------------------
// Album-sport gate — resolve the album's authoritative sport (or create the row)
// ---------------------------------------------------------------------------
async function resolveAlbum(): Promise<{ sport: Sport | null; albumName: string }> {
	const { data: existing, error } = await sb
		.from('albums')
		.select('album_key, album_name, sport')
		.eq('album_key', ALBUM_KEY!)
		.maybeSingle();
	if (error) die(`albums lookup failed: ${error.message}`);

	const parseSportArg = (): Sport | null => {
		if (SPORT_ARG === undefined) return null;
		const s = SPORT_ARG.toLowerCase();
		if (s === 'none' || s === 'null' || s === '') return null;
		if (!(SPORTS as readonly string[]).includes(s)) {
			die(`--sport "${SPORT_ARG}" is not a taxonomy sport. Valid: ${SPORTS.join(', ')} (or "none" for a non-sport album)`);
		}
		return s as Sport;
	};

	if (existing) {
		// Album exists: its sport is authoritative. --sport may only AGREE (guard against a typo'd re-run).
		const sport = (existing.sport ?? null) as Sport | null;
		if (SPORT_ARG !== undefined) {
			const declared = parseSportArg();
			if (declared !== sport) {
				die(`--sport "${SPORT_ARG}" disagrees with the album's authoritative sport "${sport ?? 'none'}". ` +
					`Fix albums.sport (sport is album-authoritative), don't override it at ingest.`);
			}
		}
		return { sport, albumName: existing.album_name ?? ALBUM_NAME_ARG ?? ALBUM_KEY! };
	}

	// Album missing → require an explicit operator sport + name to bootstrap the row.
	if (SPORT_ARG === undefined || !ALBUM_NAME_ARG) {
		die(`No albums row for album_key="${ALBUM_KEY}". Sport is album-authoritative, so a new album MUST ` +
			`declare it first. Re-run with --album-name "..." and --sport <taxonomy-sport|none>, or seed the ` +
			`row via scripts/load-album-sports.ts.`);
	}
	const sport = parseSportArg();
	if (DRY) {
		console.log(`   [DRY] Would create albums row: ${ALBUM_KEY} "${ALBUM_NAME_ARG}" sport=${sport ?? 'none'}`);
	} else {
		const { error: insErr } = await sb.from('albums').insert({
			album_key: ALBUM_KEY,
			album_name: ALBUM_NAME_ARG,
			sport, // string value or null; Postgres casts to the sport enum
			sport_source: 'operator',
		});
		if (insErr) die(`failed to create albums row: ${insErr.message}`);
		console.log(`   ✅ Created albums row: ${ALBUM_KEY} "${ALBUM_NAME_ARG}" sport=${sport ?? 'none'}`);
	}
	return { sport, albumName: ALBUM_NAME_ARG };
}

// ---------------------------------------------------------------------------
// Per-image work
// ---------------------------------------------------------------------------
interface ImageJob { file: string; path: string; imageKey: string; }

/** Read capture date from EXIF (DateTimeOriginal) via sharp's exif buffer — no exiftool. */
function captureDateFrom(exifBuffer: Buffer | undefined): string | null {
	if (!exifBuffer) return null;
	try {
		const tags: any = exifReader(exifBuffer);
		const d = tags?.Photo?.DateTimeOriginal ?? tags?.exif?.DateTimeOriginal ?? tags?.Image?.DateTime;
		if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString();
		if (typeof d === 'string') {
			// EXIF format "YYYY:MM:DD HH:MM:SS"
			const m = d.match(/(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
			if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
		}
	} catch { /* no/garbled EXIF — fall through */ }
	return null;
}

interface ProcessResult { caption: string; players: number; sightings: number; cost: number | null; }

async function processImage(job: ImageJob, album: { sport: Sport | null; albumName: string }): Promise<ProcessResult> {
	const fileBuffer = readFileSync(job.path);
	const photoId = `${ALBUM_KEY}-${job.imageKey}`;
	const cfId = `${ALBUM_KEY}-${job.imageKey}`;

	// 1. Image dims + capture date (sharp; exif via exif-reader). Non-fatal if metadata is missing.
	let width: number | null = null, height: number | null = null, aspect: number | null = null, photoDate: string | null = null;
	try {
		const meta = await sharp(fileBuffer).metadata();
		width = meta.width ?? null;
		height = meta.height ?? null;
		if (width && height) aspect = +(width / height).toFixed(4);
		photoDate = captureDateFrom(meta.exif as Buffer | undefined);
	} catch { /* unreadable image metadata — continue, dims stay null */ }

	// 2. Upload to Cloudflare Images (album-scoped id). 5409 = refuse to alias (Phase 0 invariant).
	if (!DRY) {
		const up = await uploadToCF(fileBuffer, cfId, job.file);
		if (!up.success || !up.result) {
			if (up.errors?.some((e) => e.code === 5409)) {
				throw new Error(`CF id "${cfId}" already exists — refusing to auto-link (re-run after partial failure? ` +
					`confirm it belongs to album ${ALBUM_KEY}, then clear it or use --overwrite once dedup is confirmed).`);
			}
			throw new Error(`CF upload failed: ${up.errors?.map((e) => e.message).join('; ') || 'unknown'}`);
		}
	}

	// 3. Extract (sport-aware) — retry on 429/5xx.
	const ex = await extractWithRetry(fileBuffer, album);

	// 4. Embed the caption (same seam as query).
	const embedding = await embedText(ex.extraction.caption, OPENROUTER_API_KEY);
	if (!embedding) throw new Error('embed failed (null vector)');

	if (DRY) {
		return { caption: ex.extraction.caption, players: ex.extraction.players.length, sightings: 0, cost: ex.cost };
	}

	// 5. UPSERT photo_metadata. sport_type is set by the trigger; quality_score is generated.
	const row = {
		photo_id: photoId,
		image_key: job.imageKey,
		album_key: ALBUM_KEY,
		album_name: album.albumName,
		file_name: job.file,
		cf_image_id: cfId,
		caption: ex.extraction.caption,
		photo_category: ex.extraction.photo_category,
		play_type: ex.extraction.play_type,
		sharpness: ex.extraction.sharpness,
		composition_score: ex.extraction.composition_score,
		exposure_accuracy: ex.extraction.exposure_accuracy,
		emotional_impact: ex.extraction.emotional_impact,
		embedding,
		width,
		height,
		aspect_ratio: aspect,
		photo_date: photoDate ?? `${UPLOAD_DATE}T12:00:00`,
		upload_date: UPLOAD_DATE,
		extraction_version: EXTRACTION_VERSION,
		ai_provider: 'openrouter',
		...(ex.cost != null ? { ai_cost: ex.cost } : {}),
		enriched_at: new Date().toISOString(),
	};
	const { error: upErr } = await sb.from('photo_metadata').upsert(row, { onConflict: 'photo_id' });
	if (upErr) throw new Error(`photo_metadata upsert: ${upErr.message}`);

	// 6. Sightings from players[] (NEVER the players column). Idempotent on dedup_key.
	const sightings = shredCaptionPlayers(photoId, ALBUM_KEY!, ex.extraction.players, 'ingest');
	if (sightings.length) {
		const { error: sErr } = await sb
			.from('photo_jersey_sightings')
			.upsert(sightings, { onConflict: 'dedup_key', ignoreDuplicates: true });
		if (sErr) throw new Error(`sightings upsert: ${sErr.message}`);
	}

	return { caption: ex.extraction.caption, players: ex.extraction.players.length, sightings: sightings.length, cost: ex.cost };
}

async function extractWithRetry(buffer: Buffer, album: { sport: Sport | null; albumName: string }) {
	let attempt = 0;
	for (;;) {
		try {
			return await extractOne(buffer, {
				apiKey: OPENROUTER_API_KEY!,
				model: MODEL,
				albumSport: album.sport,
				albumName: album.albumName,
			});
		} catch (e: any) {
			const msg = String(e?.message || e);
			if (msg.startsWith('RETRY:') && attempt < 5) {
				attempt++;
				await sleep(Math.min(2000 * 2 ** (attempt - 1), 30000));
				continue;
			}
			throw e;
		}
	}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
	console.log('\n📥 Ingest album (#10 unified, direct-to-DB, no EXIF round-trip)\n');
	console.log(`   Dir: ${DIR}`);
	console.log(`   Album: ${ALBUM_KEY}${ALBUM_NAME_ARG ? ` "${ALBUM_NAME_ARG}"` : ''}`);
	console.log(`   Model: ${MODEL} · embed: text-embedding-3-large@768 · ${EXTRACTION_VERSION}`);
	console.log(`   Concurrency: ${CONCURRENCY}${LIMIT ? ` · limit ${LIMIT}` : ''}${DRY ? ' · DRY RUN' : ''}${OVERWRITE ? ' · OVERWRITE' : ''}`);
	console.log(`   Checkpoint: ${CK_PATH} (${done.size} already done)\n`);

	const album = await resolveAlbum();
	console.log(`   Album sport (authoritative): ${album.sport ?? 'none (non-sport)'}\n`);

	const files = (await readdir(DIR!)).filter((f) => /\.(jpg|jpeg)$/i.test(f)).sort();
	let jobs: ImageJob[] = files.map((f) => ({ file: f, path: join(DIR!, f), imageKey: f.replace(/\.(jpg|jpeg)$/i, '') }));
	jobs = jobs.filter((j) => OVERWRITE || !done.has(j.imageKey));
	if (LIMIT) jobs = jobs.slice(0, LIMIT);

	console.log(`   ${files.length} images found · ${jobs.length} to process\n`);
	if (jobs.length === 0) { console.log('✅ Nothing to do.'); return; }

	let ok = 0, fail = 0, totalCost = 0, totalSightings = 0, index = 0;
	const t0 = Date.now();

	async function worker() {
		while (index < jobs.length) {
			const job = jobs[index++];
			try {
				const r = await processImage(job, album);
				ok++;
				if (r.cost) totalCost += r.cost;
				totalSightings += r.sightings;
				if (!DRY) { done.add(job.imageKey); delete ck.failed[job.imageKey]; }
				if (ok <= 8 || ok % 25 === 0) {
					console.log(`   ✅ ${job.imageKey}: "${r.caption.slice(0, 64)}" (players ${r.players}, sightings ${r.sightings})`);
				}
			} catch (e: any) {
				fail++;
				ck.failed[job.imageKey] = String(e?.message || e);
				console.error(`   ❌ ${job.imageKey}: ${String(e?.message || e).slice(0, 140)}`);
			}
			const processed = ok + fail;
			if (processed % 20 === 0) {
				saveCheckpoint();
				const rate = processed / ((Date.now() - t0) / 1000);
				const eta = (jobs.length - processed) / (rate || 1);
				console.log(`   📊 ${processed}/${jobs.length} · ${rate.toFixed(1)}/s · ETA ${Math.ceil(eta / 60)}m · cost $${totalCost.toFixed(4)}`);
			}
		}
	}

	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () => worker()));
	if (!DRY) saveCheckpoint();

	// Refresh the albums materialized view once (powers the albums listing).
	if (!DRY && ok > 0) {
		const { error: rErr } = await sb.rpc('refresh_albums_summary');
		if (rErr) console.warn(`   ⚠️  refresh_albums_summary failed (non-fatal): ${rErr.message}`);
		else console.log('   🔄 albums_summary refreshed');
	}

	const mins = ((Date.now() - t0) / 60000).toFixed(1);
	console.log('\n' + '='.repeat(64));
	console.log(`   ✅ Ingested: ${ok}   ❌ Failed: ${fail}   👕 Sightings: ${totalSightings}`);
	console.log(`   💰 Cost: $${totalCost.toFixed(4)}   ⏱️  ${mins} min`);
	console.log(`   📁 Checkpoint: ${CK_PATH}`);
	if (fail > 0) console.log(`   ⚠️  ${fail} failures recorded in checkpoint.failed — safe to re-run to retry them.`);
	console.log('='.repeat(64) + '\n');
}

main().catch((e) => { console.error('Fatal:', e); saveCheckpoint(); process.exit(1); });
