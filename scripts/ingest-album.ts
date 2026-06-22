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
/**
 * Folder basename → a SmugMug-style album_key: a 6-char base62 token (e.g. `5dvLQR`).
 * EVERY live album_key on this site is exactly this shape — the gallery URL router
 * (`extractAlbumKey` in src/lib/utils.ts) splits the slug on hyphens and treats the LAST
 * 5–8-char alphanumeric segment as the key. A hyphenated folder-slug key (e.g.
 * `msow-raiders-open`) has a 4-char tail (`open`) that fails that test, so the page 404s.
 * Deterministic (FNV-1a over the folder name) so re-runs without --album-key stay idempotent
 * and resumable; the operator can always pass an explicit --album-key to override.
 */
function smugmugStyleKey(seed: string): string {
	const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
	let h1 = 2166136261 >>> 0;
	for (let i = 0; i < seed.length; i++) { h1 ^= seed.charCodeAt(i); h1 = Math.imul(h1, 16777619) >>> 0; }
	let h2 = 0x811c9dc5 >>> 0;
	for (let i = seed.length - 1; i >= 0; i--) { h2 ^= seed.charCodeAt(i); h2 = Math.imul(h2, 2246822519) >>> 0; }
	let n = (BigInt(h1) << 32n) | BigInt(h2 >>> 0);
	let out = '';
	for (let i = 0; i < 6; i++) { out = ALPHABET[Number(n % 62n)] + out; n /= 62n; }
	return out;
}
/** The shape the gallery URL router can round-trip (see extractAlbumKey). */
const ALBUM_KEY_RE = /^[a-zA-Z0-9]{5,8}$/;
const folderBase = DIR ? DIR.replace(/\/+$/, '').split('/').pop() || '' : '';
// album_key is generated from the folder when not passed — the operator points at a folder, not a key.
const EXPLICIT_KEY = flagValue('album-key');
if (EXPLICIT_KEY !== undefined && !ALBUM_KEY_RE.test(EXPLICIT_KEY)) {
	die(`--album-key "${EXPLICIT_KEY}" won't round-trip through the gallery URL (needs 5–8 alphanumerics, ` +
		`no hyphens — every live key is a 6-char SmugMug-style token). Omit --album-key to auto-generate one.`);
}
const ALBUM_KEY = EXPLICIT_KEY || (folderBase ? smugmugStyleKey(folderBase) : undefined);
const ALBUM_NAME_ARG = flagValue('album-name');
const SPORT_ARG = flagValue('sport'); // 'volleyball' | ... | 'none'/'null' for non-sport
const UPLOAD_DATE = flagValue('upload-date') || new Date().toISOString().split('T')[0];
const CONCURRENCY = Math.max(1, parseInt(flagValue('concurrency') || '4', 10));
const LIMIT = parseInt(flagValue('limit') || '0', 10) || 0;
const DRY = process.argv.includes('--dry-run');
const OVERWRITE = process.argv.includes('--overwrite');
const UNLISTED = process.argv.includes('--unlisted'); // hide on the live gallery until the operator publishes
const MODEL = flagValue('model') || INGEST_MODEL;

// Operator GPS override (e.g. --lat 43.04781 --lng -87.90931). Cameras without a GPS receiver
// (Sony A7-series) never record a fix; rather than re-export 300+ frames to bake one in, the
// operator can pass the venue coordinate once. It's a FALLBACK: a real per-photo EXIF fix always
// wins; the override only fills frames that have none. Both flags required together; ranges validated.
function floatFlag(name: string): number | null {
	const v = flagValue(name);
	if (v === undefined) return null;
	const n = Number(v);
	if (!Number.isFinite(n)) die(`--${name} "${v}" is not a number`);
	return n;
}
const OP_LAT = floatFlag('lat');
const OP_LNG = floatFlag('lng');
if ((OP_LAT === null) !== (OP_LNG === null)) die('--lat and --lng must be passed together (venue GPS override)');
if (OP_LAT !== null && (Math.abs(OP_LAT) > 90 || Math.abs(OP_LNG!) > 180)) die(`--lat/--lng out of range (lat ${OP_LAT}, lng ${OP_LNG})`);

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
	die('Usage: npx tsx scripts/ingest-album.ts --dir <photo-dir> [--album-key <KEY>] [--album-name "..."] [--sport volleyball] [--upload-date YYYY-MM-DD] [--lat <deg> --lng <deg>] [--concurrency 4] [--limit N] [--unlisted] [--dry-run] [--overwrite]\n' +
		'  --album-key defaults to the folder-name slug; --sport is detected from --album-name when omitted.');
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

	// Album missing → bootstrap it. Sport must be KNOWN: explicit --sport wins, else it's detected
	// from the album name (operator convention: "the sport is in the name"). NEVER guessed/defaulted.
	const name = ALBUM_NAME_ARG || folderBase;
	let sport: Sport | null;
	if (SPORT_ARG !== undefined) {
		sport = parseSportArg();
	} else {
		sport = detectSportFromName(name);
		if (sport === null) {
			die(`Couldn't determine the sport for new album "${name}" (key="${ALBUM_KEY}"). Sport is ` +
				`album-authoritative and never guessed — re-run with --sport <${SPORTS.filter((s) => s !== 'other').join('|')}|none>.`);
		}
		console.log(`   🔎 Sport detected from album name: ${sport}`);
	}
	if (DRY) {
		console.log(`   [DRY] Would create albums row: ${ALBUM_KEY} "${name}" sport=${sport ?? 'none'}`);
	} else {
		const { error: insErr } = await sb.from('albums').insert({
			album_key: ALBUM_KEY,
			album_name: name,
			sport, // string value or null; Postgres casts to the sport enum
			sport_source: 'operator',
		});
		if (insErr) die(`failed to create albums row: ${insErr.message}`);
		console.log(`   ✅ Created albums row: ${ALBUM_KEY} "${name}" sport=${sport ?? 'none'}`);
	}
	return { sport, albumName: name };
}

/** Detect the album's sport from its name (operator convention: "the sport is in the name"). */
function detectSportFromName(name: string): Sport | null {
	const n = name.toLowerCase();
	for (const s of SPORTS) {
		if (s === 'other') continue;
		if (n.includes(s) || n.includes(s.replace('_', ' '))) return s as Sport;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Per-image work
// ---------------------------------------------------------------------------
interface ImageJob { file: string; path: string; imageKey: string; }

interface ExifMeta {
	photoDate: string | null;
	camera_make: string | null;
	camera_model: string | null;
	lens_model: string | null;
	focal_length: string | null;
	aperture: string | null;
	shutter_speed: string | null;
	iso: number | null;
	latitude: number | null;
	longitude: number | null;
}
const EMPTY_EXIF: ExifMeta = {
	photoDate: null, camera_make: null, camera_model: null, lens_model: null,
	focal_length: null, aperture: null, shutter_speed: null, iso: null, latitude: null, longitude: null,
};

function exifDate(d: unknown): string | null {
	if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString();
	if (typeof d === 'string') {
		const m = d.match(/(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
		if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
	}
	return null;
}
function fmtShutter(t: unknown): string | null {
	const v = typeof t === 'number' ? t : NaN;
	if (!Number.isFinite(v) || v <= 0) return null;
	return v < 1 ? `1/${Math.round(1 / v)}` : `${v}s`;
}
/** EXIF GPS → signed decimal degrees; tolerates [d,m,s] or decimal; rejects the (0,0) null-island. */
function gpsDecimal(val: unknown, ref: unknown): number | null {
	let dec: number;
	if (Array.isArray(val) && val.length) {
		const [d = 0, m = 0, s = 0] = (val as any[]).map(Number);
		dec = d + m / 60 + s / 3600;
	} else if (typeof val === 'number') {
		dec = val;
	} else return null;
	if (!Number.isFinite(dec)) return null;
	if (ref === 'S' || ref === 'W') dec = -dec;
	return dec;
}

/** Extract capture date + camera/lens/exposure + GPS from sharp's EXIF buffer — no exiftool. */
function extractExifMeta(exifBuffer: Buffer | undefined): ExifMeta {
	if (!exifBuffer) return { ...EMPTY_EXIF };
	try {
		const t: any = exifReader(exifBuffer);
		const fnum = typeof t?.Photo?.FNumber === 'number' ? t.Photo.FNumber : null;
		const focal = typeof t?.Photo?.FocalLength === 'number' ? t.Photo.FocalLength : null;
		const iso = Number(t?.Photo?.ISO ?? t?.Photo?.ISOSpeedRatings);
		let latitude: number | null = null, longitude: number | null = null;
		if (t?.GPSInfo) {
			const lat = gpsDecimal(t.GPSInfo.GPSLatitude, t.GPSInfo.GPSLatitudeRef);
			const lon = gpsDecimal(t.GPSInfo.GPSLongitude, t.GPSInfo.GPSLongitudeRef);
			// Only keep a REAL fix — never the (0,0) placeholder a missing fix leaves behind.
			if (lat != null && lon != null && !(lat === 0 && lon === 0)) { latitude = lat; longitude = lon; }
		}
		return {
			photoDate: exifDate(t?.Photo?.DateTimeOriginal ?? t?.Image?.DateTime),
			camera_make: t?.Image?.Make?.toString().trim() || null,
			camera_model: t?.Image?.Model?.toString().trim() || null,
			lens_model: t?.Photo?.LensModel?.toString().trim() || null,
			focal_length: focal != null ? `${focal}mm` : null,
			aperture: fnum != null ? `f/${fnum}` : null,
			shutter_speed: fmtShutter(t?.Photo?.ExposureTime),
			iso: Number.isFinite(iso) && iso > 0 ? iso : null,
			latitude,
			longitude,
		};
	} catch {
		return { ...EMPTY_EXIF };
	}
}

interface ProcessResult { caption: string; players: number; sightings: number; cost: number | null; reprocessed: boolean; }

/** image_key → the album's existing row (photo_id + cf_image_id). Populated in main() for reprocess-in-place. */
const existingRows = new Map<string, { photo_id: string; cf_image_id: string | null }>();

async function processImage(job: ImageJob, album: { sport: Sport | null; albumName: string }): Promise<ProcessResult> {
	const fileBuffer = readFileSync(job.path);
	// Reprocess-in-place (P1): if this album already has a row for this image_key, UPDATE it —
	// keep its existing photo_id AND cf_image_id — instead of minting a NEW deterministic photo_id,
	// which is what created the bpo-2026 duplicate. New images still get the deterministic id.
	const prior = existingRows.get(job.imageKey);
	const photoId = prior?.photo_id ?? `${ALBUM_KEY}-${job.imageKey}`;
	const cfId = prior?.cf_image_id ?? `${ALBUM_KEY}-${job.imageKey}`;
	const alreadyUploaded = !!prior?.cf_image_id; // existing CF image — refresh metadata, don't re-upload/churn

	// 1. Image dims + full EXIF (capture date, camera/lens/exposure, GPS). Non-fatal if absent.
	let width: number | null = null, height: number | null = null, aspect: number | null = null;
	let exif: ExifMeta = { ...EMPTY_EXIF };
	try {
		const meta = await sharp(fileBuffer).metadata();
		width = meta.width ?? null;
		height = meta.height ?? null;
		if (width && height) aspect = +(width / height).toFixed(4);
		exif = extractExifMeta(meta.exif as Buffer | undefined);
	} catch { /* unreadable image metadata — continue, fields stay null */ }

	// 2. Upload to Cloudflare Images (album-scoped id `${albumKey}-${imageKey}`). Skip when the
	// existing row already has a CF image — a reprocess refreshes metadata without CF churn/orphans.
	if (!DRY && !alreadyUploaded) {
		const up = await uploadToCF(fileBuffer, cfId, job.file);
		if (!up.success || !up.result) {
			// 5409 = an image with this id already exists. Because the id encodes album_key + image_key,
			// that can ONLY be THIS album's THIS image from a prior (partial) run — never a cross-album
			// alias (the bug that the album-scoping fixed). So a re-run is idempotent: reuse the existing
			// id. (The old bare-filename scheme treated 5409 as fatal because it couldn't tell those apart.)
			if (!up.errors?.some((e) => e.code === 5409)) {
				throw new Error(`CF upload failed: ${up.errors?.map((e) => e.message).join('; ') || 'unknown'}`);
			}
		}
	}

	// 3. Extract (sport-aware) — retry on 429/5xx.
	const ex = await extractWithRetry(fileBuffer, album);

	// 4. Embed the caption (same seam as query).
	const embedding = await embedText(ex.extraction.caption, OPENROUTER_API_KEY);
	if (!embedding) throw new Error('embed failed (null vector)');

	if (DRY) {
		return { caption: ex.extraction.caption, players: ex.extraction.players.length, sightings: 0, cost: ex.cost, reprocessed: !!prior };
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
		photo_date: exif.photoDate ?? `${UPLOAD_DATE}T12:00:00`,
		upload_date: UPLOAD_DATE,
		camera_make: exif.camera_make,
		camera_model: exif.camera_model,
		lens_model: exif.lens_model,
		focal_length: exif.focal_length,
		aperture: exif.aperture,
		shutter_speed: exif.shutter_speed,
		iso: exif.iso,
		// GPS: a REAL per-photo EXIF fix wins (extractExifMeta already rejects the (0,0) placeholder);
		// otherwise fall back to the operator's venue override (--lat/--lng) when one was passed.
		...((exif.latitude ?? OP_LAT) != null && (exif.longitude ?? OP_LNG) != null
			? { latitude: exif.latitude ?? OP_LAT, longitude: exif.longitude ?? OP_LNG }
			: {}),
		extraction_version: EXTRACTION_VERSION,
		ai_provider: 'openrouter',
		...(ex.cost != null ? { ai_cost: ex.cost } : {}),
		enriched_at: new Date().toISOString(),
	};
	const { error: upErr } = await sb.from('photo_metadata').upsert(row, { onConflict: 'photo_id' });
	if (upErr) throw new Error(`photo_metadata upsert: ${upErr.message}`);

	// 6. Sightings from players[] (NEVER the players column). source='players_new' is the
	// caption-shape vocabulary the photo_jersey_sightings_source_check constraint allows (same as
	// the backfill); dedup_key stays consistent across both write paths. Idempotent on dedup_key.
	const sightings = shredCaptionPlayers(photoId, ALBUM_KEY!, ex.extraction.players);
	if (sightings.length) {
		const { error: sErr } = await sb
			.from('photo_jersey_sightings')
			.upsert(sightings, { onConflict: 'dedup_key', ignoreDuplicates: true });
		if (sErr) throw new Error(`sightings upsert: ${sErr.message}`);
	}

	return { caption: ex.extraction.caption, players: ex.extraction.players.length, sightings: sightings.length, cost: ex.cost, reprocessed: !!prior };
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
	console.log(`   Album sport (authoritative): ${album.sport ?? 'none (non-sport)'}`);
	if (OP_LAT !== null) console.log(`   📍 Venue GPS override (fallback for frames without an EXIF fix): ${OP_LAT}, ${OP_LNG}`);
	console.log('');

	// Keep a freshly-ingested album OFF the live gallery until the operator reviews + publishes.
	if (UNLISTED && !DRY) {
		const { data: ex } = await sb.from('album_settings').select('album_key').eq('album_key', ALBUM_KEY!).maybeSingle();
		const res = ex
			? await sb.from('album_settings').update({ visibility: 'unlisted' }).eq('album_key', ALBUM_KEY!)
			: await sb.from('album_settings').insert({ album_key: ALBUM_KEY, visibility: 'unlisted' });
		if (res.error) console.warn(`   ⚠️  could not set unlisted (non-fatal): ${res.error.message}`);
		else console.log(`   🙈 album_settings.visibility = unlisted (hidden until you publish)\n`);
	}

	// Reprocess-in-place (P1): load this album's existing rows so a re-run UPDATES them (preserving
	// each photo_id + its CF image) instead of minting duplicates. New images get fresh ids.
	{
		const { data } = await sb.from('photo_metadata').select('image_key, photo_id, cf_image_id').eq('album_key', ALBUM_KEY!);
		for (const r of data ?? []) existingRows.set(r.image_key, { photo_id: r.photo_id, cf_image_id: r.cf_image_id });
	}
	if (existingRows.size) {
		console.log(`   ♻️  ${existingRows.size} existing rows for this album — reprocessing those in place (preserve photo_id, no duplicate rows, no CF churn)\n`);
	}

	const files = (await readdir(DIR!)).filter((f) => /\.(jpg|jpeg)$/i.test(f)).sort();
	let jobs: ImageJob[] = files.map((f) => ({ file: f, path: join(DIR!, f), imageKey: f.replace(/\.(jpg|jpeg)$/i, '') }));
	jobs = jobs.filter((j) => OVERWRITE || !done.has(j.imageKey));
	if (LIMIT) jobs = jobs.slice(0, LIMIT);

	console.log(`   ${files.length} images found · ${jobs.length} to process\n`);
	if (jobs.length === 0) { console.log('✅ Nothing to do.'); return; }

	let ok = 0, fail = 0, totalCost = 0, totalSightings = 0, totalReprocessed = 0, index = 0;
	const t0 = Date.now();

	async function worker() {
		while (index < jobs.length) {
			const job = jobs[index++];
			try {
				const r = await processImage(job, album);
				ok++;
				if (r.cost) totalCost += r.cost;
				if (r.reprocessed) totalReprocessed++;
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

	// Ingest is the sole owner of read-model maintenance (ADR 0001): refresh the albums
	// materialized view, then invalidate the edge cache. Both run only here, on the write event.
	if (!DRY && ok > 0) {
		const { error: rErr } = await sb.rpc('refresh_albums_summary');
		if (rErr) {
			// LOUD, not a buried warn: album existence/metadata reads lean on this MV. A silent
			// miss could leave a freshly-ingested album under-served until the next ingest.
			console.error(`   ❌ refresh_albums_summary FAILED: ${rErr.message}`);
			console.error('      → Re-run the refresh (service_role) before relying on the albums listing.');
		} else {
			console.log('   🔄 albums_summary refreshed');
		}

		// Edge-cache invalidation. Tag/prefix purge is Cloudflare Enterprise-only; on this plan we
		// purge the zone (one call) — cheap at this traffic, and the album API's s-maxage=300 bounds
		// staleness to ~5 min if this is skipped. Best-effort, non-fatal, env-gated.
		const CF_ZONE_ID = process.env.CF_ZONE_ID;
		const CF_CACHE_PURGE_TOKEN = process.env.CF_CACHE_PURGE_TOKEN;
		if (CF_ZONE_ID && CF_CACHE_PURGE_TOKEN) {
			try {
				const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache`, {
					method: 'POST',
					headers: { Authorization: `Bearer ${CF_CACHE_PURGE_TOKEN}`, 'Content-Type': 'application/json' },
					body: JSON.stringify({ purge_everything: true })
				});
				const body = (await r.json().catch(() => ({}))) as { success?: boolean };
				console.log(r.ok && body.success ? '   🧹 Cloudflare cache purged' : `   ⚠️  cache purge failed (HTTP ${r.status}) — s-maxage bounds staleness to ~5 min`);
			} catch (e) {
				console.warn(`   ⚠️  cache purge error (non-fatal): ${(e as Error).message}`);
			}
		} else {
			console.log('   ℹ️  cache purge skipped — set CF_ZONE_ID + CF_CACHE_PURGE_TOKEN for instant freshness (else ~5 min s-maxage staleness)');
		}
	}

	const mins = ((Date.now() - t0) / 60000).toFixed(1);
	console.log('\n' + '='.repeat(64));
	console.log(`   ✅ Ingested: ${ok} (${totalReprocessed} updated in place, ${ok - totalReprocessed} new)   ❌ Failed: ${fail}   👕 Sightings: ${totalSightings}`);
	console.log(`   💰 Cost: $${totalCost.toFixed(4)}   ⏱️  ${mins} min`);
	console.log(`   📁 Checkpoint: ${CK_PATH}`);
	if (fail > 0) console.log(`   ⚠️  ${fail} failures recorded in checkpoint.failed — safe to re-run to retry them.`);
	console.log('='.repeat(64) + '\n');
}

main().catch((e) => { console.error('Fatal:', e); saveCheckpoint(); process.exit(1); });
