#!/usr/bin/env node
/**
 * Backfill photo_jersey_sightings from the existing identity signals (Slice 2).
 * Shreds: (A) photo_metadata.players JSONB — two shapes (OLD agentic / NEW caption),
 *         (B) photo_metadata.jersey_number (singular int).
 * Writes ONLY photo_jersey_sightings (the pre-resolution staging). NEVER players/photo_players —
 * AI never creates a player; naming is human (admin tag approval → resolve_jersey_to_player).
 * Idempotent: UNIQUE(dedup_key) + upsert ignoreDuplicates. Safe to re-run.
 *
 *   npx tsx scripts/backfill-jersey-sightings.ts [--dry-run]
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';
import { normJersey, normColor, clamp01, teamSide, dedupKey, type Sighting } from '../src/lib/identity/sightings';

const DRY = process.argv.includes('--dry-run');
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/**
 * normJersey / normColor / clamp01 / teamSide / dedupKey / Sighting are the SHARED leaf helpers
 * (src/lib/identity/sightings.ts) — the same ones the live ingest uses, so dedup_key stays
 * byte-identical across both write paths. isOldShape is backfill-specific: it discriminates the
 * pre-rebuild agentic players[] shape from the caption shape (ingest only ever emits the latter).
 */
function isOldShape(p: any): boolean {
	return p && (('team' in p) || ('jersey_confidence' in p) || ('position_in_frame' in p) || ('is_primary_subject' in p));
}

async function fetchAll(): Promise<Array<{ photo_id: string; album_key: string | null; players: any; jersey_number: number | null }>> {
	const rows: any[] = [];
	const page = 1000;
	for (let from = 0; ; from += page) {
		const { data, error } = await sb
			.from('photo_metadata')
			.select('photo_id, album_key, players, jersey_number')
			.or('players.not.is.null,jersey_number.not.is.null')
			.order('photo_id', { ascending: true })
			.range(from, from + page - 1);
		if (error) { console.error('fetch error:', error.message); process.exit(1); }
		if (!data || data.length === 0) break;
		rows.push(...data);
		if (data.length < page) break;
	}
	return rows;
}

function shred(row: { photo_id: string; album_key: string | null; players: any; jersey_number: number | null }): Sighting[] {
	const out: Sighting[] = [];
	const players = Array.isArray(row.players) ? row.players : [];
	for (const p of players) {
		if (!p || typeof p !== 'object') continue;
		const base = { photo_id: row.photo_id, album_key: row.album_key };
		if (isOldShape(p)) {
			const s = { ...base, jersey_number: normJersey(p.jersey_number), team_side: teamSide(p.team), team_color: null,
				jersey_confidence: clamp01(p.jersey_confidence), action_text: (p.current_action || '').toString().trim() || null,
				position_in_frame: p.position_in_frame ?? null, is_primary_subject: typeof p.is_primary_subject === 'boolean' ? p.is_primary_subject : null,
				source: 'players_old' };
			out.push({ ...s, dedup_key: dedupKey(s) });
		} else {
			const s = { ...base, jersey_number: normJersey(p.jersey_number), team_side: null, team_color: normColor(p.team_color),
				jersey_confidence: null, action_text: (p.action || '').toString().trim() || null,
				position_in_frame: null, is_primary_subject: null, source: 'players_new' };
			out.push({ ...s, dedup_key: dedupKey(s) });
		}
	}
	const sj = normJersey(row.jersey_number);
	if (sj) {
		const s = { photo_id: row.photo_id, album_key: row.album_key, jersey_number: sj, team_side: null, team_color: null,
			jersey_confidence: null, action_text: null, position_in_frame: null, is_primary_subject: true, source: 'jersey_singular' };
		out.push({ ...s, dedup_key: dedupKey(s) });
	}
	return out;
}

async function main() {
	const rows = await fetchAll();
	const sightings = rows.flatMap(shred);
	const bySource = sightings.reduce((m: Record<string, number>, s) => ((m[s.source] = (m[s.source] || 0) + 1), m), {});
	console.log(`Source rows: ${rows.length} → ${sightings.length} sightings ${JSON.stringify(bySource)}${DRY ? ' (DRY RUN)' : ''}`);
	if (DRY) { console.log('sample:', JSON.stringify(sightings.slice(0, 3), null, 0)); return; }

	let inserted = 0;
	for (let i = 0; i < sightings.length; i += 500) {
		const batch = sightings.slice(i, i + 500);
		const { error, count } = await sb.from('photo_jersey_sightings').upsert(batch, { onConflict: 'dedup_key', ignoreDuplicates: true, count: 'exact' });
		if (error) { console.error('upsert error:', error.message); process.exit(1); }
		inserted += count ?? 0;
		process.stdout.write('.');
	}
	console.log(`\n✅ upserted ${inserted} sightings (idempotent; re-run safe)`);
}
main().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
