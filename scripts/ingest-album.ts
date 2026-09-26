#!/usr/bin/env node
/**
 * Unified album ingest (#10) — ONE pass per photo, directly to the DB. No EXIF round-trip.
 *
 * For each local image in a directory this: uploads to Cloudflare Images (album-scoped id),
 * runs the sport-aware structured extraction (caption + category + play_type + quality
 * sub-scores + players[]), embeds the caption AND the image (two independent vector spaces —
 * see src/lib/ai/embeddings.ts), computes deterministic sharpness, UPSERTs photo_metadata, and
 * writes photo_jersey_sightings. It NEVER writes EXIF, never shells out to exiftool, never writes
 * the deprecated `players`/vanity columns, and never sets sport_type (the enforce_album_sport
 * trigger mirrors it from albums.sport).
 *
 * Image vectors (`image_embedding`) are the primary search-ranking signal as of
 * blueprint/decisions/0006 — see that ADR before assuming `embedding` (caption-text, still
 * written) drives search. `sharpness_measured` is a deterministic companion to the model-scored
 * `sharpness` column, not a replacement for it.
 *
 * Replaces the legacy 3-script chain (enrich-local-photos -> sync-local-to-supabase -> upload).
 *
 * SPORT IS ALBUM-AUTHORITATIVE. The album row (albums.sport) must exist before ingest, or be
 * created here with an explicit operator --sport. A photo's sport is NEVER guessed.
 *
 * Resumable: a checkpoint (.temp/ingest-<album-key>.checkpoint.json) records done image_keys;
 * idempotent because photo_id = `${albumKey}-${imageKey}` (UPSERT), and a reprocessed photo's
 * `photo_jersey_sightings` (source='players_new') are REPLACED — deleted then re-inserted from
 * the fresh extraction — rather than merely dedup-upserted, so a re-run converges instead of
 * accumulating stale sightings beside new ones. Re-running is safe.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... npx tsx scripts/ingest-album.ts \
 *     --dir /path/to/album --album-key xSqPJB --album-name "FUTURE — Fall 2025" \
 *     --sport volleyball --upload-date 2025-11-03 [--teams "Lewis University, UCLA"] \
 *     [--venue "Neil Carey Arena"] [--level college] [--division mens] \
 *     [--concurrency 4] [--limit N] [--dry-run] [--overwrite] [--prune]
 *
 * Findability context (teams/venue/level/division) is operator-known at ingest — pass it here.
 * Skipped flags can be batch-derived later: extract-album-entities.ts (teams/aliases/dates) and
 * backfill-album-facets.ts (level/division) are both idempotent fill-if-null re-runs.
 * event_date is stamped automatically from the album's earliest capture date (fill-if-null).
 * --prune deletes DB rows for this album whose file is no longer in --dir (default: report only);
 * --prune-confirm-identity-loss / --prune-confirm-majority lift its two safety gates (see below).
 *
 * Credentials (runtime-injected; see [[photography-live-credentials]]):
 *   OPENROUTER_API_KEY (1Password "OpenRouter photography"), CF_ACCOUNT_ID + CF_IMAGES_API_TOKEN
 *   (1Password "Cloudflare photography" — see ENRICHMENT_WORKFLOW.md; do NOT trust a cached
 *   .env.local token over the vault), Supabase creds (.env.local: VITE_SUPABASE_URL,
 *   SUPABASE_SERVICE_ROLE_KEY).
 */
import { config } from 'dotenv';
import { resolve, join } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { readdir } from 'fs/promises';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import sharp from 'sharp';
import exifReader from 'exif-reader';

import { embedText, embedImage } from '../src/lib/ai/embeddings';
import { resizeForEmbedding } from '../src/lib/ai/image-resize';
import { computeSharpness } from '../src/lib/ai/sharpness';
import { extractOne, EXTRACTION_VERSION, INGEST_MODEL } from '../src/lib/ai/ingest-extraction';
import { shredCaptionPlayers } from '../src/lib/identity/sightings';
import { SPORTS, type Sport } from '../src/lib/ai/taxonomy';
import { generateCanonicalNameFromAlbum } from '../src/lib/utils/canonical-album-naming';

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
/**
 * Ingest only ADDS. A photo whose file was removed/renamed on disk after a prior ingest stays
 * in the DB forever unless something notices. --prune makes THIS run the something: it deletes
 * (photo_metadata row, cascading to photo_jersey_sightings via FK, + best-effort CF Images
 * delete) any DB row for this album whose file_name is no longer present in --dir. Without
 * --prune the run only REPORTS the candidates — never deletes by default.
 */
const PRUNE = process.argv.includes('--prune');

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

// Operator-known-at-ingest context the schema previously had no home for. --teams takes the
// competing programs by CANONICAL name, comma-separated (e.g. --teams "Lewis University, UCLA");
// each is upserted into teams/album_teams so name search resolves this album immediately —
// without waiting for an extract-album-entities re-run. --venue lands on albums.venue.
// (Batch alternative: scripts/extract-album-entities.ts --apply is idempotent — re-run it
// after ingesting albums without --teams to derive teams/aliases from the album names.)
const TEAMS_ARG = (flagValue('teams') ?? '').split(',').map((t) => t.trim()).filter(Boolean);
const VENUE_ARG = flagValue('venue');

// Facet columns the explore Division/Level chips filter on. Without these a new album is
// silently EXCLUDED from any faceted view (the chips filter by album_key set; NULL = absent) —
// the drift the 2026-07-10 backfill (scripts/backfill-album-facets.ts, also idempotent) fixed.
// Vocabulary must match existing rows / what the UI sends.
const LEVEL_VOCAB = ['high_school', 'college', 'club', 'middle_school'];
const DIVISION_VOCAB = ['girls', 'boys', 'womens', 'mens', 'coed'];
const LEVEL_ARG = flagValue('level');
const DIVISION_ARG = flagValue('division');
if (LEVEL_ARG !== undefined && !LEVEL_VOCAB.includes(LEVEL_ARG)) die(`--level "${LEVEL_ARG}" invalid. Valid: ${LEVEL_VOCAB.join(', ')}`);
if (DIVISION_ARG !== undefined && !DIVISION_VOCAB.includes(DIVISION_ARG)) die(`--division "${DIVISION_ARG}" invalid. Valid: ${DIVISION_VOCAB.join(', ')}`);

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
	die('Usage: npx tsx scripts/ingest-album.ts --dir <photo-dir> [--album-key <KEY>] [--album-name "..."] [--sport volleyball] [--upload-date YYYY-MM-DD] [--lat <deg> --lng <deg>] [--concurrency 4] [--limit N] [--unlisted] [--dry-run] [--overwrite] [--prune]\n' +
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

/** Best-effort CF Images delete for --prune. Non-fatal: a stray CF image costs storage, not correctness. */
async function deleteFromCF(imageId: string): Promise<{ ok: boolean; message?: string }> {
	try {
		const res = await fetch(`${CF_IMAGES_API}/${imageId}`, {
			method: 'DELETE',
			headers: { Authorization: `Bearer ${CF_IMAGES_API_TOKEN}` },
		});
		const body = (await res.json().catch(() => ({}))) as { success?: boolean; errors?: Array<{ message: string }> };
		if (res.ok && body.success) return { ok: true };
		return { ok: false, message: body.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}` };
	} catch (e) {
		return { ok: false, message: (e as Error).message };
	}
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
	warnIfNameDrifts(name);
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

/**
 * Persist operator-declared album context (--teams / --venue). Idempotent upserts; alias rows
 * use ignoreDuplicates so an operator name never steals an alias already owned by another team.
 */
async function captureAlbumContext(): Promise<void> {
	if (TEAMS_ARG.length === 0 && VENUE_ARG === undefined && LEVEL_ARG === undefined && DIVISION_ARG === undefined) return;
	if (DRY) {
		if (TEAMS_ARG.length) console.log(`   [DRY] Would link teams: ${TEAMS_ARG.join(' · ')}`);
		if (VENUE_ARG !== undefined) console.log(`   [DRY] Would set venue: "${VENUE_ARG}"`);
		if (LEVEL_ARG || DIVISION_ARG) console.log(`   [DRY] Would set facets: ${[LEVEL_ARG && `level=${LEVEL_ARG}`, DIVISION_ARG && `division=${DIVISION_ARG}`].filter(Boolean).join(' ')}`);
		return;
	}
	// Operator-explicit values win (unlike the fill-if-null backfills) — a flag is a statement.
	const albumPatch: Record<string, string> = {};
	if (VENUE_ARG !== undefined) albumPatch.venue = VENUE_ARG;
	if (LEVEL_ARG !== undefined) albumPatch.level = LEVEL_ARG;
	if (DIVISION_ARG !== undefined) albumPatch.division = DIVISION_ARG;
	if (Object.keys(albumPatch).length) {
		const { error } = await sb.from('albums').update(albumPatch).eq('album_key', ALBUM_KEY!);
		if (error) console.warn(`   ⚠️  album context update failed (non-fatal): ${error.message}`);
		else console.log(`   🏟  Album context: ${Object.entries(albumPatch).map(([k, v]) => `${k}="${v}"`).join(' · ')}`);
	}
	if (TEAMS_ARG.length) {
		const { error: tErr } = await sb.from('teams').upsert(TEAMS_ARG.map((name) => ({ name })), { onConflict: 'name' });
		if (tErr) { console.warn(`   ⚠️  teams upsert failed (non-fatal): ${tErr.message}`); return; }
		const { data: ids, error: idErr } = await sb.from('teams').select('team_id, name').in('name', TEAMS_ARG);
		if (idErr || !ids) { console.warn(`   ⚠️  teams read-back failed (non-fatal): ${idErr?.message}`); return; }
		await sb.from('team_aliases').upsert(
			ids.map((t) => ({ alias: t.name.toLowerCase(), team_id: t.team_id, source: 'operator' })),
			{ onConflict: 'alias', ignoreDuplicates: true }
		);
		const { error: lErr } = await sb.from('album_teams').upsert(
			ids.map((t) => ({ album_key: ALBUM_KEY!, team_id: t.team_id, source: 'operator' })),
			{ onConflict: 'album_key,team_id', ignoreDuplicates: true }
		);
		if (lErr) console.warn(`   ⚠️  album_teams upsert failed (non-fatal): ${lErr.message}`);
		else console.log(`   🏷  Teams: ${ids.map((t) => t.name).join(' · ')}`);
	}
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

/**
 * Warn — never block — when a NEW album's name drifts from what `canonical-album-naming.ts`
 * would generate. This is a print, not an enforcement: the module's own format
 * ("Team vs Team - May 30", level prefix stripped, no year on a single-day event) DISAGREES
 * with the naming convention actually used for recent real albums, e.g.
 * "HS Girls VB - JCA at ACC - 09-22-2026" (level prefix kept, "at" not "vs", full
 * MM-DD-YYYY date). That conflict is unresolved on the module side — see
 * ENRICHMENT_WORKFLOW.md — so this only surfaces the module's suggestion for the operator to
 * judge; it never renames anything.
 */
function warnIfNameDrifts(name: string): void {
	if (!name) return;
	let result;
	try {
		result = generateCanonicalNameFromAlbum({ albumKey: ALBUM_KEY!, name });
	} catch {
		return; // never let a naming-suggestion helper block ingest
	}
	// Drift bands per scripts/ALBUM_NORMALIZATION_README.md: <10 is minor/no-op noise.
	if (result.name && result.name !== name && (result.driftScore ?? 0) >= 10) {
		console.warn(`   ⚠️  Album name "${name}" drifts from canonical-album-naming.ts's suggestion (drift ${result.driftScore}): "${result.name}"`);
		console.warn(`      → NOT enforced — that module's format conflicts with recent naming practice (see ENRICHMENT_WORKFLOW.md). Review, don't auto-apply.`);
	}
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

/** Local-file matching key → the album's existing row (photo_id + cf_image_id + file_name).
 * Populated in main() for reprocess-in-place AND the missing-file report/--prune (below). */
const existingRows = new Map<string, { photo_id: string; cf_image_id: string | null; file_name: string | null; image_key: string }>();

/**
 * The key existingRows is matched on: file_name with its extension stripped when a file_name is
 * on record, else the raw image_key column. NOT the raw image_key column alone — on a
 * pre-north-star album, image_key is a SmugMug-assigned id with NO relationship to the local
 * filename (e.g. image_key="fpM495R", file_name="acc-vb-vs-delasalle-27.jpg"; verified live on
 * album CgbH8q). --dir's file listing can only ever produce filename-derived keys, so matching
 * on image_key there made every legacy row read as "missing" — and, one level up, made
 * reprocess-in-place mint a brand-new duplicate row for every legacy photo instead of updating it,
 * since `existingRows.get(job.imageKey)` (job.imageKey is ALSO filename-derived) never hit.
 */
function localKeyFor(row: { image_key: string; file_name: string | null }): string {
	return row.file_name ? row.file_name.replace(/\.(jpg|jpeg)$/i, '') : row.image_key;
}

/**
 * Ingest only ADDS. Report (and, with --prune, remove) DB rows for this album whose file is no
 * longer present in --dir — a candidate is a file that was deleted or renamed on disk after a
 * prior ingest. Matched on the local key (see localKeyFor), not the raw image_key column, so a
 * legacy album's SmugMug-id image_keys don't ALL read as missing.
 *
 * Never deletes anything unless --prune is passed; even then, respects --dry-run (report only).
 * Two more guards, because a delete here cascades to photo_jersey_sightings AND engagement_events
 * (ON DELETE CASCADE — verified live, and separately confirmed against supabase/migrations/*.sql),
 * which is real, hard-to-recover analytics work, not just a photo row:
 *   - a candidate with an APPROVED user_tags row is never deleted by --prune alone — it needs
 *     --prune-confirm-identity-loss too.
 *   - if more than half the album's existing rows are "missing" (a --dir typo, or pointing at
 *     the wrong folder, looks exactly like this), --prune refuses outright unless
 *     --prune-confirm-majority is also passed.
 *
 * NOTE: `players` / `photo_players` (which supabase/migrations/20260609000000_vnext_slice2_identity.sql
 * defines) and `photo_jersey_sightings.resolved_player_id` do NOT exist in the live database —
 * verified live 2026-09-25 (`Could not find the table 'public.photo_players' in the schema
 * cache`). That migration's identity-resolution layer was apparently never applied to production,
 * so this function can only protect what's actually live today (user_tags, engagement_events). If
 * that migration is ever applied, extend this function's protection query to cover it.
 */
async function reportAndPruneMissing(localKeys: Set<string>, localFileCount: number): Promise<void> {
	const missing = [...existingRows.entries()].filter(([key]) => !localKeys.has(key));
	if (missing.length === 0) return;

	console.log(`\n   🗑  ${missing.length} DB row(s) for this album have no file in ${DIR} (candidates for removal):`);
	for (const [key, row] of missing) {
		console.log(`      - ${row.photo_id} (local_key=${key}, file_name=${row.file_name ?? 'unknown'})`);
	}

	const photoIds = missing.map(([, row]) => row.photo_id);
	const [approvedTags, engagementCounts] = await Promise.all([
		sb.from('user_tags').select('photo_id').eq('approved', true).in('photo_id', photoIds),
		sb.from('engagement_events').select('photo_id', { count: 'exact', head: true }).in('photo_id', photoIds),
	]);
	// Fail CLOSED, not open: if either read errored, we cannot tell what's safe to delete, so
	// treat every candidate as protected rather than silently pruning the exact rows this guard
	// exists to protect.
	const queryError = approvedTags.error || engagementCounts.error;
	if (queryError) {
		console.log(`      ⛔ REFUSING to prune: a protection query failed (${queryError.message}) — cannot confirm no photo here has an approved tag.\n`);
		return;
	}
	const protectedPhotoIds = new Set<string>((approvedTags.data ?? []).map((r) => r.photo_id));
	if (protectedPhotoIds.size) {
		console.log(`      ⚠️  ${protectedPhotoIds.size} of these have an APPROVED user tag — protected from deletion unless --prune-confirm-identity-loss is also passed.`);
	}
	if ((engagementCounts.count ?? 0) > 0) {
		console.log(`      ℹ️  ${engagementCounts.count} engagement_events row(s) exist for these photos and would be deleted (CASCADE) along with them.`);
	}

	if (!PRUNE) {
		console.log(`      → re-run with --prune to remove them (add --dry-run first to preview)\n`);
		return;
	}

	if (localFileCount === 0) {
		console.log(`      ⛔ REFUSING: ${DIR} has 0 files — this reads exactly like a wrong or empty --dir, not a real removal. Point --dir at the real folder.\n`);
		return;
	}
	const CONFIRM_IDENTITY_LOSS = process.argv.includes('--prune-confirm-identity-loss');
	const CONFIRM_MAJORITY = process.argv.includes('--prune-confirm-majority');
	if (existingRows.size >= 5 && missing.length >= existingRows.size * 0.5 && !CONFIRM_MAJORITY) {
		console.log(`      ⛔ REFUSING: ${missing.length}/${existingRows.size} of the album's rows are "missing" — that's more consistent with a wrong/empty --dir than real removals. Re-run with --prune-confirm-majority to override.\n`);
		return;
	}

	const toDelete = missing.filter(([, row]) => !protectedPhotoIds.has(row.photo_id) || CONFIRM_IDENTITY_LOSS);
	const skipped = missing.length - toDelete.length;
	if (DRY) {
		console.log(`      [DRY] --prune would delete ${toDelete.length}/${missing.length} row(s) (photo_metadata, cascading to photo_jersey_sightings/user_tags/engagement_events) + their CF images${skipped ? ` (${skipped} protected, skipped)` : ''}\n`);
		return;
	}
	let pruned = 0;
	for (const [, row] of toDelete) {
		const { error: delErr } = await sb.from('photo_metadata').delete().eq('photo_id', row.photo_id);
		if (delErr) { console.error(`      ❌ delete ${row.photo_id} failed: ${delErr.message}`); continue; }
		pruned++;
		if (row.cf_image_id) {
			// Album-scoped ids make sharing unlikely, but the ingest header notes the OLD bare-filename
			// scheme could alias ids across albums — never delete a CF image another row still points at.
			const { count: sharedCount } = await sb.from('photo_metadata').select('photo_id', { count: 'exact', head: true }).eq('cf_image_id', row.cf_image_id);
			if ((sharedCount ?? 0) > 0) {
				console.warn(`      ⚠️  CF image ${row.cf_image_id} still referenced by ${sharedCount} other row(s) — not deleting it.`);
			} else {
				const cf = await deleteFromCF(row.cf_image_id);
				if (!cf.ok) console.warn(`      ⚠️  CF Images delete failed for ${row.cf_image_id} (non-fatal, row already gone): ${cf.message}`);
			}
		}
	}
	console.log(`      🗑  pruned ${pruned}/${toDelete.length} row(s)${skipped ? ` (${skipped} protected, skipped — re-run with --prune-confirm-identity-loss to override)` : ''}\n`);
}

async function processImage(job: ImageJob, album: { sport: Sport | null; albumName: string }): Promise<ProcessResult> {
	const fileBuffer = readFileSync(job.path);
	// Reprocess-in-place (P1): if this album already has a row for this image_key, UPDATE it —
	// keep its existing photo_id AND cf_image_id — instead of minting a NEW deterministic photo_id,
	// which is what created the bpo-2026 duplicate. New images still get the deterministic id.
	const prior = existingRows.get(job.imageKey);
	const photoId = prior?.photo_id ?? `${ALBUM_KEY}-${job.imageKey}`;
	const cfId = prior?.cf_image_id ?? `${ALBUM_KEY}-${job.imageKey}`;
	const alreadyUploaded = !!prior?.cf_image_id; // existing CF image — refresh metadata, don't re-upload/churn

	// 0. Content-hash duplicate gate (P5 / ADR 0002: `UNIQUE(content_hash)`). A file whose exact
	// bytes already exist under a DIFFERENT photo_id is the "same shoot exported to a second
	// folder" duplicate class this project has hit before. Refuse LOUDLY, before spending an
	// upload + a vision-model call on it — never silently create a second, byte-identical row.
	// A pure read (safe under --dry-run too); the migration's partial UNIQUE INDEX on
	// content_hash is the DB-level backstop for the narrow race where two NEW, mutually-identical
	// files in the same run both pass this check before either is written.
	const contentHash = createHash('sha256').update(fileBuffer).digest('hex');
	{
		const { data: dupe, error: dupeErr } = await sb
			.from('photo_metadata')
			.select('photo_id, album_key, file_name')
			.eq('content_hash', contentHash)
			.neq('photo_id', photoId)
			.maybeSingle();
		if (dupeErr) throw new Error(`content_hash duplicate check failed: ${dupeErr.message}`);
		if (dupe) {
			throw new Error(
				`REFUSED: ${job.file} is byte-identical (content_hash=${contentHash.slice(0, 12)}…) to existing photo ` +
				`${dupe.photo_id} (album ${dupe.album_key}, file "${dupe.file_name}") — looks like the same shoot exported ` +
				`to a second folder. Resolve the duplicate (remove the stray file, or confirm it's intentional and ` +
				`handle it manually) before re-running.`
			);
		}
	}

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

	// 4. Embed the caption (caption-text space; still written, no longer the primary search
	// ranking signal — see blueprint/decisions/0006).
	const embedding = await embedText(ex.extraction.caption, OPENROUTER_API_KEY);
	if (!embedding) throw new Error('embed failed (null vector)');

	// 4b. Embed the IMAGE (image space — the primary search-ranking vector as of 0006) +
	// deterministic sharpness. Same fatal-on-failure contract as the caption embed above: a
	// failed image embed leaves the checkpoint's `failed` entry for this image, safe to retry.
	const resizedForEmbed = await resizeForEmbedding(fileBuffer);
	const imgResult = await embedImageWithRetry(resizedForEmbed);
	if (!imgResult) throw new Error('image embed failed (null vector)');
	if (imgResult.cost) ex.cost = (ex.cost ?? 0) + imgResult.cost;
	// Deterministic — a computation, not a network call — so a failure here (corrupt/unreadable
	// image) is non-fatal: leave sharpness_measured null rather than failing the whole photo over
	// a metric that's secondary to the extraction + both embeddings.
	let sharpnessMeasured: number | null = null;
	try {
		sharpnessMeasured = await computeSharpness(fileBuffer);
	} catch (e) {
		console.warn(`   ⚠️  computeSharpness failed for ${job.file} (non-fatal): ${(e as Error).message}`);
	}

	if (DRY) {
		return { caption: ex.extraction.caption, players: ex.extraction.players.length, sightings: 0, cost: ex.cost, reprocessed: !!prior };
	}

	// 5. UPSERT photo_metadata. sport_type is set by the trigger; quality_score is generated.
	// image_key: preserve the EXISTING value on reprocess — never overwrite it with the
	// filename-derived key. A pre-north-star album's image_key can be a SmugMug-assigned id
	// unrelated to file_name (localKeyFor/existingRows match on file_name for exactly this
	// reason); rewriting it here would silently change a value other code keys on
	// (src/lib/supabase/photo-address.ts, the /photo/[id] route) the moment that album is
	// ever reprocessed. New photos still get the filename-derived key, same as before.
	const row = {
		photo_id: photoId,
		image_key: prior?.image_key ?? job.imageKey,
		album_key: ALBUM_KEY,
		album_name: album.albumName,
		file_name: job.file,
		content_hash: contentHash,
		cf_image_id: cfId,
		caption: ex.extraction.caption,
		photo_category: ex.extraction.photo_category,
		play_type: ex.extraction.play_type,
		visible_text: ex.extraction.visible_text.length ? ex.extraction.visible_text : null,
		sharpness: ex.extraction.sharpness,
		composition_score: ex.extraction.composition_score,
		exposure_accuracy: ex.extraction.exposure_accuracy,
		emotional_impact: ex.extraction.emotional_impact,
		embedding,
		image_embedding: imgResult.vector,
		sharpness_measured: sharpnessMeasured,
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
	// the backfill); dedup_key stays consistent across both write paths.
	//
	// REPLACE, not append: a reprocess re-extracts this photo from scratch, so its OLD
	// 'players_new' sightings are stale the moment a new set is computed (a player who left the
	// frame in the re-extraction, or whose color/jersey read differently, must not linger beside
	// the new row). Delete-then-insert scoped to THIS photo + THIS source converges on re-run;
	// it never touches 'players_old' / 'jersey_singular' sightings, which ingest doesn't own (they
	// come from the one-time backfill — scripts/backfill-jersey-sightings.ts).
	//
	// NOTE: the module header's "admin tag approval → resolve_jersey_to_player" identity-resolution
	// layer (a `resolved_player_id` column on this table) is NOT live — verified live 2026-09-25
	// (`photo_jersey_sightings` has no such column today; `players`/`photo_players`, which
	// supabase/migrations/20260609000000_vnext_slice2_identity.sql would also create, don't exist
	// either). So there is currently nothing this delete could erase that a human resolved. If that
	// migration is ever applied, add `.is('resolved_player_id', null)` here so a reprocess can't
	// wipe a resolved sighting.
	const SIGHTINGS_SOURCE = 'players_new';
	const sightings = shredCaptionPlayers(photoId, ALBUM_KEY!, ex.extraction.players, SIGHTINGS_SOURCE);
	const { error: delErr } = await sb
		.from('photo_jersey_sightings')
		.delete()
		.eq('photo_id', photoId)
		.eq('source', SIGHTINGS_SOURCE);
	if (delErr) throw new Error(`sightings delete (reprocess replace): ${delErr.message}`);

	if (sightings.length) {
		const { error: sErr } = await sb
			.from('photo_jersey_sightings')
			.upsert(sightings, { onConflict: 'dedup_key', ignoreDuplicates: true });
		if (sErr) throw new Error(`sightings upsert: ${sErr.message}`);
	}

	// Report ROWS ACTUALLY STORED, not rows sent — a plain read-back rather than trusting the
	// upsert's own reported count (ignoreDuplicates' exact accounting under a conflict is not
	// something this codebase had verified). This also naturally includes any resolved sighting
	// the delete above preserved, which is the correct "what's stored for this photo now" answer.
	const { count: storedCount, error: cErr } = await sb
		.from('photo_jersey_sightings')
		.select('sighting_id', { count: 'exact', head: true })
		.eq('photo_id', photoId)
		.eq('source', SIGHTINGS_SOURCE);
	if (cErr) throw new Error(`sightings count read-back: ${cErr.message}`);

	return { caption: ex.extraction.caption, players: ex.extraction.players.length, sightings: storedCount ?? 0, cost: ex.cost, reprocessed: !!prior };
}

/** Same bounded-retry-on-429/5xx convention as extractWithRetry below — embedImage throws
 * `RETRY:<status>` for exactly this case. */
async function embedImageWithRetry(resizedJpegBuffer: Buffer) {
	let attempt = 0;
	for (;;) {
		try {
			return await embedImage(resizedJpegBuffer, OPENROUTER_API_KEY!);
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
	console.log(`   Model: ${MODEL} · caption embed: text-embedding-3-large@768 · image embed: gemini-embedding-2@768 · ${EXTRACTION_VERSION}`);
	console.log(`   Concurrency: ${CONCURRENCY}${LIMIT ? ` · limit ${LIMIT}` : ''}${DRY ? ' · DRY RUN' : ''}${OVERWRITE ? ' · OVERWRITE' : ''}`);
	console.log(`   Checkpoint: ${CK_PATH} (${done.size} already done)\n`);

	const album = await resolveAlbum();
	console.log(`   Album sport (authoritative): ${album.sport ?? 'none (non-sport)'}`);
	if (OP_LAT !== null) console.log(`   📍 Venue GPS override (fallback for frames without an EXIF fix): ${OP_LAT}, ${OP_LNG}`);
	console.log('');

	await captureAlbumContext();

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
		const { data } = await sb.from('photo_metadata').select('image_key, photo_id, cf_image_id, file_name').eq('album_key', ALBUM_KEY!);
		for (const r of data ?? []) existingRows.set(localKeyFor(r), { photo_id: r.photo_id, cf_image_id: r.cf_image_id, file_name: r.file_name, image_key: r.image_key });
	}
	if (existingRows.size) {
		console.log(`   ♻️  ${existingRows.size} existing rows for this album — reprocessing those in place (preserve photo_id, no duplicate rows, no CF churn)\n`);
	}

	const files = (await readdir(DIR!)).filter((f) => /\.(jpg|jpeg)$/i.test(f)).sort();
	let jobs: ImageJob[] = files.map((f) => ({ file: f, path: join(DIR!, f), imageKey: f.replace(/\.(jpg|jpeg)$/i, '') }));
	jobs = jobs.filter((j) => OVERWRITE || !done.has(j.imageKey));
	if (LIMIT) jobs = jobs.slice(0, LIMIT);

	console.log(`   ${files.length} images found · ${jobs.length} to process\n`);

	// Missing/renamed files (P8): report DB rows this album has with no matching local file, and
	// --prune them when asked. Uses the FULL local listing (not the OVERWRITE/LIMIT-filtered
	// `jobs`), so --limit for a partial re-run never reports the untouched rest of the album as missing.
	await reportAndPruneMissing(new Set(files.map((f) => f.replace(/\.(jpg|jpeg)$/i, ''))), files.length);
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
		// event_date: derive from the photos' capture dates (EXIF-backed photo_date) so the
		// planner's date filters and the timeline stay truthful as new albums arrive — the
		// 2026-07-10 backfill only covered albums that existed then. Fill-if-null: an
		// operator-set event_date is never overwritten. DB-side MIN so resumed runs work.
		const { data: minRow, error: mErr } = await sb
			.from('photo_metadata')
			.select('photo_date')
			.eq('album_key', ALBUM_KEY!)
			.not('photo_date', 'is', null)
			.order('photo_date', { ascending: true })
			.limit(1)
			.maybeSingle();
		if (!mErr && minRow?.photo_date) {
			const eventDate = String(minRow.photo_date).slice(0, 10);
			const { error: eErr } = await sb
				.from('albums')
				.update({ event_date: eventDate })
				.eq('album_key', ALBUM_KEY!)
				.is('event_date', null);
			if (eErr) console.warn(`   ⚠️  event_date update failed (non-fatal): ${eErr.message}`);
			else console.log(`   📅 event_date: ${eventDate} (min capture date; fill-if-null)`);
		}

		const { error: rErr } = await sb.rpc('refresh_albums_summary');
		if (rErr) {
			// LOUD, not a buried warn: album existence/metadata reads lean on this MV. A silent
			// miss could leave a freshly-ingested album under-served until the next ingest.
			console.error(`   ❌ refresh_albums_summary FAILED: ${rErr.message}`);
			console.error('      → Re-run the refresh (service_role) before relying on the albums listing.');
		} else {
			console.log('   🔄 albums_summary refreshed');
		}

		// Base facet counts (sport/category/play_type) are read from the facet_base_counts
		// matview by the root layout. Ingest is the write event, so refresh it here too.
		const { error: fErr } = await sb.rpc('refresh_facet_base_counts');
		if (fErr) {
			console.error(`   ⚠️  refresh_facet_base_counts FAILED: ${fErr.message} (30-min cron will catch up)`);
		} else {
			console.log('   🔄 facet_base_counts refreshed');
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
	console.log(`   ✅ Ingested: ${ok} (${totalReprocessed} updated in place, ${ok - totalReprocessed} new)   ❌ Failed: ${fail}   👕 Sightings stored: ${totalSightings}`);
	console.log(`   💰 Cost: $${totalCost.toFixed(4)}   ⏱️  ${mins} min`);
	console.log(`   📁 Checkpoint: ${CK_PATH}`);
	if (fail > 0) console.log(`   ⚠️  ${fail} failures recorded in checkpoint.failed — safe to re-run to retry them.`);
	console.log('='.repeat(64) + '\n');
}

main().catch((e) => { console.error('Fatal:', e); saveCheckpoint(); process.exit(1); });
