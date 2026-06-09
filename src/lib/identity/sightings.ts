/**
 * Jersey-sighting normalization + shred — the SINGLE source of truth for turning a
 * photo's extracted `players[]` into `photo_jersey_sightings` rows.
 *
 * Used by BOTH the live ingest (`scripts/ingest-album.ts`, new-album path) and the
 * one-shot backfill (`scripts/backfill-jersey-sightings.ts`, existing-data shred).
 * Keeping the helpers here prevents the leaf-level drift that would silently change
 * `dedup_key` and re-insert "duplicate" sightings.
 *
 * IDENTITY MODEL: a sighting is a pre-resolution staging signal. The AI NEVER creates a
 * player — naming is human (admin tag approval → resolve_jersey_to_player). This module
 * only ever writes `photo_jersey_sightings`, never `players` / `photo_players`.
 *
 * dedup_key STABILITY: the field order below is load-bearing — the existing backfilled
 * sightings were keyed with exactly this order. Do not reorder or the upsert stops
 * deduping and re-inserts everything.
 */

/** A jersey is 1-3 digits with an optional trailing letter; leading zeros are significant ("00" != "0"). */
export const JERSEY_RE = /^[0-9]{1,3}[A-Z]?$/;

/** Normalize a jersey value to its canonical TEXT form (preserves "00"), or null if not a jersey. */
export function normJersey(v: unknown): string | null {
	if (v === null || v === undefined) return null;
	const s = String(v).trim().toUpperCase();
	return JERSEY_RE.test(s) ? s : null;
}

/** First color word, lowercased (e.g. "Navy Blue" -> "navy"), or null. */
export function normColor(c: unknown): string | null {
	if (typeof c !== 'string') return null;
	const s = c.trim().toLowerCase().split(' ')[0];
	return s || null;
}

export const clamp01 = (n: unknown): number | null =>
	typeof n === 'number' && n >= 0 && n <= 1 ? n : null;

export const teamSide = (t: unknown): string | null => (t === 'home' || t === 'away' ? t : null);

export interface Sighting {
	photo_id: string;
	album_key: string | null;
	jersey_number: string | null;
	team_side: string | null;
	team_color: string | null;
	jersey_confidence: number | null;
	action_text: string | null;
	position_in_frame: string | null;
	is_primary_subject: boolean | null;
	source: string;
	dedup_key: string;
}

/** Deterministic idempotency key. ORDER IS LOAD-BEARING — see file header. */
export function dedupKey(s: Omit<Sighting, 'dedup_key'>): string {
	return [
		s.source,
		s.photo_id,
		s.jersey_number ?? '',
		s.team_side ?? '',
		s.team_color ?? '',
		s.position_in_frame ?? '',
	].join('|');
}

/** The "new caption shape" player object emitted by the ingest/caption prompt. */
export interface CaptionPlayer {
	jersey_number?: unknown;
	team_color?: unknown;
	action?: unknown;
}

/**
 * Shred a photo's extracted `players[]` (new caption shape) into sightings. A player with no
 * usable jersey AND no usable color contributes no signal, so it's dropped. `source` defaults
 * to 'players_new' to match the backfill (identical dedup_keys → re-runs stay idempotent across
 * both paths); the ingest passes 'ingest' for clear provenance on freshly-processed albums.
 */
export function shredCaptionPlayers(
	photoId: string,
	albumKey: string | null,
	players: unknown,
	source = 'players_new'
): Sighting[] {
	if (!Array.isArray(players)) return [];
	const out: Sighting[] = [];
	for (const p of players as CaptionPlayer[]) {
		if (!p || typeof p !== 'object') continue;
		const jersey = normJersey(p.jersey_number);
		const color = normColor(p.team_color);
		if (!jersey && !color) continue; // no identity signal
		const base = {
			photo_id: photoId,
			album_key: albumKey,
			jersey_number: jersey,
			team_side: null,
			team_color: color,
			jersey_confidence: null,
			action_text: (typeof p.action === 'string' && p.action.trim()) || null,
			position_in_frame: null,
			is_primary_subject: null,
			source,
		};
		out.push({ ...base, dedup_key: dedupKey(base) });
	}
	return out;
}
