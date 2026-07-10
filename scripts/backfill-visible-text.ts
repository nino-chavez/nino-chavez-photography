#!/usr/bin/env node
/**
 * Backfill `photo_metadata.visible_text` on legacy rows — ADDITIVE ONLY.
 *
 * Ingest extraction v2 (PR #78) asks the vision pass for readable garment/signage text
 * (jersey fronts/backs, banners, scoreboards); the ~20K SmugMug-era rows predate it. This
 * runs ONE minimal vision call per photo and updates ONLY visible_text — it deliberately
 * does NOT touch caption / players / embedding / scores (re-captioning 20K rows would cost
 * ~2x for zero findability gain and risk churning already-good captions; same rationale as
 * backfill-vnext's "additive findability, not reclassification").
 *
 * Resume is data-driven: photos with no readable text get [] (not NULL), so
 * `visible_text IS NULL` always means "not yet processed" and a re-run picks up exactly
 * where the last one stopped — checkpoint file is belt-and-suspenders + failure ledger.
 *
 * Image source: Cloudflare Images delivery URL (cf_image_id → 'large'). Album name is NOT
 * passed to the model on purpose: it would bias transcription toward the expected school
 * name; we want only what is actually legible in the frame.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... npx tsx scripts/backfill-visible-text.ts --all [--limit N] [--concurrency 6] [--dry-run]
 *   OPENROUTER_API_KEY=... npx tsx scripts/backfill-visible-text.ts --album-key 5gbdjs
 */
import { config } from 'dotenv';
import { resolve, join } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { cfImageUrl } from '../src/lib/utils/cloudflare-images';

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
const MODEL = 'google/gemini-2.5-flash-lite'; // benchmark-proven (see backfill-vnext.ts) — do NOT "upgrade"

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!OPENROUTER_API_KEY) { console.error('❌ OPENROUTER_API_KEY required (1Password "OpenRouter photography")'); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('❌ Supabase creds required (.env.local)'); process.exit(1); }
if (!ALBUM_KEY && !ALL) { console.error('❌ Pass --album-key <KEY> or --all'); process.exit(1); }

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const SCOPE = ALL ? 'all' : ALBUM_KEY!;

const CK_DIR = '.temp';
if (!existsSync(CK_DIR)) mkdirSync(CK_DIR, { recursive: true });
const CK_PATH = join(CK_DIR, `backfill-visible-text-${SCOPE}.checkpoint.json`);
interface Checkpoint { done: string[]; failed: Record<string, string>; updatedAt: string; }
let ck: Checkpoint = { done: [], failed: {}, updatedAt: '' };
if (existsSync(CK_PATH)) { try { ck = JSON.parse(readFileSync(CK_PATH, 'utf-8')); } catch { /* fresh */ } }
const done = new Set(ck.done);
function saveCheckpoint() {
	ck.done = [...done];
	ck.updatedAt = new Date().toISOString();
	writeFileSync(CK_PATH, JSON.stringify(ck, null, 2));
}

const PROMPT = `Transcribe the text that is CLEARLY READABLE in this sports photograph.

Return ONLY a JSON object: {"visible_text": ["...", ...]}

Include (max 12 distinct strings): school/team/program names printed on jerseys or warmups, player surnames on jersey backs, banner/signage text, scoreboard team names. Transcribe EXACTLY what is printed (e.g. "LEWIS", "FLYERS", "SIKORA").
Do NOT include: jersey numbers or any string that is only digits, partially legible or guessed text, apparel/brand logos ("adidas", "Nike", "NBA", "WILSON", "MOLTEN"), generic equipment words ("VOLLEYBALL"), or anything you are not certain of. When in doubt, leave it out.
If no qualifying text is readable, return {"visible_text": []}.
NO markdown. NO explanation. ONLY the JSON object.`;

function coerceVisibleText(raw: any): string[] | null {
	const arr = raw?.visible_text;
	if (!Array.isArray(arr)) return null;
	const BRANDS = new Set(['adidas', 'nike', 'wilson', 'molten', 'mizuno', 'asics', 'under armour', 'nba', 'baden']);
	return [...new Set(
		arr.filter((t: unknown): t is string => typeof t === 'string')
			.map((t: string) => t.trim())
			.filter((t: string) => t.length >= 2 && t.length <= 60)
			.filter((t: string) => !/^[\d\s:.\-#]+$/.test(t)) // digit-only (scoreboards, clocks)
			.filter((t: string) => !BRANDS.has(t.toLowerCase()))
	)].slice(0, 12) as string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Row { image_key: string; album_key: string; cf_image_id: string; }

async function fetchRows(): Promise<Row[]> {
	const rows: Row[] = [];
	const pageSize = 1000;
	for (let from = 0; ; from += pageSize) {
		let q = sb
			.from('photo_metadata')
			.select('image_key, album_key, cf_image_id')
			.not('cf_image_id', 'is', null)
			.is('visible_text', null) // data-driven resume: [] means "processed, nothing readable"
			.order('image_key', { ascending: true })
			.range(from, from + pageSize - 1);
		if (!ALL && ALBUM_KEY) q = q.eq('album_key', ALBUM_KEY);
		const { data, error } = await q;
		if (error) { console.error('❌ fetch error:', error.message); process.exit(1); }
		if (!data || data.length === 0) break;
		rows.push(...(data as Row[]));
		if (data.length < pageSize) break;
		if (LIMIT && rows.length >= LIMIT) break;
	}
	const pending = rows.filter((r) => !done.has(r.image_key));
	return LIMIT ? pending.slice(0, LIMIT) : pending;
}

async function processRow(row: Row): Promise<{ texts: string[]; cost: number | null }> {
	const url = cfImageUrl(row.cf_image_id, 'large');
	const imgRes = await fetch(url);
	if (!imgRes.ok) throw new Error(`image fetch ${imgRes.status} (${url})`);
	const buf = Buffer.from(await imgRes.arrayBuffer());

	const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${OPENROUTER_API_KEY}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://photography.ninochavez.co',
			'X-Title': 'photography backfill-visible-text',
		},
		body: JSON.stringify({
			model: MODEL,
			messages: [{ role: 'user', content: [
				{ type: 'text', text: PROMPT },
				{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${buf.toString('base64')}` } },
			] }],
			temperature: 0,
			max_tokens: 512,
			usage: { include: true },
		}),
	});
	if (res.status === 429 || res.status >= 500) throw new Error(`RETRY:${res.status}`);
	if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 140)}`);

	const j: any = await res.json();
	const text: string = j.choices?.[0]?.message?.content ?? '';
	const cleaned = text.replace(/```json/gi, '').replace(/```/g, '');
	const m = cleaned.match(/\{[\s\S]*\}/);
	let parsed: any = null;
	if (m) { try { parsed = JSON.parse(m[0]); } catch { /* salvage below */ } }
	// Salvage truncated arrays: at temperature 0 the model occasionally loops one token
	// ("WILSON","WILSON",…) until max_tokens cuts the JSON mid-array — a plain retry hits the
	// same wall. Recover the quoted strings we did get; dedupe+brand filters turn a loop into [].
	if (parsed === null && cleaned.includes('"visible_text"')) {
		const tail = cleaned.slice(cleaned.indexOf('"visible_text"') + '"visible_text"'.length);
		parsed = { visible_text: [...tail.matchAll(/"([^"\n]{2,60})"/g)].map((x) => x[1]) };
	}
	const texts = coerceVisibleText(parsed);
	if (texts === null) throw new Error(`unparseable response: ${text.slice(0, 80)}`);
	const cost = j.usage?.cost ?? null;

	if (!DRY) {
		const { error } = await sb
			.from('photo_metadata')
			.update({ visible_text: texts }) // [] when nothing readable — NEVER null (resume marker)
			.eq('image_key', row.image_key)
			.eq('album_key', row.album_key);
		if (error) throw new Error(`db update: ${error.message}`);
	}
	return { texts, cost };
}

async function processWithRetry(row: Row) {
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

async function main() {
	console.log('\n🔤 Backfill visible_text (additive — caption/players/embedding untouched)\n');
	console.log(`   Scope: ${ALL ? 'ALL albums' : `album ${ALBUM_KEY}`}`);
	console.log(`   Model: ${MODEL} (OpenRouter)`);
	console.log(`   Concurrency: ${CONCURRENCY}${LIMIT ? ` · limit ${LIMIT}` : ''}${DRY ? ' · DRY RUN' : ''}`);
	console.log(`   Checkpoint: ${CK_PATH} (${done.size} already done)\n`);

	const rows = await fetchRows();
	console.log(`   ${rows.length} rows to process\n`);
	if (rows.length === 0) { console.log('✅ Nothing to do.'); return; }

	let ok = 0, fail = 0, withText = 0, totalCost = 0, index = 0;
	const t0 = Date.now();

	async function worker() {
		while (index < rows.length) {
			const row = rows[index++];
			try {
				const r = await processWithRetry(row);
				ok++;
				if (r.texts.length) withText++;
				if (r.cost) totalCost += r.cost;
				if (!DRY) { done.add(row.image_key); delete ck.failed[row.image_key]; }
				if (ok <= 8 || (r.texts.length && ok % 50 === 0)) console.log(`   ✅ ${row.image_key}: [${r.texts.join(', ')}]`);
			} catch (e: any) {
				fail++;
				ck.failed[row.image_key] = String(e?.message || e);
				console.error(`   ❌ ${row.image_key}: ${String(e?.message || e).slice(0, 120)}`);
			}
			const processed = ok + fail;
			if (processed % 100 === 0) {
				saveCheckpoint();
				const rate = processed / ((Date.now() - t0) / 1000);
				const eta = (rows.length - processed) / (rate || 1);
				console.log(`   📊 ${processed}/${rows.length} · ${withText} with text · ${rate.toFixed(1)}/s · ETA ${Math.ceil(eta / 60)}m · $${totalCost.toFixed(4)}`);
			}
		}
	}

	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, () => worker()));
	if (!DRY) saveCheckpoint();

	const mins = ((Date.now() - t0) / 60000).toFixed(1);
	console.log('\n' + '='.repeat(64));
	console.log(`   ✅ Succeeded: ${ok} (${withText} with readable text)   ❌ Failed: ${fail}`);
	console.log(`   💰 Cost: $${totalCost.toFixed(4)}   ⏱️  ${mins} min`);
	if (fail > 0) console.log(`   ⚠️  ${fail} failures in checkpoint.failed — re-run to retry.`);
	console.log('='.repeat(64) + '\n');
}

main().catch((e) => { console.error('Fatal:', e); saveCheckpoint(); process.exit(1); });
