#!/usr/bin/env node
/**
 * Backfill `photo_metadata.alt_text` for existing rows.
 *
 * The alt-text pipeline (2026-09-26) adds `alt_text` — a separate, purpose-built screen-reader
 * sentence with no jersey number, name, printed text, or aesthetic filler (src/lib/ai/alt-text-contract.ts)
 * — alongside `caption` (which MUST keep naming jersey numbers, ADR 0006). New ingests write both
 * directly (scripts/ingest-album.ts); this script is the one-time (then resumable/incremental)
 * catch-up for the ~21,743 rows that predate that change.
 *
 * Per-row work: fetch the Cloudflare Images 'medium' (800px) delivery variant — alt_text needs no
 * jersey-digit resolution, so this is cheaper than the full-resolution image ingest uses for
 * caption extraction and needs no `sharp`/native-binding resize step — run the slim alt_text-only
 * vision call (`extractAltTextOnly`, src/lib/ai/alt-text-only.ts), and UPDATE just that one column.
 * Does NOT touch `caption`, `embedding`, `image_embedding`, sightings, or any quality score — this
 * script owns exactly one column, same discipline as backfill-image-embeddings.ts.
 *
 * PREREQUISITE: supabase/migrations/20260926150000_photo_metadata_alt_text.sql must be applied
 * first — this script assumes `alt_text` exists and does not fall back if it doesn't (same
 * contract as content_hash's and image_embedding's ingest dependency). `--dry-run` is the one
 * exception: it degrades to counting `cf_image_id IS NOT NULL` (with a printed note) when the
 * column doesn't exist yet, so it stays useful for sizing the run BEFORE the migration ships.
 *
 * Resumable: a checkpoint (.temp/backfill-alt-text-<scope>.checkpoint.json) records photo_id's
 * whose alt_text write succeeded. Re-running skips them. `alt_text IS NULL` in the row query means
 * a lost checkpoint file still resumes correctly (data-driven, not just checkpoint-driven).
 *
 * Cost safety: every call's real `usage.cost` (from extractAltTextOnly's return, never a hardcoded
 * estimate) accumulates into a running total, printed with each progress line. `--max-cost`
 * (default $5) is a HARD stop: once the running total reaches it, no worker starts another row —
 * the run exits cleanly, checkpoint saved, safe to resume with a fresh --max-cost.
 *
 * `--dry-run` spends NOTHING: it reports the row count and a projected cost (count x the measured
 * per-image cost, $0.0002111 — see MEASURED_COST_PER_IMAGE's own comment for how that number was
 * obtained) and returns before fetching a single image or calling OpenRouter. It does not walk the
 * row set.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... npx tsx scripts/backfill-alt-text.ts \
 *     [--album-key <KEY>] [--concurrency 4] [--limit N] [--max-cost 5] [--dry-run] [--overwrite]
 *   (omit --album-key to scope to every album)
 *
 * Credentials: OPENROUTER_API_KEY (1Password "OpenRouter photography"); Supabase creds from
 * .env.local (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) — see ENRICHMENT_WORKFLOW.md.
 */
import { config } from 'dotenv';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
// Paths resolve from this file, not the shell's working directory, so the script runs the same
// from any folder — same fix as ingest-album.ts (it used to be run from ~ and fail to find
// .env.local).
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(REPO_ROOT, '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { extractAltTextOnly } from '../src/lib/ai/alt-text-only';
import { getTwoTeamMatchupNames } from '../src/lib/ai/alt-text-contract';
import { cfImageUrl } from '../src/lib/utils/cloudflare-images';

// ---------------------------------------------------------------------------
// Args + config
// ---------------------------------------------------------------------------
function flagValue(name: string): string | undefined {
	const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
	if (eq) return eq.split('=').slice(1).join('=');
	const i = process.argv.indexOf(`--${name}`);
	if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
	return undefined;
}

const ALBUM_KEY = flagValue('album-key');
const LIMIT = parseInt(flagValue('limit') || '0', 10) || 0;
const CONCURRENCY = Math.max(1, parseInt(flagValue('concurrency') || '4', 10));
const DRY = process.argv.includes('--dry-run');
const OVERWRITE = process.argv.includes('--overwrite');
const MAX_COST = parseFloat(flagValue('max-cost') || '5');
if (!Number.isFinite(MAX_COST) || MAX_COST <= 0) {
	console.error(`❌ --max-cost must be a positive number (got "${flagValue('max-cost')}")`);
	process.exit(1);
}

/** Measured 2026-09-26 via a single live extractAltTextOnly call against a real production photo
 * (image_key LhVhJ5V, CF 'medium' 800px variant, gemini-2.5-flash-lite): usage.cost = $0.00021110.
 * Used ONLY to project --dry-run's estimate; a real run logs and sums the API's own reported cost. */
const MEASURED_COST_PER_IMAGE = 0.0002111;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DRY && !OPENROUTER_API_KEY) { console.error('❌ OPENROUTER_API_KEY required (1Password "OpenRouter photography")'); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('❌ Supabase creds required (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)'); process.exit(1); }

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const SCOPE = ALBUM_KEY ?? 'all';

// ---------------------------------------------------------------------------
// Checkpoint
// ---------------------------------------------------------------------------
const CK_DIR = join(REPO_ROOT, '.temp');
if (!existsSync(CK_DIR)) mkdirSync(CK_DIR, { recursive: true });
const CK_PATH = join(CK_DIR, `backfill-alt-text-${SCOPE}.checkpoint.json`);
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True for Postgres "column does not exist" (42703) — same probe pattern as
 * backfill-image-embeddings.ts's isMissingColumnError. */
function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
	if (!error) return false;
	return error.code === '42703' || /column .* does not exist/i.test(error.message ?? '');
}

// ---------------------------------------------------------------------------
// Row fetch
// ---------------------------------------------------------------------------
interface Row { photo_id: string; image_key: string; album_key: string; cf_image_id: string; visible_text: string[] | null; }

/**
 * Read the small album_teams mapping once for this run, rather than joining or looking up teams
 * per photo. Only exact two-team matchups receive context; tournaments and other albums preserve
 * the existing color-only behavior.
 */
async function fetchMatchupTeamNames(albumKeys: Iterable<string>): Promise<Map<string, string[]>> {
	const keys = [...new Set(albumKeys)];
	const namesByAlbum = new Map<string, string[]>();
	for (let start = 0; start < keys.length; start += 100) {
		const { data, error } = await sb
			.from('album_teams')
			.select('album_key, teams(name)')
			.in('album_key', keys.slice(start, start + 100));
		if (error) throw new Error(`album team lookup failed: ${error.message}`);
		for (const link of data ?? []) {
			const team = Array.isArray((link as any).teams) ? (link as any).teams[0] : (link as any).teams;
			if (typeof team?.name !== 'string') continue;
			const names = namesByAlbum.get(link.album_key) ?? [];
			names.push(team.name);
			namesByAlbum.set(link.album_key, names);
		}
	}
	const matchups = new Map<string, string[]>();
	for (const [albumKey, names] of namesByAlbum) {
		const teamNames = getTwoTeamMatchupNames(names);
		if (teamNames.length === 2) matchups.set(albumKey, teamNames);
	}
	return matchups;
}

/**
 * Row COUNT only, for --dry-run — never fetches the rows themselves, never touches OpenRouter.
 * Prefers `alt_text IS NULL` (the real "not yet done" predicate); if that column doesn't exist
 * yet (pre-migration), falls back to counting `cf_image_id IS NOT NULL` and says so.
 *
 * Uses a `limit(1)` select to probe column existence rather than a `head: true` count — PostgREST
 * returns an EMPTY error body on a HEAD request's 400 (verified on backfill-image-embeddings.ts),
 * so it can't distinguish "column missing" from any other 400. A `limit(1)` select gets the real
 * `42703 column ... does not exist` body.
 */
async function countPending(): Promise<{ count: number; preMigration: boolean }> {
	let preMigration = false;
	if (!OVERWRITE) {
		const probe = await sb.from('photo_metadata').select('alt_text').limit(1);
		if (probe.error && isMissingColumnError(probe.error)) {
			preMigration = true;
			console.log('   ℹ️  alt_text column does not exist yet (migration not applied) — counting cf_image_id IS NOT NULL as the pre-migration estimate.');
		} else if (probe.error) {
			throw new Error(`countPending probe: ${probe.error.message}`);
		} else {
			let preciseQ = sb.from('photo_metadata').select('photo_id', { count: 'exact', head: true }).not('cf_image_id', 'is', null).is('alt_text', null);
			if (ALBUM_KEY) preciseQ = preciseQ.eq('album_key', ALBUM_KEY);
			const { count, error } = await preciseQ;
			if (error) throw new Error(`countPending: ${error.message}`);
			return { count: count ?? 0, preMigration: false };
		}
	}
	let fallbackQ = sb.from('photo_metadata').select('photo_id', { count: 'exact', head: true }).not('cf_image_id', 'is', null);
	if (ALBUM_KEY) fallbackQ = fallbackQ.eq('album_key', ALBUM_KEY);
	const { count, error } = await fallbackQ;
	if (error) throw new Error(`countPending fallback: ${error.message}`);
	return { count: count ?? 0, preMigration };
}

async function fetchRows(): Promise<Row[]> {
	const rows: Row[] = [];
	const pageSize = 1000;
	for (let from = 0; ; from += pageSize) {
		let q = sb
			.from('photo_metadata')
			.select('photo_id, image_key, album_key, cf_image_id, visible_text')
			.not('cf_image_id', 'is', null)
			.order('image_key', { ascending: true })
			.range(from, from + pageSize - 1);
		if (ALBUM_KEY) q = q.eq('album_key', ALBUM_KEY);
		// Data-driven resume: alt_text IS NULL == "not yet done" — survives a lost checkpoint.
		if (!OVERWRITE) q = q.is('alt_text', null);
		const { data, error } = await q;
		if (error) {
			if (isMissingColumnError(error)) {
				console.error('❌ alt_text column does not exist — apply supabase/migrations/20260926150000_photo_metadata_alt_text.sql before running this (without --dry-run).');
			} else {
				console.error('❌ fetch error:', error.message);
			}
			process.exit(1);
		}
		if (!data || data.length === 0) break;
		rows.push(...(data as Row[]));
		if (data.length < pageSize) break;
	}
	const pending = rows.filter((r) => OVERWRITE || !done.has(r.photo_id));
	return LIMIT ? pending.slice(0, LIMIT) : pending;
}

// ---------------------------------------------------------------------------
// Per-row work
// ---------------------------------------------------------------------------
interface ProcessResult { cost: number | null; altText: string; }

/** Bounded retry on 429/5xx — covers both the CF image fetch AND extractAltTextOnly's own RETRY
 * throw (same convention as extractOne/backfill-image-embeddings.ts's processRow). */
async function processRow(row: Row, teamNames?: string[]): Promise<ProcessResult> {
	let attempt = 0;
	for (;;) {
		try {
			const url = cfImageUrl(row.cf_image_id, 'medium'); // 800px — plenty for scene/action/color, no jersey-digit need
			const imgRes = await fetch(url);
			if (imgRes.status === 429 || imgRes.status >= 500) throw new Error(`RETRY:${imgRes.status}`);
			if (!imgRes.ok) throw new Error(`image fetch ${imgRes.status} (${url})`);
			const buf = Buffer.from(await imgRes.arrayBuffer());

			const result = await extractAltTextOnly(buf, {
				apiKey: OPENROUTER_API_KEY!,
				visibleText: row.visible_text ?? undefined,
				teamNames
			});

			const { error } = await sb
				.from('photo_metadata')
				.update({ alt_text: result.altText })
				.eq('photo_id', row.photo_id);
			if (error) throw new Error(`db update: ${error.message}`);

			return { cost: result.cost, altText: result.altText };
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
	console.log('\n🖼️  Backfill alt_text (alt-text pipeline, 2026-09-26)\n');
	console.log(`   Scope: ${ALBUM_KEY ? `album ${ALBUM_KEY}` : 'ALL albums'}`);
	console.log('   Model: google/gemini-2.5-flash-lite (alt_text-only slim call, CF "medium" 800px variant)');
	console.log(`   Concurrency: ${CONCURRENCY}${LIMIT ? ` · limit ${LIMIT}` : ''}${OVERWRITE ? ' · OVERWRITE' : ''} · max-cost $${MAX_COST.toFixed(2)}\n`);

	// --dry-run reports the row count + a projected cost and STOPS HERE — it never fetches an
	// image, never calls OpenRouter, never touches the checkpoint. Safe against a database that
	// hasn't had the column migration applied yet (countPending degrades gracefully).
	if (DRY) {
		const { count, preMigration } = await countPending();
		const projected = count * MEASURED_COST_PER_IMAGE;
		console.log(`   [DRY] ${count} row(s) would be processed${preMigration ? ' (pre-migration estimate — see note above; the real predicate is alt_text IS NULL)' : ''}.`);
		console.log(`   [DRY] Projected cost: ~$${projected.toFixed(4)} (at ~$${MEASURED_COST_PER_IMAGE}/image) — no OpenRouter calls were made to produce this estimate.`);
		if (projected > MAX_COST) {
			console.log(`   [DRY] ⚠️  projected cost exceeds --max-cost $${MAX_COST.toFixed(2)} — a real run will stop partway; raise --max-cost or run it in batches (--album-key / --limit).`);
		}
		return;
	}

	console.log(`   Checkpoint: ${CK_PATH} (${done.size} already done)\n`);
	const rows = await fetchRows();
	console.log(`   ${rows.length} row(s) to process\n`);
	if (rows.length === 0) { console.log('✅ Nothing to do.'); return; }
	const matchupTeamNames = await fetchMatchupTeamNames(rows.map((row) => row.album_key));
	console.log(`   ${matchupTeamNames.size} two-team matchup album(s) will receive team-name context; all others stay color-only\n`);

	let ok = 0, fail = 0, totalCost = 0, index = 0;
	let budgetExceeded = false;
	const t0 = Date.now();

	async function worker() {
		for (;;) {
			if (budgetExceeded) return;
			if (totalCost >= MAX_COST) {
				budgetExceeded = true;
				console.error(`\n   ⛔ --max-cost $${MAX_COST.toFixed(2)} reached (spent $${totalCost.toFixed(4)}) — stopping. Re-run to resume from checkpoint.\n`);
				return;
			}
			const i = index++;
			if (i >= rows.length) return;
			const row = rows[i];
			try {
				const r = await processRow(row, matchupTeamNames.get(row.album_key));
				ok++;
				if (r.cost) totalCost += r.cost;
				done.add(row.photo_id);
				delete ck.failed[row.photo_id];
				if (ok <= 8 || ok % 25 === 0) {
					console.log(`   ✅ ${row.image_key}: cost $${(r.cost ?? 0).toFixed(5)} · "${r.altText}"`);
				}
			} catch (e: any) {
				fail++;
				ck.failed[row.photo_id] = String(e?.message || e);
				console.error(`   ❌ ${row.image_key}: ${String(e?.message || e).slice(0, 140)}`);
			}
			const processed = ok + fail;
			if (processed % 20 === 0) {
				saveCheckpoint();
				const rate = processed / ((Date.now() - t0) / 1000);
				const eta = (rows.length - processed) / (rate || 1);
				console.log(`   📊 ${processed}/${rows.length} · ${rate.toFixed(1)}/s · ETA ${Math.ceil(eta / 60)}m · running cost $${totalCost.toFixed(4)} / max $${MAX_COST.toFixed(2)}`);
			}
		}
	}

	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, () => worker()));
	saveCheckpoint();

	const mins = ((Date.now() - t0) / 60000).toFixed(1);
	console.log('\n' + '='.repeat(64));
	console.log(`   ✅ Succeeded: ${ok}   ❌ Failed: ${fail}${budgetExceeded ? '   ⛔ STOPPED (max-cost)' : ''}`);
	console.log(`   💰 Cost: $${totalCost.toFixed(4)} (max $${MAX_COST.toFixed(2)})   ⏱️  ${mins} min`);
	console.log(`   📁 Checkpoint: ${CK_PATH}`);
	if (fail > 0) console.log(`   ⚠️  ${fail} failures recorded in checkpoint.failed — safe to re-run to retry them.`);
	if (budgetExceeded) console.log(`   ↻ Re-run (same flags) to resume the remaining ${rows.length - ok - fail} row(s) from checkpoint.`);
	console.log('='.repeat(64) + '\n');
}

main().catch((e) => { console.error('Fatal:', e); if (!DRY) saveCheckpoint(); process.exit(1); });
