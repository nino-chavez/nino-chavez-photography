#!/usr/bin/env node
/**
 * Backfill v-next Phase 1 — re-enrich (caption + players) + caption-embed existing
 * photo_metadata rows. Resumable (checkpoint file), idempotent (skips done rows),
 * throttled (worker pool + 429 backoff), contract-checked (visible-facts caption
 * contract with conversational self-correction, max MAX_CAPTION_CORRECTIONS rounds).
 *
 * Image source : Cloudflare Images delivery URL (cf_image_id → 'large' / 1600px variant).
 * Enrichment   : OpenRouter google/gemini-2.5-flash-lite via buildCombinedPrompt()
 *                (benchmark-proven model — do NOT "upgrade"). Returns caption + players[].
 * Embedding    : OpenRouter text-embedding-3-large @768 (embedText) → `embedding` column.
 *
 * Persists ONLY the new findability fields — caption, players, team_colors, embedding —
 * plus enriched_at / ai_provider / ai_cost. It deliberately does NOT overwrite the existing
 * bucket1/bucket2 classification or quality scores: the goal is additive findability, not
 * reclassification (which would also disturb the quality_score sort).
 *
 * Resumability: a checkpoint file (.temp/backfill-vnext-<scope>.checkpoint.json) records the
 * image_keys fully processed (caption AND embedding written). Re-running skips them. A row
 * whose enrichment succeeded but embedding failed is NOT marked done, so it retries next run.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... npx tsx scripts/backfill-vnext.ts --album-key TRoiyO [--limit N] [--concurrency 6] [--dry-run] [--overwrite]
 *   OPENROUTER_API_KEY=... npx tsx scripts/backfill-vnext.ts --all [...]
 *
 * Credentials (runtime-injected; see project memory): OPENROUTER_API_KEY (1Password
 * "OpenRouter photography"); Supabase creds from .env.local.
 */
import { config } from 'dotenv';
import { resolve, join } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { buildCaptionPrompt } from '../src/lib/ai/enrichment-prompts';
import {
	assertCaptionContract,
	buildCaptionCorrectionMessage,
	inspectCaption,
	MAX_CAPTION_CORRECTIONS
} from '../src/lib/ai/caption-contract';
import { embedText } from '../src/lib/ai/embeddings';
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
const ALL = process.argv.includes('--all');
const LIMIT = parseInt(flagValue('limit') || '0', 10) || 0;
const CONCURRENCY = Math.max(1, parseInt(flagValue('concurrency') || '6', 10));
const DRY = process.argv.includes('--dry-run');
const OVERWRITE = process.argv.includes('--overwrite');
const CLAIMS_ONLY = process.argv.includes('--claims-only');
const MODEL = 'google/gemini-2.5-flash-lite';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!OPENROUTER_API_KEY) { console.error('❌ OPENROUTER_API_KEY required (runtime-inject from 1Password "OpenRouter photography")'); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('❌ Supabase creds required (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)'); process.exit(1); }
if (!ALBUM_KEY && !ALL) { console.error('❌ Pass --album-key <KEY> (e.g. TRoiyO) or --all'); process.exit(1); }

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const SCOPE = `${ALL ? 'all' : ALBUM_KEY!}${CLAIMS_ONLY ? '-claims' : ''}`;

// ---------------------------------------------------------------------------
// Checkpoint
// ---------------------------------------------------------------------------
const CK_DIR = '.temp';
if (!existsSync(CK_DIR)) mkdirSync(CK_DIR, { recursive: true });
const CK_PATH = join(CK_DIR, `backfill-vnext-${SCOPE}.checkpoint.json`);
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
// Helpers
// ---------------------------------------------------------------------------
function parseModelJson(text: string): any | null {
	const cleaned = text.replace(/```json/gi, '').replace(/```/g, '');
	const m = cleaned.match(/\{[\s\S]*\}/);
	if (!m) return null;
	try { return JSON.parse(m[0]); } catch { return null; }
}

/**
 * Lenient caption recovery for when JSON.parse fails. The model sometimes emits UNESCAPED double
 * quotes inside the caption string (team names, jersey text, logos — e.g. ...with "Chargers" on...),
 * which breaks strict JSON and previously dropped a caption the model actually produced. Grab the
 * caption value up to the closing quote that precedes the next key or the object end.
 */
function extractCaptionLenient(text: string): string {
	const m = text.match(/"caption"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"[a-z_]+"\s*:|}\s*$)/i);
	return m ? m[1].replace(/\\"/g, '"').trim() : '';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Row { image_key: string; album_key: string; album_name: string | null; cf_image_id: string; caption: string | null; }

async function fetchRows(): Promise<Row[]> {
	const rows: Row[] = [];
	const pageSize = 1000;
	for (let from = 0; ; from += pageSize) {
		let q = sb
			.from('photo_metadata')
			.select('image_key, album_key, album_name, cf_image_id, caption')
			.not('cf_image_id', 'is', null)
			.order('image_key', { ascending: true })
			.range(from, from + pageSize - 1);
		if (!ALL && ALBUM_KEY) q = q.eq('album_key', ALBUM_KEY);
		// Data-driven resume: processRow writes caption + embedding atomically (caption is
		// never set without a successful embedding), so `caption IS NULL` == "not yet done".
		// This makes the run resumable even if the checkpoint file is lost, and skips the
		// already-captioned TRoiyO test rows automatically on a --all run.
		if (!OVERWRITE && !CLAIMS_ONLY) q = q.is('caption', null);
		const { data, error } = await q;
		if (error) { console.error('❌ fetch error:', error.message); process.exit(1); }
		if (!data || data.length === 0) break;
		rows.push(...(data as Row[]));
		if (data.length < pageSize) break;
		if (LIMIT && rows.length >= LIMIT) break;
	}
	// Skip checkpointed rows; honor --limit on the remaining work.
	const pending = rows.filter((r) => {
		if (done.has(r.image_key) && !OVERWRITE) return false;
		if (CLAIMS_ONLY) return !!r.caption && inspectCaption(r.caption).length > 0;
		return true;
	});
	return LIMIT ? pending.slice(0, LIMIT) : pending;
}

/** Re-enrich + embed a single row. Throws on any failure (caller records it). */
async function processRow(row: Row): Promise<{ caption: string; players: number; cost: number | null }> {
	const url = cfImageUrl(row.cf_image_id, 'large');
	const imgRes = await fetch(url);
	if (!imgRes.ok) throw new Error(`image fetch ${imgRes.status} (${url})`);
	const buf = Buffer.from(await imgRes.arrayBuffer());
	const dataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;

	// Slim caption+players prompt — ~52% cheaper than the full combined prompt at equal
	// quality, because the backfill discards bucket1/bucket2 anyway (measured 2026-06-08).
	const prompt = buildCaptionPrompt({ albumName: row.album_name || undefined });
	const messages: Array<{ role: string; content: unknown }> = [
		{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: dataUrl } }] }
	];
	let caption = '';
	let players: any[] = [];
	let cost: number | null = null;

	for (let corrections = 0; ; corrections++) {
		const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${OPENROUTER_API_KEY}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': 'https://photography.ninochavez.co',
				'X-Title': 'photography backfill-vnext'
			},
			body: JSON.stringify({
				model: MODEL,
				messages,
				temperature: 0,
				// caption is the LAST field in the JSON, so it's the first casualty of truncation —
				// give enough headroom that a verbose bucket1/bucket2 never cuts it off.
				max_tokens: 3072,
				usage: { include: true }
			})
		});
		if (res.status === 429 || res.status >= 500) throw new Error(`RETRY:${res.status}`);
		if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 140)}`);

		const j: any = await res.json();
		if (j.usage?.cost != null) cost = (cost ?? 0) + j.usage.cost;
		const text = j.choices?.[0]?.message?.content ?? '';
		const parsed = parseModelJson(text);
		caption = (parsed?.caption ?? '').toString().trim();
		if (!caption) caption = extractCaptionLenient(text); // recover captions with unescaped inner quotes
		if (!caption) throw new Error(`no caption parsed (got: ${text.slice(0, 80)})`);
		players = Array.isArray(parsed?.players) ? parsed.players : [];

		const issues = inspectCaption(caption);
		if (!issues.length) break;
		// issues are non-empty here, so this always throws — the canonical contract error.
		if (corrections >= MAX_CAPTION_CORRECTIONS) assertCaptionContract(caption);

		// At temperature 0 a plain retry reproduces the same violation; correct conversationally.
		messages.push({ role: 'assistant', content: text });
		messages.push({ role: 'user', content: buildCaptionCorrectionMessage(issues) });
	}

	const teamColors = Array.from(
		new Set(players.map((p: any) => p?.team_color).filter((c: any) => typeof c === 'string' && c.trim()))
	).slice(0, 8);

	const embedding = await embedText(caption, OPENROUTER_API_KEY);
	if (!embedding) throw new Error('embed failed (null vector)');

	if (DRY) return { caption, players: players.length, cost };

	const { error } = await sb
		.from('photo_metadata')
		.update({
			caption,
			players,
			team_colors: teamColors,
			embedding,
			enriched_at: new Date().toISOString(),
			ai_provider: 'openrouter',
			...(cost != null ? { ai_cost: cost } : {})
		})
		.eq('image_key', row.image_key)
		.eq('album_key', row.album_key);
	if (error) throw new Error(`db update: ${error.message}`);

	return { caption, players: players.length, cost };
}

/** Process with bounded retry on 429/5xx. */
async function processWithRetry(row: Row): Promise<{ caption: string; players: number; cost: number | null }> {
	let attempt = 0;
	for (;;) {
		try {
			return await processRow(row);
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
	console.log('\n🔁 Backfill v-next (Phase 1: caption + players + caption-embed)\n');
	if (CLAIMS_ONLY) console.log('   Scope: stored captions that violate the visible-facts caption contract\n');
	console.log(`   Scope: ${ALL ? 'ALL albums' : `album ${ALBUM_KEY}`}`);
	console.log(`   Model: ${MODEL} (OpenRouter) · embed: text-embedding-3-large@768`);
	console.log(`   Concurrency: ${CONCURRENCY}${LIMIT ? ` · limit ${LIMIT}` : ''}${DRY ? ' · DRY RUN' : ''}${OVERWRITE ? ' · OVERWRITE' : ''}`);
	console.log(`   Checkpoint: ${CK_PATH} (${done.size} already done)\n`);

	const rows = await fetchRows();
	console.log(`   ${rows.length} rows to process\n`);
	if (rows.length === 0) { console.log('✅ Nothing to do.'); return; }

	let ok = 0, fail = 0, totalCost = 0, index = 0;
	const t0 = Date.now();

	async function worker() {
		while (index < rows.length) {
			const row = rows[index++];
			try {
				const r = await processWithRetry(row);
				ok++;
				if (r.cost) totalCost += r.cost;
				if (!DRY) { done.add(row.image_key); delete ck.failed[row.image_key]; }
				if (ok <= 8 || ok % 25 === 0) console.log(`   ✅ ${row.image_key}: "${r.caption.slice(0, 70)}" (players ${r.players})`);
			} catch (e: any) {
				fail++;
				ck.failed[row.image_key] = String(e?.message || e);
				console.error(`   ❌ ${row.image_key}: ${String(e?.message || e).slice(0, 120)}`);
			}
			const processed = ok + fail;
			if (processed % 20 === 0) {
				saveCheckpoint();
				const rate = processed / ((Date.now() - t0) / 1000);
				const eta = (rows.length - processed) / (rate || 1);
				console.log(`   📊 ${processed}/${rows.length} · ${rate.toFixed(1)}/s · ETA ${Math.ceil(eta / 60)}m · cost $${totalCost.toFixed(4)}`);
			}
		}
	}

	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, () => worker()));
	if (!DRY) saveCheckpoint();

	const mins = ((Date.now() - t0) / 60000).toFixed(1);
	console.log('\n' + '='.repeat(64));
	console.log(`   ✅ Succeeded: ${ok}   ❌ Failed: ${fail}`);
	console.log(`   💰 Enrichment cost: $${totalCost.toFixed(4)}   ⏱️  ${mins} min`);
	console.log(`   📁 Checkpoint: ${CK_PATH}`);
	if (fail > 0) console.log(`   ⚠️  ${fail} failures recorded in checkpoint.failed — safe to re-run to retry them.`);
	console.log('='.repeat(64) + '\n');
}

main().catch((e) => { console.error('Fatal:', e); saveCheckpoint(); process.exit(1); });
