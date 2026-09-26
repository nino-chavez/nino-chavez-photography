#!/usr/bin/env node
/**
 * Backfill `photo_metadata.image_embedding` + `sharpness_measured` for existing rows.
 *
 * blueprint/decisions/0006-vision-prompt-v2-and-image-vector-search.md: semantic search moves to
 * IMAGE vectors (google/gemini-embedding-2@768). New ingests write `image_embedding` directly
 * (scripts/ingest-album.ts); this script is the one-time (then resumable/incremental) catch-up
 * for the ~20K rows that predate that change.
 *
 * Per-row work: fetch the Cloudflare Images 'large' (1600px) delivery variant, resize it
 * (`resizeForEmbedding`, same policy ingest uses), embed it (`embedImage`), compute deterministic
 * sharpness (`computeSharpness`, float-math Laplacian variance), UPDATE both columns. Does NOT
 * touch `embedding` (caption vector), `sharpness` (model score), or `quality_score` (generated)
 * — this script owns exactly two columns.
 *
 * PREREQUISITE: supabase/migrations/20260925230000_photo_metadata_image_embedding.sql must be
 * applied first — this script assumes `image_embedding`/`sharpness_measured` exist and does not
 * fall back if they don't (same contract as content_hash's ingest dependency). `--dry-run` is the
 * one exception: it degrades to counting `cf_image_id IS NOT NULL` (with a printed note) when the
 * column doesn't exist yet, so it stays useful for sizing the run BEFORE the migration ships.
 *
 * Resumable: a checkpoint (.temp/backfill-image-embeddings-<scope>.checkpoint.json) records
 * image_key:album_key pairs whose image_embedding write succeeded. Re-running skips them, same
 * pattern as backfill-vnext.ts. `image_embedding IS NULL` in the row query means a lost
 * checkpoint file still resumes correctly (data-driven, not just checkpoint-driven).
 *
 * Cost safety: every embed call's real `usage.cost` (from embedImage's return, NOT a hardcoded
 * 0 — see the eval-harness bug this guards against in src/lib/ai/embeddings.ts's header comment)
 * accumulates into a running total, printed with each progress line. `--max-cost` (default $5)
 * is a HARD stop: once the running total reaches it, no worker starts another row — the run
 * exits cleanly, checkpoint saved, safe to resume with a fresh --max-cost.
 *
 * `--dry-run` spends NOTHING: it reports the row count and a projected cost (count x the
 * measured per-image cost, $0.00012771 — see below) and returns before fetching a single image or
 * calling OpenRouter. It does not walk the row set at all.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... npx tsx scripts/backfill-image-embeddings.ts \
 *     [--album-key <KEY>] [--concurrency 4] [--limit N] [--max-cost 5] [--dry-run] [--overwrite]
 *   (omit --album-key to scope to every album)
 *
 * Credentials: OPENROUTER_API_KEY (1Password "OpenRouter photography"); Supabase creds from
 * .env.local (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) — see ENRICHMENT_WORKFLOW.md.
 */
import { config } from 'dotenv';
import { resolve, join } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { embedImage } from '../src/lib/ai/embeddings';
import { resizeForEmbedding } from '../src/lib/ai/image-resize';
import { computeSharpness } from '../src/lib/ai/sharpness';
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

/** Measured 2026-09-25 via a single live embedImage call against a real production photo
 * (768px-resized JPEG, gemini-embedding-2): usage.cost = $0.00012771, prompt_tokens = 258. Used
 * ONLY to project --dry-run's estimate; a real run logs and sums the API's own reported cost,
 * never this constant. */
const MEASURED_COST_PER_IMAGE = 0.00012771;

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
const CK_DIR = '.temp';
if (!existsSync(CK_DIR)) mkdirSync(CK_DIR, { recursive: true });
const CK_PATH = join(CK_DIR, `backfill-image-embeddings-${SCOPE}.checkpoint.json`);
interface Checkpoint { done: string[]; failed: Record<string, string>; updatedAt: string; }
let ck: Checkpoint = { done: [], failed: {}, updatedAt: '' };
if (existsSync(CK_PATH) && !OVERWRITE) {
	try { ck = JSON.parse(readFileSync(CK_PATH, 'utf-8')); } catch { /* fresh */ }
}
const done = new Set(ck.done);
const checkpointKey = (row: Pick<Row, 'album_key' | 'image_key'>) => `${row.album_key}:${row.image_key}`;
function saveCheckpoint() {
	ck.done = [...done];
	ck.updatedAt = new Date().toISOString();
	writeFileSync(CK_PATH, JSON.stringify(ck, null, 2));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True for Postgres "column does not exist" (42703) — i.e. the column migration hasn't been
 * applied to this DB yet. Used only to degrade --dry-run's count gracefully. */
function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
	if (!error) return false;
	return error.code === '42703' || /column .* does not exist/i.test(error.message ?? '');
}

// ---------------------------------------------------------------------------
// Row fetch
// ---------------------------------------------------------------------------
interface Row { photo_id: string; image_key: string; album_key: string; cf_image_id: string; }

/**
 * Row COUNT only, for --dry-run — never fetches the rows themselves, never touches OpenRouter.
 * Prefers `image_embedding IS NULL` (the real "not yet done" predicate); if that column doesn't
 * exist yet (pre-migration), falls back to counting `cf_image_id IS NOT NULL` and says so — every
 * such row will read as NULL once the column exists, so this is the correct pre-migration count,
 * not a guess.
 *
 * Checks column existence with a tiny NON-head probe first: PostgREST returns an EMPTY error body
 * on a HEAD request's 400 (verified live — no `message`, no `code`, just status 400), so a
 * `head: true` count query can't distinguish "column missing" from any other 400. A `limit(1)`
 * select on the same column gets the real `42703 column ... does not exist` body.
 */
async function countPending(): Promise<{ count: number; preMigration: boolean }> {
	let preMigration = false;
	if (!OVERWRITE) {
		const probe = await sb.from('photo_metadata').select('image_embedding').limit(1);
		if (probe.error && isMissingColumnError(probe.error)) {
			preMigration = true;
			console.log('   ℹ️  image_embedding column does not exist yet (migration not applied) — counting cf_image_id IS NOT NULL as the pre-migration estimate.');
		} else if (probe.error) {
			throw new Error(`countPending probe: ${probe.error.message}`);
		} else {
			let preciseQ = sb.from('photo_metadata').select('photo_id', { count: 'exact', head: true }).not('cf_image_id', 'is', null).is('image_embedding', null);
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
			.select('photo_id, image_key, album_key, cf_image_id')
			.not('cf_image_id', 'is', null)
			.order('image_key', { ascending: true })
			.range(from, from + pageSize - 1);
		if (ALBUM_KEY) q = q.eq('album_key', ALBUM_KEY);
		// Data-driven resume: image_embedding IS NULL == "not yet done" — survives a lost checkpoint.
		if (!OVERWRITE) q = q.is('image_embedding', null);
		const { data, error } = await q;
		if (error) {
			if (isMissingColumnError(error)) {
				console.error('❌ image_embedding column does not exist — apply supabase/migrations/20260925230000_photo_metadata_image_embedding.sql before running this (without --dry-run).');
			} else {
				console.error('❌ fetch error:', error.message);
			}
			process.exit(1);
		}
		if (!data || data.length === 0) break;
		rows.push(...(data as Row[]));
		if (data.length < pageSize) break;
	}
	const pending = rows.filter((r) => OVERWRITE || !done.has(checkpointKey(r)));
	return LIMIT ? pending.slice(0, LIMIT) : pending;
}

// ---------------------------------------------------------------------------
// Per-row work
// ---------------------------------------------------------------------------
interface ProcessResult { cost: number | null; promptTokens: number | null; sharpness: number | null; }

/** Bounded retry on 429/5xx — covers both the CF image fetch AND embedImage's own RETRY throw
 * (embedImage throws `RETRY:<status>`, same convention as extractOne/extractWithRetry). */
async function processRow(row: Row): Promise<ProcessResult> {
	let attempt = 0;
	for (;;) {
		try {
			const url = cfImageUrl(row.cf_image_id, 'large');
			const imgRes = await fetch(url);
			if (imgRes.status === 429 || imgRes.status >= 500) throw new Error(`RETRY:${imgRes.status}`);
			if (!imgRes.ok) throw new Error(`image fetch ${imgRes.status} (${url})`);
			const buf = Buffer.from(await imgRes.arrayBuffer());
			const resized = await resizeForEmbedding(buf);

			const imgResult = await embedImage(resized, OPENROUTER_API_KEY);
			if (!imgResult) throw new Error('embedImage returned null (missing key, empty buffer, or bad response shape)');

			let sharpness: number | null = null;
			try {
				sharpness = await computeSharpness(buf);
			} catch (e) {
				console.warn(`   ⚠️  computeSharpness failed for ${row.image_key} (non-fatal): ${(e as Error).message}`);
			}

			const { error } = await sb
				.from('photo_metadata')
				.update({ image_embedding: imgResult.vector, sharpness_measured: sharpness })
				.eq('photo_id', row.photo_id);
			if (error) throw new Error(`db update: ${error.message}`);

			return { cost: imgResult.cost, promptTokens: imgResult.promptTokens, sharpness };
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
	console.log('\n🖼️  Backfill image embeddings (blueprint/decisions/0006)\n');
	console.log(`   Scope: ${ALBUM_KEY ? `album ${ALBUM_KEY}` : 'ALL albums'}`);
	console.log('   Model: google/gemini-embedding-2@768 (image space) + deterministic sharpness');
	console.log(`   Concurrency: ${CONCURRENCY}${LIMIT ? ` · limit ${LIMIT}` : ''}${OVERWRITE ? ' · OVERWRITE' : ''} · max-cost $${MAX_COST.toFixed(2)}\n`);

	// --dry-run reports the row count + a projected cost and STOPS HERE — it never fetches an
	// image, never calls OpenRouter, never touches the checkpoint. This is the one command in
	// this file that is safe to run against a database that hasn't had the column migration
	// applied yet (countPending degrades gracefully — see its own comment).
	if (DRY) {
		const { count, preMigration } = await countPending();
		const projected = count * MEASURED_COST_PER_IMAGE;
		console.log(`   [DRY] ${count} row(s) would be processed${preMigration ? ' (pre-migration estimate — see note above; the real predicate is image_embedding IS NULL)' : ''}.`);
		console.log(`   [DRY] Projected cost: ~$${projected.toFixed(4)} (at the measured $${MEASURED_COST_PER_IMAGE} / image) — no OpenRouter calls were made to produce this estimate.`);
		if (projected > MAX_COST) {
			console.log(`   [DRY] ⚠️  projected cost exceeds --max-cost $${MAX_COST.toFixed(2)} — a real run will stop partway; raise --max-cost or run it in batches (--album-key / --limit).`);
		}
		return;
	}

	console.log(`   Checkpoint: ${CK_PATH} (${done.size} already done)\n`);
	const rows = await fetchRows();
	console.log(`   ${rows.length} row(s) to process\n`);
	if (rows.length === 0) { console.log('✅ Nothing to do.'); return; }

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
				const r = await processRow(row);
				ok++;
				if (r.cost) totalCost += r.cost;
				done.add(checkpointKey(row));
				delete ck.failed[checkpointKey(row)];
				if (ok <= 8 || ok % 25 === 0) {
					console.log(`   ✅ ${row.image_key}: cost $${(r.cost ?? 0).toFixed(5)} (tokens ${r.promptTokens ?? '?'}) sharpness_measured=${r.sharpness?.toFixed(2) ?? 'null'}`);
				}
			} catch (e: any) {
				fail++;
				ck.failed[checkpointKey(row)] = String(e?.message || e);
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
