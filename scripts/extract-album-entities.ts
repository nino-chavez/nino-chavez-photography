#!/usr/bin/env node
/**
 * Backfill team entities + event dates from the 260 existing album names.
 *
 * Team identity currently lives only inside `album_name` display strings ("Lewis vs UCLA"),
 * which is why official-name searches ("lewis university") return zero. This script:
 *   1. derives `albums.event_date` deterministically (explicit date in the name wins,
 *      else MIN(photo_date) from the album's photos — plain code, no LLM), and
 *   2. runs ONE LLM pass (OpenRouter, text-only) over the album names to extract teams
 *      with canonical names + search aliases ("Lewis" → "Lewis University", "Lewis Flyers"),
 *      then upserts teams / team_aliases / album_teams.
 *
 * DRY-RUN BY DEFAULT — prints the full proposed dataset for operator review; --apply writes.
 * Aliases are lowercase-normalized; first writer wins (PK on alias), conflicts are reported.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... npx tsx scripts/extract-album-entities.ts [--apply] [--model <id>]
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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------------------------------------------------------------------
// Deterministic event_date: explicit date in the name > MIN(photo_date)
// ---------------------------------------------------------------------------

/** Parse an explicit, UNAMBIGUOUS date out of an album name. Partial dates ("Mar 22" with no
 * year) return null — MIN(photo_date) is better ground truth than a guessed year. */
function dateFromName(name: string): string | null {
	// 04-02-2026 / 04/02/2026 (US order: month first)
	let m = name.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/);
	if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
	// 2026-04-02
	m = name.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
	if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
	return null;
}

async function minPhotoDates(): Promise<Map<string, string>> {
	const { data, error } = await supabase.rpc('exec_sql', {
		sql: `SELECT album_key, MIN(photo_date)::date::text AS min_date
		      FROM photo_metadata WHERE photo_date IS NOT NULL GROUP BY album_key`,
	});
	if (error) { console.error('❌ exec_sql min(photo_date):', error.message); process.exit(1); }
	const rows: Array<{ album_key: string; min_date: string }> = Array.isArray(data) ? data : (data?.rows ?? []);
	return new Map(rows.map((r) => [r.album_key, r.min_date]));
}

// ---------------------------------------------------------------------------
// LLM team extraction
// ---------------------------------------------------------------------------

interface ExtractedTeam { canonical: string; aliases: string[] }
interface AlbumTeams { album_key: string; teams: ExtractedTeam[] }

const PROMPT_HEADER = `You extract TEAM/SCHOOL/PROGRAM entities from sports photo album names so a gallery search can resolve the names people actually type.

For each album, identify the competing teams/schools/programs named in the title. Rules:
- Album names often follow "X vs Y" or "X at Y"; season/division prefixes ("2024 Men's VB -", "College MVB -") and date suffixes ("- Mar 22", "- 04-02-2026", "- Winter 2026") are NOT teams.
- "canonical": the full official program name when the school is well known and unambiguous (e.g. "Lewis" in NCAA men's volleyball context → "Lewis University"; "MSOE" → "Milwaukee School of Engineering"; "UCLA" stays "UCLA"). Club/youth programs stay as written (e.g. "630 Volleyball Krush"). NEVER guess between multiple plausible schools — if ambiguous, use the name as written.
- "aliases": every string a person might type for that team — the as-written form from the album name, the short name, acronym, and school+mascot form (e.g. Lewis University → ["lewis", "lewis university", "lewis flyers"]). Aliases must be DISTINCTIVE: never emit a bare generic word ("university", "college", "state", "club") or a bare mascot ("flyers", "eagles") that could match many teams.
- Tournament/event albums with no named opposing teams (e.g. "Players Sports Spring Turf Luau") → "teams": [].
- Same real-world team must get the SAME canonical string in every album it appears in.

Return ONLY a JSON array: [{"album_key": "...", "teams": [{"canonical": "...", "aliases": ["..."]}]}]. No markdown, no commentary.

Albums:
`;

async function extractBatch(albums: Array<{ album_key: string; album_name: string; sport: string | null }>): Promise<AlbumTeams[]> {
	const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${OPENROUTER_API_KEY}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://photography.ninochavez.co',
			'X-Title': 'photography extract-album-entities',
		},
		body: JSON.stringify({
			model: MODEL,
			messages: [{ role: 'user', content: PROMPT_HEADER + JSON.stringify(albums, null, 1) }],
			temperature: 0,
			max_tokens: 8192,
		}),
	});
	if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
	const j: any = await res.json();
	const text: string = j.choices?.[0]?.message?.content ?? '';
	const m = text.replace(/```json/gi, '').replace(/```/g, '').match(/\[[\s\S]*\]/);
	if (!m) throw new Error(`unparseable batch response: ${text.slice(0, 120)}`);
	return JSON.parse(m[0]);
}

const normAlias = (a: string) => a.toLowerCase().replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const { data: albums, error } = await supabase
		.from('albums')
		.select('album_key, album_name, sport, event_date')
		.order('album_name');
	if (error || !albums) { console.error('❌ fetch albums:', error?.message); process.exit(1); }
	console.log(`📚 ${albums.length} albums`);

	// --- event_date proposals (deterministic) ---
	const minDates = await minPhotoDates();
	const dateUpdates: Array<{ album_key: string; album_name: string; event_date: string; source: string }> = [];
	for (const a of albums) {
		if (a.event_date) continue;
		const named = dateFromName(a.album_name);
		const derived = named ?? minDates.get(a.album_key) ?? null;
		if (derived) dateUpdates.push({ album_key: a.album_key, album_name: a.album_name, event_date: derived, source: named ? 'name' : 'min_photo_date' });
	}
	console.log(`📅 event_date proposals: ${dateUpdates.length} (${dateUpdates.filter((d) => d.source === 'name').length} from name, rest from min photo_date)`);

	// --- LLM team extraction in batches ---
	const BATCH = 40;
	const perAlbum: AlbumTeams[] = [];
	for (let i = 0; i < albums.length; i += BATCH) {
		const batch = albums.slice(i, i + BATCH).map(({ album_key, album_name, sport }) => ({ album_key, album_name, sport }));
		process.stdout.write(`🤖 batch ${i / BATCH + 1}/${Math.ceil(albums.length / BATCH)} (${batch.length} albums)... `);
		const out = await extractBatch(batch);
		perAlbum.push(...out);
		console.log(`${out.length} results`);
	}

	// --- merge: canonical name → team; alias → canonical (first wins, conflicts reported) ---
	// Canonical pre-merge: batches see different album subsets, so the same real-world team
	// comes back under near-identical canonicals ("VLA BREEZE"/"VLA Breeze", "630 Boy's/Boys
	// Volleyball Club", "Aurora Central Catholic (High School)"). Fold them before entity
	// assembly, otherwise the team's albums split across two rows and search sees half.
	const normKey = (n: string) => n.toLowerCase().replace(/['’]/g, '').replace(/\s+/g, ' ').trim();
	const byKey = new Map<string, string>(); // normKey -> first-seen canonical
	for (const rec of perAlbum)
		for (const t of rec.teams ?? []) {
			const c = t.canonical?.trim();
			if (c && !byKey.has(normKey(c))) byKey.set(normKey(c), c);
		}
	const remap = (raw: string): string => {
		const key = normKey(raw);
		// "X High School" and bare "X" both present → same school; keep the explicit form.
		const hsKey = `${key} high school`;
		if (byKey.has(hsKey)) return byKey.get(hsKey)!;
		if (key.endsWith(' high school')) return byKey.get(key)!;
		return byKey.get(key) ?? raw;
	};

	const teams = new Map<string, Set<string>>(); // canonical -> aliases
	const albumTeams: Array<{ album_key: string; canonical: string }> = [];
	const aliasOwner = new Map<string, string>();
	const conflicts: string[] = [];
	for (const rec of perAlbum) {
		for (const t of rec.teams ?? []) {
			const canonical = t.canonical?.trim() && remap(t.canonical.trim());
			if (!canonical) continue;
			if (!teams.has(canonical)) teams.set(canonical, new Set());
			const set = teams.get(canonical)!;
			for (const raw of [canonical, ...(t.aliases ?? [])]) {
				const alias = normAlias(raw);
				if (alias.length < 3) continue;
				const owner = aliasOwner.get(alias);
				if (owner && owner !== canonical) { conflicts.push(`"${alias}": ${owner} vs ${canonical}`); continue; }
				aliasOwner.set(alias, canonical);
				set.add(alias);
			}
			albumTeams.push({ album_key: rec.album_key, canonical });
		}
	}

	console.log(`\n🏷  ${teams.size} teams, ${aliasOwner.size} aliases, ${albumTeams.length} album↔team links`);
	if (conflicts.length) console.log(`⚠️  alias conflicts (kept first owner):\n   ${[...new Set(conflicts)].join('\n   ')}`);
	for (const [canonical, aliases] of [...teams.entries()].sort()) {
		const keys = albumTeams.filter((at) => at.canonical === canonical).map((at) => at.album_key);
		console.log(`   ${canonical}  [${[...aliases].join(', ')}]  → ${keys.length} album(s)`);
	}

	if (!APPLY) { console.log('\n💡 dry-run (nothing written). Re-run with --apply to write.'); return; }

	// --- write ---
	console.log('\n✍️  writing…');
	const teamRows = [...teams.keys()].map((name) => ({ name }));
	const { error: teamErr } = await supabase.from('teams').upsert(teamRows, { onConflict: 'name' });
	if (teamErr) { console.error('❌ teams upsert:', teamErr.message); process.exit(1); }
	const { data: teamIds, error: idErr } = await supabase.from('teams').select('team_id, name');
	if (idErr || !teamIds) { console.error('❌ teams read-back:', idErr?.message); process.exit(1); }
	const idByName = new Map(teamIds.map((t) => [t.name, t.team_id]));

	const aliasRows = [...aliasOwner.entries()]
		.filter(([, canonical]) => idByName.has(canonical))
		.map(([alias, canonical]) => ({ alias, team_id: idByName.get(canonical)!, source: 'album_parse' }));
	const { error: aliasErr } = await supabase.from('team_aliases').upsert(aliasRows, { onConflict: 'alias', ignoreDuplicates: true });
	if (aliasErr) { console.error('❌ aliases upsert:', aliasErr.message); process.exit(1); }

	const linkRows = albumTeams
		.filter((at) => idByName.has(at.canonical))
		.map((at) => ({ album_key: at.album_key, team_id: idByName.get(at.canonical)!, source: 'album_parse' }));
	const { error: linkErr } = await supabase.from('album_teams').upsert(linkRows, { onConflict: 'album_key,team_id', ignoreDuplicates: true });
	if (linkErr) { console.error('❌ album_teams upsert:', linkErr.message); process.exit(1); }

	let dated = 0;
	for (const d of dateUpdates) {
		const { error: dErr } = await supabase.from('albums').update({ event_date: d.event_date }).eq('album_key', d.album_key).is('event_date', null);
		if (dErr) console.error(`   ⚠️ event_date ${d.album_key}: ${dErr.message}`);
		else dated++;
	}
	console.log(`✅ ${teamRows.length} teams · ${aliasRows.length} aliases · ${linkRows.length} links · ${dated} event dates`);
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
