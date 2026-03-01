/**
 * Shared column constants for Supabase queries.
 *
 * Reuse these everywhere instead of select('*') to avoid fetching
 * the embedding vector (~6KB/row) and other unused heavy columns.
 */

/** Standard columns for photo listings (excludes embedding, width, height). */
export const PHOTO_COLUMNS = 'photo_id, image_key, cf_image_id, album_key, album_name, sport_type, photo_category, play_type, composition, time_of_day, lighting, color_temperature, emotion, action_intensity, sharpness, composition_score, exposure_accuracy, emotional_impact, time_in_game, athlete_id, jersey_number, event_id, ai_provider, ai_cost, ai_confidence, aspect_ratio, photo_date, upload_date, enriched_at';

/** Extended columns for photo detail pages (includes width, height for EXIF/schema markup). */
export const PHOTO_DETAIL_COLUMNS = `${PHOTO_COLUMNS}, width, height`;

/** Helper to build a select string with extra columns appended. */
export function photoSelect(extra?: string): string {
	return extra ? `${PHOTO_COLUMNS}, ${extra}` : PHOTO_COLUMNS;
}
