/**
 * Shared column constants for Supabase queries.
 *
 * Reuse these everywhere instead of select('*') to avoid fetching
 * the embedding vector (~6KB/row) and other unused heavy columns.
 */

/**
 * DATA-ACCESS SEAM — the single knob for the schema cutover.
 *
 * Every READ query goes through `PHOTOS_READ`; never hard-code 'photo_metadata' in a read
 * again. This collapses the ~70 scattered, stringly-typed table references to one place:
 *   - today           → the base table 'photo_metadata'
 *   - convergence C1   → flip to the 'photos_read' view (sport from albums; no per-photo sport_type)
 *   - final cutover    → flip to the renamed 'photos' query path
 * A column drop or table rename becomes a one-line change here instead of 70-site runtime roulette.
 *
 * Writes (sync / backfill / upload) target `PHOTOS_WRITE` (the base table), NOT the read view.
 */
export const PHOTOS_READ = 'photo_metadata';
export const PHOTOS_WRITE = 'photo_metadata';

/**
 * Standard columns for photo listings (excludes embedding, width, height).
 * `ai_confidence` + agentic-extra columns (ball_position/venue_type/crowd_density/key_moment)
 * were dropped entirely (convergence H1) — dead fields, no consumer.
 * The 6 vanity CATEGORICAL aesthetic columns (composition, time_of_day, lighting,
 * color_temperature, emotion, action_intensity) were removed from the read path (cutover prep)
 * ahead of their schema DROP. The numeric quality sub-scores (sharpness, composition_score,
 * exposure_accuracy, emotional_impact) are DIFFERENT columns and stay — they feed quality_score.
 * `caption` added Phase 1 — small text, used by search-result display + semantic search.
 */
export const PHOTO_COLUMNS = 'photo_id, image_key, cf_image_id, album_key, album_name, sport_type, photo_category, play_type, sharpness, composition_score, exposure_accuracy, emotional_impact, quality_score, caption, time_in_game, athlete_id, jersey_number, event_id, ai_provider, ai_cost, aspect_ratio, photo_date, upload_date, enriched_at';

/** Extended columns for photo detail pages (includes width, height for EXIF/schema markup). */
export const PHOTO_DETAIL_COLUMNS = `${PHOTO_COLUMNS}, width, height`;

/** Helper to build a select string with extra columns appended. */
export function photoSelect(extra?: string): string {
	return extra ? `${PHOTO_COLUMNS}, ${extra}` : PHOTO_COLUMNS;
}
