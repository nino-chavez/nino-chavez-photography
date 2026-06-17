#!/usr/bin/env node
/**
 * Discover Instagram-ready photo SETS from an ingested album — "event highlights".
 *
 * Uses the ingest pipeline's per-photo output (caption + 768-d embedding + quality
 * sub-scores) to assemble ONE coherent, varied carousel per album and a context-aware
 * draft caption. It PROPOSES for review — it never posts. The output (a review HTML +
 * a JSON payload) feeds the existing social-publish queue once you approve.
 *
 * How a "good" set is built:
 *   1. Quality gate — drop unprocessed (sharpness=null); rank by quality_score.
 *   2. Variety — greedily pick top photos, skipping any whose CAPTION EMBEDDING is too
 *      close to one already chosen (cosine ≥ --sim). This is what stops a carousel from
 *      being 10 near-identical burst frames.
 *   3. Cover — the highest emotional_impact frame among the chosen (the scroll-stopper).
 *   4. Caption — an LLM synthesizes one post caption from the chosen photos' captions +
 *      event name/date. DRAFT ONLY: review for voice before publishing.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... npx tsx scripts/discover-ig-sets.ts --album-key rdrsVB \
 *     [--max 10] [--sim 0.9] [--model google/gemini-2.5-flash]
 */
import { config } from 'dotenv';
import { resolve, join } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { cfImageUrl } from '../src/lib/utils/cloudflare-images';
import { VOICES } from './ig-voices';

function flag(name: string): string | undefined {
	const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
	if (eq) return eq.split('=').slice(1).join('=');
	const i = process.argv.indexOf(`--${name}`);
	if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
	return undefined;
}
function die(m: string): never { console.error(`❌ ${m}`); process.exit(1); }

const ALBUM_KEY = flag('album-key');
const MAX = Math.max(2, Math.min(10, parseInt(flag('max') || '10', 10)));
const SIM = parseFloat(flag('sim') || '0.9');
const MODEL = flag('model') || 'google/gemini-2.5-flash';
// --commit appends this proposal's photos to the used-ledger so future runs never re-propose them.
const COMMIT = process.argv.includes('--commit');
const LEDGER = join('.temp', 'ig-used-photos.json');
const BRAND = (flag('brand') || 'flickday').toLowerCase();
if (!ALBUM_KEY) die('--album-key required');
if (!VOICES[BRAND]) die(`--brand "${BRAND}" unknown. Options: ${Object.keys(VOICES).join(', ')}`);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) die('Supabase creds required (.env.local)');
// OPENROUTER is only needed for caption synthesis; discovery works without it (placeholder caption).

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

interface Row {
	photo_id: string;
	cf_image_id: string | null;
	caption: string | null;
	quality_score: number | null;
	emotional_impact: number | null;
	sharpness: number | null;
	photo_category: string | null;
	photo_date: string | null;
	embedding: unknown;
	album_name: string | null;
}

/** pgvector arrives as a JSON-ish string "[...]" over supabase-js; tolerate a real array too. */
function toVec(e: unknown): number[] | null {
	if (Array.isArray(e)) return e as number[];
	if (typeof e === 'string') { try { const v = JSON.parse(e); return Array.isArray(v) ? v : null; } catch { return null; } }
	return null;
}
function cosine(a: number[], b: number[]): number {
	let dot = 0, na = 0, nb = 0;
	for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
	return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// Subject signature from the caption's DISTINCTIVE outfit colors (black/white/gray excluded —
// too common to identify anyone). Two frames of the same player share a look ("pink and black
// jersey") even when their captions embed far apart, so this catches same-person repeats that
// the embedding + timestamp both miss. Heuristic — the robust fix is a visual/CLIP embedding.
const DISTINCT_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'teal', 'maroon', 'navy', 'tan', 'brown', 'gold', 'turquoise', 'magenta'];
const COLOR_RE = new RegExp(`\\b(${DISTINCT_COLORS.join('|')})\\b`, 'g');
function subjectSig(caption: string | null): string {
	const cols = Array.from(new Set((caption?.toLowerCase().match(COLOR_RE)) ?? [])).sort();
	return cols.join('-'); // '' when only generic colors → not used for dedup
}

/** Reject fragments (e.g. a bare "Motion"): need real length, sentence count, and hashtags. */
function isValidCaption(t: string): boolean {
	const s = t.trim();
	return s.length >= 60 && s.split(/\s+/).length >= 12 && /#\w+/.test(s);
}

async function callModel(sys: string, user: string): Promise<string | null> {
	const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], temperature: 0.7 })
	});
	if (!res.ok) return null;
	const j: any = await res.json();
	return (j?.choices?.[0]?.message?.content || '').trim() || null;
}

async function synthCaption(albumName: string, date: string | null, captions: string[]): Promise<string> {
	if (!OPENROUTER_API_KEY) return '[caption pending — sign in to 1Password (OpenRouter) and re-run to synthesize]';
	const sys = 'You write Instagram captions for a sports photographer. Output ONLY the caption text: ' +
		'a strong one-line hook, then 1–2 short sentences of context, then 3–6 relevant hashtags on a new line. ' +
		'No emoji spam (one tasteful emoji max, or none). Confident, not cheesy — avoid clichés like "electric energy" ' +
		'or "testament to the game". Do not invent player names, scores, or facts not present in the photo descriptions. ' +
		'Use CURRENT volleyball terminology: an "attack" or "kill" (never the dated word "spike"), plus dig, set, serve, ' +
		'block, pass. If a photo description says "spike", treat it as an attack.' +
		'\n\n' + VOICES[BRAND].prompt;
	const user = `Event: ${albumName}${date ? `\nDate: ${new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}\n\n` +
		`These are the photos in the carousel (described):\n${captions.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n` +
		`Write ONE caption for this carousel as a whole.`;

	// Retry: the model intermittently returns a fragment (a bare "Motion"). Validate and re-roll,
	// keeping the longest attempt as a clearly-flagged fallback. NEVER silently emit garbage.
	let best = '';
	for (let attempt = 1; attempt <= 3; attempt++) {
		const c = (await callModel(sys, user)) ?? '';
		if (isValidCaption(c)) return c;
		if (c.length > best.length) best = c;
		console.log(`   ⚠️  caption attempt ${attempt} rejected (too short / no hashtags) — retrying`);
	}
	return best
		? `[⚠️ REVIEW — low-confidence caption, rewrite before posting]\n${best}`
		: '[caption synthesis failed after 3 attempts — write the caption manually]';
}

async function main() {
	console.log(`\n📸 Discover IG set — album ${ALBUM_KEY} (event highlights)\n`);
	const { data, error } = await sb
		.from('photo_metadata')
		.select('photo_id, cf_image_id, caption, quality_score, emotional_impact, sharpness, photo_category, photo_date, embedding, album_name')
		.eq('album_key', ALBUM_KEY);
	if (error) die(`query failed: ${error.message}`);
	const rows = (data ?? []) as Row[];
	if (!rows.length) die('no photos for this album');

	const albumName = rows[0].album_name || ALBUM_KEY!;

	// Used-ledger: photos already committed to a prior post — never re-propose them.
	const used = new Set<string>(existsSync(LEDGER) ? (JSON.parse(readFileSync(LEDGER, 'utf-8')).used ?? []) : []);

	// 1. Quality gate: processed only, not already used, ranked by quality.
	const pool = rows
		.filter((r) => r.sharpness != null && r.quality_score != null && r.cf_image_id && toVec(r.embedding) && !used.has(r.photo_id))
		.sort((a, b) => (b.quality_score! - a.quality_score!) || ((b.emotional_impact ?? 0) - (a.emotional_impact ?? 0)));
	const usedInAlbum = rows.filter((r) => used.has(r.photo_id)).length;
	console.log(`   ${rows.length} photos · ${pool.length} eligible (gate)${usedInAlbum ? ` · ${usedInAlbum} excluded as already-posted` : ''}`);
	if (!pool.length) die('no eligible photos (all used or none pass the gate)');

	// 2. Variety: greedy pick, skipping near-duplicate captions (content) AND repeated
	//    distinctive outfits (same subject). One photo per distinctive look keeps a player
	//    from appearing twice in the carousel.
	const picked: Row[] = [];
	const pickedSigs = new Set<string>();
	let skipContent = 0, skipSubject = 0;
	for (const r of pool) {
		const v = toVec(r.embedding)!;
		const sig = subjectSig(r.caption);
		if (!picked.every((p) => cosine(v, toVec(p.embedding)!) < SIM)) { skipContent++; continue; }
		if (sig && pickedSigs.has(sig)) { skipSubject++; continue; }
		picked.push(r);
		if (sig) pickedSigs.add(sig);
		if (picked.length >= MAX) break;
	}
	console.log(`   picked ${picked.length} varied frames (skipped ${skipContent} near-dup captions, ${skipSubject} repeated-subject outfits)`);

	if (process.argv.includes('--debug')) {
		console.log('\n   --- selected (quality · nearest-pick cosine · caption) ---');
		picked.forEach((p, i) => {
			const vp = toVec(p.embedding)!;
			const nn = Math.max(0, ...picked.filter((_, j) => j !== i).map((q) => cosine(vp, toVec(q.embedding)!)));
			console.log(`   ${String(i + 1).padStart(2)}  q${(p.quality_score ?? 0).toFixed(1)}  nn=${nn.toFixed(3)}  ${(p.caption || '').slice(0, 70)}`);
		});
		console.log('');
	}

	// 3. Cover: most striking frame leads the carousel.
	const cover = [...picked].sort((a, b) => (b.emotional_impact ?? 0) - (a.emotional_impact ?? 0))[0];
	const ordered = [cover, ...picked.filter((p) => p.photo_id !== cover.photo_id)];

	// 4. Caption.
	console.log(`   synthesizing caption (${MODEL})…`);
	const caption = await synthCaption(albumName, cover.photo_date, ordered.map((p) => p.caption || '').filter(Boolean));

	// Output: review HTML + queue JSON.
	const CK = '.temp'; if (!existsSync(CK)) mkdirSync(CK, { recursive: true });
	const images = ordered.map((p) => ({ photo_id: p.photo_id, url: cfImageUrl(p.cf_image_id!, 'large'), caption: p.caption, quality: p.quality_score }));
	const payload = { album_key: ALBUM_KEY, album_name: albumName, kind: 'event-highlights', cover_photo_id: cover.photo_id, caption, images: images.map((i) => i.url) };
	const jsonPath = join(CK, `ig-${ALBUM_KEY}.json`);
	writeFileSync(jsonPath, JSON.stringify(payload, null, 2));

	const html = `<!doctype html><meta charset="utf-8"><title>IG set · ${albumName}</title>
<style>body{margin:0;font-family:-apple-system,sans-serif;background:#0a0a0b;color:#fff;padding:32px}
h1{font-size:18px;margin:0 0 4px}.sub{color:#a1a1aa;font-size:13px;margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:24px}
.cell{position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;background:#18181b}
.cell img{width:100%;height:100%;object-fit:cover}.cell.cover{outline:3px solid #e86c5d;outline-offset:-3px}
.cell .q{position:absolute;bottom:4px;right:6px;font-size:11px;background:#000a;padding:1px 5px;border-radius:4px}
.cap{white-space:pre-wrap;background:#18181b;border:1px solid #27272a;border-radius:10px;padding:16px 18px;max-width:640px;line-height:1.5;font-size:15px}
.tag{font-size:11px;color:#71717a;margin-top:14px}</style>
<h1>${albumName} — event highlights</h1>
<div class="sub">${ordered.length} of ${pool.length} eligible · cover outlined in coral · DRAFT — review before posting</div>
<div class="grid">${ordered.map((p) => `<div class="cell ${p.photo_id === cover.photo_id ? 'cover' : ''}"><img src="${cfImageUrl(p.cf_image_id!, 'large')}"><span class="q">${(p.quality_score ?? 0).toFixed(1)}</span></div>`).join('')}</div>
<div class="cap">${caption.replace(/</g, '&lt;')}</div>
<div class="tag">payload: ${jsonPath} → feeds social-publish (upload-r2 → build-queue). Nothing posted.</div>`;
	const htmlPath = join(CK, `ig-${ALBUM_KEY}.html`);
	writeFileSync(htmlPath, html);

	// Commit: mark these photos used so they won't appear in any future post.
	if (COMMIT) {
		const next = Array.from(new Set(Array.from(used).concat(ordered.map((p) => p.photo_id))));
		writeFileSync(LEDGER, JSON.stringify({ used: next }, null, 2));
		console.log(`\n   📒 committed ${ordered.length} photos to ${LEDGER} (now ${next.length} total used)`);
	} else {
		console.log(`\n   ℹ️  not committed — re-run with --commit once you approve, to retire these ${ordered.length} photos from future posts`);
	}

	console.log(`\n   ✅ review: ${htmlPath}`);
	console.log(`   📦 payload: ${jsonPath}\n`);
	console.log('   --- DRAFT CAPTION ---');
	console.log(caption.split('\n').map((l) => '   ' + l).join('\n'));
	console.log('');
}
main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
