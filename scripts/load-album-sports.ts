#!/usr/bin/env node
/**
 * Load the operator-confirmed album→sport map into albums.sport (Slice 1 authority).
 *
 * Reads the confirmation sheet (default .temp/album-sport-sheet.json — review/edit the `proposed`
 * column in the .md first), validates every value against the canonical taxonomy, and sets
 * albums.sport + sport_source='operator' keyed by album_name. NON_SPORT → sport=NULL.
 *
 * Run AFTER the Slice 1 migration (albums table + trigger) is applied, and BEFORE the Slice 1
 * backfill migration (which forces photo_metadata.sport_type to mirror albums.sport).
 *
 *   npx tsx scripts/load-album-sports.ts [--sheet=.temp/album-sport-sheet.json] [--dry-run]
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { SPORTS } from '../src/lib/ai/taxonomy';

const SHEET = process.argv.find((a) => a.startsWith('--sheet='))?.split('=')[1] || '.temp/album-sport-sheet.json';
const DRY = process.argv.includes('--dry-run');
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** Map a sheet `proposed` value to a sport_enum value or null, or throw if unrecognized. */
function toSport(proposed: string): string | null {
	const v = (proposed || '').trim();
	if (/^NON_SPORT/i.test(v) || v === '' || v.toUpperCase() === 'NULL') return null;
	if ((SPORTS as readonly string[]).includes(v)) return v;
	throw new Error(`"${proposed}" is not a valid sport (allowed: ${SPORTS.join(', ')}, or NON_SPORT)`);
}

async function main() {
	const rows = JSON.parse(readFileSync(SHEET, 'utf-8')) as Array<{ album: string; proposed: string; status: string }>;
	console.log(`Loading ${rows.length} album→sport rulings from ${SHEET}${DRY ? ' (DRY RUN)' : ''}\n`);

	// Validate ALL before writing any (fail fast on a bad edit).
	const resolved = rows.map((r) => ({ album: r.album, sport: toSport(r.proposed), status: r.status }));

	let updated = 0, unmatched = 0, nonSport = 0;
	for (const r of resolved) {
		if (r.sport === null) nonSport++;
		if (DRY) { console.log(`  ${r.album} → ${r.sport ?? 'NULL (non-sport)'}`); updated++; continue; }
		const { data, error } = await sb
			.from('albums')
			.update({ sport: r.sport, sport_source: 'operator', updated_at: new Date().toISOString() })
			.eq('album_name', r.album)
			.select('album_key');
		if (error) { console.error(`  ❌ ${r.album}: ${error.message}`); continue; }
		if (!data || data.length === 0) { console.warn(`  ⚠️  no albums row matched name "${r.album}"`); unmatched++; continue; }
		updated += data.length;
	}

	console.log(`\n✅ ${DRY ? 'would update' : 'updated'} ${updated} album rows (${nonSport} non-sport → NULL)`);
	if (unmatched) console.log(`⚠️  ${unmatched} sheet rows matched no albums row — check name drift.`);
	if (!DRY) console.log('Next: apply 2026-06-08-vnext-slice1-backfill-sport.sql to mirror sport onto photo_metadata + validate.');
}

main().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
