#!/usr/bin/env node
/**
 * Backfill `albums.level` / `albums.division` — the explore facet chips are silently LOSSY:
 * filtering by Division/Level excludes the ~68% of albums whose columns are NULL, not albums
 * that don't match. Same failure shape as the "lewis university" zero-result (missing data
 * masquerading as a non-match).
 *
 * Derivation: one LLM pass over album name + sport + LINKED TEAM NAMES (the entity layer from
 * PR #78 is the grounding — "Lewis University" pins college, "Plainfield North High School"
 * pins high_school). Outputs are validated against the existing column vocabulary and only
 * NULLs are filled; operator-set values are never overwritten.
 *
 * DRY-RUN BY DEFAULT; --apply writes.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... npx tsx scripts/backfill-album-facets.ts [--apply] [--model <id>]
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const MODEL = (() => {
	const i = process.argv.indexOf('--model');
	return i >= 0 ? process.argv[i + 1] : 'google/gemini-2.5-flash';
})();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!OPENROUTER_API_KEY) { console.error('❌ OPENROUTER_API_KEY required'); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('❌ Supabase creds missing (.env.local)'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// Must match the values the explore UI sends (verified against existing rows 2026-07-10).
const LEVELS = new Set(['high_school', 'college', 'club', 'middle_school']);
const DIVISIONS = new Set(['girls', 'boys', 'womens', 'mens', 'coed']);

const PROMPT_HEADER = `You classify sports photo albums by LEVEL and DIVISION for a gallery's search facets.

For each album you get its name, sport, and the canonical names of teams known to appear in it. Return for each:
- "level": one of "high_school" | "college" | "club" | "middle_school" | null
- "division": one of "girls" | "boys" | "womens" | "mens" | "coed" | null

Rules:
- A linked team named "... University" / "... College" → college. "... High School" → high_school. Middle/junior high → middle_school.
- Club volleyball programs (VBC, TeamOne, VLA, Krush, 630, LOVB, Attack, Icemen, Sky High and similar) and adult rec leagues/tournaments (turf/beach 4s, luau, opens, Friday Night leagues) → club.
- Division vocabulary follows level: college/adult male → "mens", college/adult female → "womens"; high_school/middle_school/club-youth male → "boys", female → "girls". Reverse co-ed / RevCo / mixed → "coed".
- "MVB"/"Men's VB" = male volleyball; "WVB"/"GVB" = female. Girls' club age divisions (e.g. "15 Onyx", "16 Pearl") are girls unless the program is a boys program (BVB, Boys).
- If the album name + teams genuinely don't determine a value, use null. NEVER guess outside the vocabulary.

Return ONLY a JSON array: [{"album_key": "...", "level": ..., "division": ...}]. No markdown.

Albums:
`;

interface AlbumIn { album_key: string; album_name: string; sport: string | null; teams: string[]; level: string | null; division: string | null; }

async function extractBatch(albums: AlbumIn[]): Promise<Array<{ album_key: string; level: string | null; division: string | null }>> {
	const payload = albums.map(({ album_key, album_name, sport, teams }) => ({ album_key, album_name, sport, teams }));
	const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${OPENROUTER_API_KEY}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://photography.ninochavez.co',
			'X-Title': 'photography backfill-album-facets',
		},
		body: JSON.stringify({
			model: MODEL,
			messages: [{ role: 'user', content: PROMPT_HEADER + JSON.stringify(payload, null, 1) }],
			temperature: 0,
			max_tokens: 8192,
		}),
	});
	if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
	const j: any = await res.json();
	const text: string = j.choices?.[0]?.message?.content ?? '';
	const m = text.replace(/```json/gi, '').replace(/```/g, '').match(/\[[\s\S]*\]/);
	if (!m) throw new Error(`unparseable batch: ${text.slice(0, 120)}`);
	return JSON.parse(m[0]);
}

async function main() {
	const { data: albums, error } = await sb
		.from('albums')
		.select('album_key, album_name, sport, level, division')
		.or('level.is.null,division.is.null')
		.order('album_name');
	if (error || !albums) { console.error('❌ fetch albums:', error?.message); process.exit(1); }

	const { data: links, error: linkErr } = await sb.from('album_teams').select('album_key, teams(name)');
	if (linkErr) { console.error('❌ fetch album_teams:', linkErr.message); process.exit(1); }
	const teamsByAlbum = new Map<string, string[]>();
	for (const l of links ?? []) {
		const name = (Array.isArray(l.teams) ? l.teams[0]?.name : (l.teams as any)?.name);
		if (!name) continue;
		if (!teamsByAlbum.has(l.album_key)) teamsByAlbum.set(l.album_key, []);
		teamsByAlbum.get(l.album_key)!.push(name);
	}

	// Non-sport albums (graduation, drama, city walks) never get athletic facets — the model
	// otherwise infers level from a school/alias association ("Downtown Aurora" → college).
	const input: AlbumIn[] = albums
		.filter((a) => a.sport !== null)
		.map((a) => ({ ...a, teams: teamsByAlbum.get(a.album_key) ?? [] }));
	console.log(`📚 ${input.length} sport albums missing level and/or division (${albums.length - input.length} non-sport skipped)`);

	const BATCH = 40;
	const results = new Map<string, { level: string | null; division: string | null }>();
	for (let i = 0; i < input.length; i += BATCH) {
		const batch = input.slice(i, i + BATCH);
		process.stdout.write(`🤖 batch ${i / BATCH + 1}/${Math.ceil(input.length / BATCH)}... `);
		const out = await extractBatch(batch);
		for (const r of out) {
			results.set(r.album_key, {
				level: r.level && LEVELS.has(r.level) ? r.level : null,
				division: r.division && DIVISIONS.has(r.division) ? r.division : null,
			});
		}
		console.log(`${out.length} classified`);
	}

	let levelFills = 0, divisionFills = 0;
	const updates: Array<{ album_key: string; album_name: string; patch: Record<string, string> }> = [];
	for (const a of input) {
		const r = results.get(a.album_key);
		if (!r) continue;
		const patch: Record<string, string> = {};
		if (a.level === null && r.level) { patch.level = r.level; levelFills++; }
		if (a.division === null && r.division) { patch.division = r.division; divisionFills++; }
		if (Object.keys(patch).length) updates.push({ album_key: a.album_key, album_name: a.album_name, patch });
	}

	console.log(`\n🏷  ${updates.length} albums to update (${levelFills} level fills, ${divisionFills} division fills)\n`);
	for (const u of updates) console.log(`   ${u.album_key} "${u.album_name}" → ${JSON.stringify(u.patch)}`);
	const untouched = input.filter((a) => !updates.find((u) => u.album_key === a.album_key));
	if (untouched.length) console.log(`\n   (${untouched.length} left as-is: ${untouched.slice(0, 8).map((a) => `"${a.album_name}"`).join(', ')}${untouched.length > 8 ? ', …' : ''})`);

	if (!APPLY) { console.log('\n💡 dry-run (nothing written). Re-run with --apply to write.'); return; }

	let applied = 0;
	for (const u of updates) {
		const { error: uErr } = await sb.from('albums').update(u.patch).eq('album_key', u.album_key);
		if (uErr) console.error(`   ⚠️ ${u.album_key}: ${uErr.message}`);
		else applied++;
	}
	console.log(`\n✅ ${applied}/${updates.length} albums updated`);
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
