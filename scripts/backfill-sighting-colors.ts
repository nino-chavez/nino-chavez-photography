#!/usr/bin/env node
/**
 * Recover the full team_color for photo_jersey_sightings rows that were truncated to a bare
 * modifier by the pre-fix normColor() (src/lib/identity/sightings.ts) — "light blue" -> "light",
 * "dark green" -> "dark", "neon yellow" -> "neon". Live DB (2026-09-25): 2,471 of 49,673 rows
 * carry team_color IN ('light', 'dark', 'neon') — exactly this corruption's fingerprint.
 *
 * Recovery source: photo_metadata.players (JSONB), which still holds the model's FULL color
 * string for albums ingested before the north-star cutover (extraction_version IS NULL). A
 * new-style ingest never populates that column (players = []), so a sighting from a new-style
 * photo has no recoverable source at all — it needs re-extraction, not a backfill.
 *
 * Per corrupted sighting: find photo_metadata.players[] entries (new caption shape only — the
 * old agentic shape never contributed team_color to sightings, see backfill-jersey-sightings.ts's
 * isOldShape) for the SAME photo whose OLD (pre-fix) normColor equals the corrupted value, and
 * — when the sighting carries a jersey_number — whose jersey matches too. If every matching
 * player[] entry recovers to the SAME full color (via normColor's NEW behavior), the sighting is
 * RECOVERABLE. If none match, UNRECOVERABLE (needs re-extraction). If matches disagree on the
 * recovered color, AMBIGUOUS.
 *
 * team_color is part of dedup_key (src/lib/identity/sightings.ts), so recovering it changes the
 * dedup_key this sighting would have. A recovered key that already belongs to a DIFFERENT
 * sighting on the same photo (an existing correctly-extracted sibling, or another corrupted
 * sighting recovering to the same value in this same run) is a COLLISION — reported, never
 * silently resolved, and never applied.
 *
 * DRY-RUN ONLY in this session: this script is read-only when invoked, and the --apply path
 * (guarded, off by default) is left for the orchestrator to run after reviewing the report.
 *
 * Usage:
 *   npx tsx scripts/backfill-sighting-colors.ts --dry-run [> .temp/backfill-sighting-colors.dry-run.txt]
 *   npx tsx scripts/backfill-sighting-colors.ts --apply   # NOT run from this session — see report
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { normColor, normJersey, dedupKey, type Sighting } from '../src/lib/identity/sightings';

const DRY = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');

const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** The exact corruption fingerprint: a modifier with no color, produced only by the old
 * first-word-only normColor(). Matches the live-DB count reported for this work item (2,471). */
const LONE_MODIFIERS = ['light', 'dark', 'neon'] as const;

/** Reproduces the OLD (pre-fix) normColor() behavior, to identify which players[] entry a
 * corrupted sighting's team_color actually came from. Intentionally NOT imported — it must stay
 * frozen to the bug's exact shape even after sightings.ts's normColor changes. */
function oldNormColor(c: unknown): string | null {
	if (typeof c !== 'string') return null;
	const s = c.trim().toLowerCase().split(' ')[0];
	return s || null;
}

/** Same discriminator as backfill-jersey-sightings.ts: the pre-rebuild agentic players[] shape
 * never contributed team_color to sightings, so it can never be the source of this corruption. */
export function isOldShape(p: unknown): boolean {
	return !!p && typeof p === 'object' && (('team' in p) || ('jersey_confidence' in p) || ('position_in_frame' in p) || ('is_primary_subject' in p));
}

export interface CorruptedSighting {
	sighting_id: string;
	photo_id: string;
	album_key: string | null;
	jersey_number: string | null;
	team_side: string | null;
	team_color: string;
	position_in_frame: string | null;
	source: string;
	dedup_key: string;
}

export interface PlayerEntry {
	jersey_number?: unknown;
	team_color?: unknown;
	action?: unknown;
}

export type ColorRecoveryCategory = 'recoverable' | 'ambiguous' | 'unrecoverable';

export interface ColorRecoveryResult {
	category: ColorRecoveryCategory;
	color?: string;
	reason: string;
}

/**
 * Pure classification: given a corrupted sighting's stored (bare-modifier) color, its
 * jersey_number, and the SAME photo's new-caption-shape players[] entries, decide whether the
 * full color is recoverable. Exported + unit-tested (scripts/backfill-sighting-colors.test.ts)
 * because this is the part that was silently wrong once already:
 *
 *   - A player entry's own team_color can itself be a bare modifier ("dark") with nothing more
 *     specific to recover — that is NOT a recovery (it changes nothing), so it must not count as
 *     `recoverable`. Without this, "dark" -> "dark" was reported as a fixed row.
 *   - A sighting with jersey_number === null can only have come from a player entry whose OWN
 *     jersey_number is also null (see shredCaptionPlayers) — matching it against every
 *     same-color player in the frame regardless of THEIR jersey inflated `ambiguous` with
 *     jersey-carrying players that were never this sighting's source.
 */
export function classifyColorRecovery(
	oldColor: string,
	jerseyNumber: string | null,
	players: PlayerEntry[]
): ColorRecoveryResult {
	if (players.length === 0) {
		return { category: 'unrecoverable', reason: 'no photo_metadata.players[] for this photo (new-style ingest, or already dropped) — needs re-extraction' };
	}
	const candidates = players.filter((p) => {
		if (oldNormColor(p.team_color) !== oldColor) return false;
		const playerJersey = normJersey(p.jersey_number);
		return jerseyNumber != null ? playerJersey === jerseyNumber : playerJersey === null;
	});
	const recoveredColors = new Set(candidates.map((p) => normColor(p.team_color)).filter((c): c is string => !!c));
	const usableColors = new Set([...recoveredColors].filter((c) => !(LONE_MODIFIERS as readonly string[]).includes(c)));
	if (usableColors.size === 0) {
		return recoveredColors.size > 0
			? { category: 'unrecoverable', reason: `only matching players[] entr${recoveredColors.size > 1 ? 'ies' : 'y'} are themselves a bare modifier (${[...recoveredColors].join(', ')}) — no real color to recover, needs re-extraction` }
			: { category: 'unrecoverable', reason: `players[] present but no entry matches jersey_number=${jerseyNumber ?? 'null'} + old-color="${oldColor}"` };
	}
	if (usableColors.size > 1) {
		return { category: 'ambiguous', reason: `multiple distinct recovered colors: ${[...usableColors].join(', ')}` };
	}
	const color = [...usableColors][0];
	return { category: 'recoverable', color, reason: `"${oldColor}" -> "${color}"` };
}

async function fetchAllPaged<T>(build: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>): Promise<T[]> {
	const out: T[] = [];
	const page = 1000;
	for (let from = 0; ; from += page) {
		const { data, error } = await build(from, from + page - 1);
		if (error) throw new Error(JSON.stringify(error));
		if (!data || data.length === 0) break;
		out.push(...data);
		if (data.length < page) break;
	}
	return out;
}

async function inChunks<T, R>(items: T[], size: number, run: (chunk: T[]) => Promise<R[]>): Promise<R[]> {
	const out: R[] = [];
	for (let i = 0; i < items.length; i += size) {
		out.push(...(await run(items.slice(i, i + size))));
	}
	return out;
}

type Category = 'recoverable' | 'ambiguous' | 'unrecoverable' | 'collision';

interface Decision {
	sighting: CorruptedSighting;
	category: Category;
	reason: string;
	newColor?: string;
	newDedupKey?: string;
}

async function main() {
	console.log('Backfill sighting colors — recovering lone-modifier team_color from photo_metadata.players\n');

	// 1. All corrupted sightings.
	const corrupted = await fetchAllPaged<CorruptedSighting>((from, to) =>
		sb
			.from('photo_jersey_sightings')
			.select('sighting_id, photo_id, album_key, jersey_number, team_side, team_color, position_in_frame, source, dedup_key')
			.in('team_color', LONE_MODIFIERS as unknown as string[])
			.order('sighting_id', { ascending: true })
			.range(from, to)
	);
	console.log(`Corrupted sightings (team_color IN ${JSON.stringify(LONE_MODIFIERS)}): ${corrupted.length}`);
	if (corrupted.length === 0) { console.log('Nothing to do.'); return; }

	const photoIds = [...new Set(corrupted.map((s) => s.photo_id))];
	console.log(`Distinct affected photos: ${photoIds.length}`);

	// 2. Recovery source: photo_metadata.players + album_key, for those photos.
	const photoRows = await inChunks(photoIds, 300, async (chunk) => {
		const { data, error } = await sb
			.from('photo_metadata')
			.select('photo_id, album_key, players, extraction_version')
			.in('photo_id', chunk);
		if (error) throw new Error(JSON.stringify(error));
		return data ?? [];
	});
	const playersByPhoto = new Map<string, PlayerEntry[]>();
	const albumByPhoto = new Map<string, string | null>();
	for (const r of photoRows as Array<{ photo_id: string; album_key: string | null; players: unknown }>) {
		albumByPhoto.set(r.photo_id, r.album_key);
		const arr = Array.isArray(r.players) ? (r.players as unknown[]) : [];
		playersByPhoto.set(
			r.photo_id,
			arr.filter((p): p is PlayerEntry => !!p && typeof p === 'object' && !isOldShape(p))
		);
	}

	// 3. Every OTHER (non-corrupted) sighting's dedup_key for those photos, to detect collisions
	// against siblings that already exist and don't need fixing.
	const corruptedIds = new Set(corrupted.map((s) => s.sighting_id));
	const allSightingsForPhotos = await inChunks(photoIds, 300, async (chunk) => {
		const { data, error } = await sb
			.from('photo_jersey_sightings')
			.select('sighting_id, photo_id, dedup_key')
			.in('photo_id', chunk);
		if (error) throw new Error(JSON.stringify(error));
		return data ?? [];
	});
	const siblingKeysByPhoto = new Map<string, Set<string>>();
	for (const r of allSightingsForPhotos as Array<{ sighting_id: string; photo_id: string; dedup_key: string }>) {
		if (corruptedIds.has(r.sighting_id)) continue; // being replaced, not a sibling to collide with
		if (!siblingKeysByPhoto.has(r.photo_id)) siblingKeysByPhoto.set(r.photo_id, new Set());
		siblingKeysByPhoto.get(r.photo_id)!.add(r.dedup_key);
	}

	// 4. Decide each corrupted sighting's fate.
	const assignedKeysByPhoto = new Map<string, Set<string>>(); // intra-run collision guard
	const decisions: Decision[] = [];
	for (const s of corrupted) {
		const players = playersByPhoto.get(s.photo_id) ?? [];
		const result = classifyColorRecovery(s.team_color, s.jersey_number, players);
		if (result.category !== 'recoverable') {
			decisions.push({ sighting: s, category: result.category, reason: result.reason });
			continue;
		}
		const newColor = result.color!;
		const base: Omit<Sighting, 'dedup_key'> = {
			photo_id: s.photo_id,
			album_key: s.album_key,
			jersey_number: s.jersey_number,
			team_side: s.team_side,
			team_color: newColor,
			jersey_confidence: null,
			action_text: null,
			position_in_frame: s.position_in_frame,
			is_primary_subject: null,
			source: s.source
		};
		const newDedupKey = dedupKey(base);
		const siblingKeys = siblingKeysByPhoto.get(s.photo_id) ?? new Set<string>();
		const assignedKeys = assignedKeysByPhoto.get(s.photo_id) ?? new Set<string>();
		if (siblingKeys.has(newDedupKey) || assignedKeys.has(newDedupKey)) {
			decisions.push({ sighting: s, category: 'collision', reason: `recovered "${newColor}" would produce dedup_key already used by another sighting on this photo`, newColor, newDedupKey });
			continue;
		}
		assignedKeys.add(newDedupKey);
		assignedKeysByPhoto.set(s.photo_id, assignedKeys);
		decisions.push({ sighting: s, category: 'recoverable', reason: result.reason, newColor, newDedupKey });
	}

	// 5. Report, grouped per album (per the work item's ask).
	const byAlbum = new Map<string, Record<Category, number>>();
	const zero = (): Record<Category, number> => ({ recoverable: 0, ambiguous: 0, unrecoverable: 0, collision: 0 });
	for (const d of decisions) {
		const album = albumByPhoto.get(d.sighting.photo_id) ?? d.sighting.album_key ?? '(unknown album)';
		if (!byAlbum.has(album)) byAlbum.set(album, zero());
		byAlbum.get(album)![d.category]++;
	}

	const lines: string[] = [];
	lines.push(`Backfill sighting colors — dry-run report (${new Date().toISOString()})`);
	lines.push(`Corrupted sightings scanned: ${corrupted.length} across ${photoIds.length} photos, ${byAlbum.size} albums\n`);

	const totals = zero();
	for (const d of decisions) totals[d.category]++;
	lines.push(`TOTALS: recoverable=${totals.recoverable}  ambiguous=${totals.ambiguous}  unrecoverable=${totals.unrecoverable}  collision=${totals.collision}\n`);

	lines.push('Per album:');
	for (const [album, counts] of [...byAlbum.entries()].sort((a, b) => (b[1].recoverable + b[1].ambiguous + b[1].unrecoverable + b[1].collision) - (a[1].recoverable + a[1].ambiguous + a[1].unrecoverable + a[1].collision))) {
		lines.push(`  ${album}: recoverable=${counts.recoverable} ambiguous=${counts.ambiguous} unrecoverable=${counts.unrecoverable} collision=${counts.collision}`);
	}

	lines.push('\nSample decisions (first 5 per category):');
	for (const cat of ['recoverable', 'ambiguous', 'unrecoverable', 'collision'] as Category[]) {
		const sample = decisions.filter((d) => d.category === cat).slice(0, 5);
		if (sample.length === 0) continue;
		lines.push(`  ${cat}:`);
		for (const d of sample) {
			lines.push(`    - ${d.sighting.photo_id} (sighting_id=${d.sighting.sighting_id}, jersey=${d.sighting.jersey_number ?? 'null'}): ${d.reason}`);
		}
	}

	const report = lines.join('\n');
	console.log('\n' + report + '\n');

	if (DRY) {
		console.log('(--dry-run: no writes. Redirect stdout to .temp/backfill-sighting-colors.dry-run.txt to save this report.)');
		return;
	}

	// --apply: write only 'recoverable' decisions, in batches, updating team_color + dedup_key.
	const toApply = decisions.filter((d) => d.category === 'recoverable');
	console.log(`Applying ${toApply.length} recoverable update(s)...`);
	let applied = 0;
	for (const d of toApply) {
		const { error } = await sb
			.from('photo_jersey_sightings')
			.update({ team_color: d.newColor, dedup_key: d.newDedupKey })
			.eq('sighting_id', d.sighting.sighting_id);
		if (error) { console.error(`   ❌ ${d.sighting.sighting_id}: ${error.message}`); continue; }
		applied++;
	}
	console.log(`Applied ${applied}/${toApply.length}.`);
}

// ---------------------------------------------------------------------------
// CLI wrapper — only runs when this file is executed directly, not imported
// (scripts/backfill-sighting-colors.test.ts imports classifyColorRecovery etc.
// and must not trigger a live DB call or a `process.exit`).
// ---------------------------------------------------------------------------
const isMain = (() => {
	try {
		return import.meta.url === `file://${resolve(process.argv[1] ?? '')}`;
	} catch {
		return false;
	}
})();

if (isMain) {
	if (!DRY && !APPLY) {
		console.error('Pass --dry-run (report only) or --apply (write recoverable, non-colliding rows).');
		process.exit(1);
	}
	main().catch((e) => { console.error('Fatal:', e instanceof Error ? e.message : e); process.exit(1); });
}
