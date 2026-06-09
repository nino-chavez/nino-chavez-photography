#!/usr/bin/env node
/**
 * Load the operator-confirmed album→sport map into albums.sport / albums.category (Slice 1).
 *
 * Reads database/seed/album-sports.json — the durable, committed ground truth built from the
 * operator's sheet rulings (sport is a valid taxonomy value or null; category is the non-sport
 * classification: portrait/street/pets/drama/flag_football). Sets albums.sport, albums.category,
 * albums.sport_source keyed by album_name.
 *
 * Run AFTER the Slice 1 migration (albums + trigger) and BEFORE the backfill migration.
 *   npx tsx scripts/load-album-sports.ts [--seed=database/seed/album-sports.json] [--dry-run]
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { SPORTS } from '../src/lib/ai/taxonomy';

const SEED = process.argv.find((a) => a.startsWith('--seed='))?.split('=')[1] || 'database/seed/album-sports.json';
const DRY = process.argv.includes('--dry-run');
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

interface Row { album_name: string; sport: string | null; category: string | null; source: string; }

async function main() {
	const rows = JSON.parse(readFileSync(SEED, 'utf-8')) as Row[];

	// Validate every sport before writing (fail fast on a bad seed).
	for (const r of rows) {
		if (r.sport !== null && !(SPORTS as readonly string[]).includes(r.sport)) {
			throw new Error(`"${r.album_name}": sport "${r.sport}" is not in the taxonomy`);
		}
	}
	console.log(`Loading ${rows.length} album rulings from ${SEED}${DRY ? ' (DRY RUN)' : ''}\n`);

	let updated = 0, unmatched = 0;
	const nonSport = rows.filter((r) => r.sport === null).length;
	for (const r of rows) {
		if (DRY) { updated++; continue; }
		const { data, error } = await sb
			.from('albums')
			.update({
				sport: r.sport,
				category: r.category,
				sport_source: r.source === 'operator' ? 'operator' : 'detection-unanimous',
				updated_at: new Date().toISOString(),
			})
			.eq('album_name', r.album_name)
			.select('album_key');
		if (error) { console.error(`  ❌ ${r.album_name}: ${error.message}`); continue; }
		if (!data || data.length === 0) { console.warn(`  ⚠️  no albums row matched "${r.album_name}"`); unmatched++; continue; }
		updated += data.length;
	}

	console.log(`✅ ${DRY ? 'would update' : 'updated'} ${updated} album rows (${nonSport} non-sport → sport NULL)`);
	if (unmatched) console.log(`⚠️  ${unmatched} seed rows matched no albums row — investigate name drift before the backfill.`);
	if (!DRY) console.log('Next: apply 2026-06-08-vnext-slice1-backfill-sport.sql (mirror sport onto photo_metadata + validate).');
}

main().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
