/**
 * Database Type Definitions
 *
 * Strongly-typed interfaces for Supabase database rows.
 * These types represent the raw data structure returned from Supabase queries.
 */

/**
 * Photo metadata row from photo_metadata table
 * Represents the complete database schema for photo records
 */
/**
 * Per-player extraction stored in `photo_metadata.players` (JSONB).
 * Phase 1 (caption pipeline) shape: { jersey_number, team_color, action }.
 * Legacy agentic rows used: { jersey_number, team, current_action, position_in_frame }.
 * Both shapes are accepted on read.
 */
export interface PhotoPlayerJson {
	jersey_number?: number | null;
	team_color?: string | null;
	action?: string | null;
	// legacy agentic keys (pre-Phase-1)
	team?: string | null;
	current_action?: string | null;
	position_in_frame?: string | null;
}

/** Team color identification stored in `photo_metadata.team_colors` (JSONB). */
export interface PhotoTeamColorsJson {
	home_colors?: string[];
	away_colors?: string[];
	home_name?: string | null;
	away_name?: string | null;
}

export interface PhotoMetadataRow {
	// Identifiers
	photo_id: string;
	image_key: string;

	// Image URLs (Cloudflare + legacy SmugMug-era columns)
	cf_image_id: string | null;
	ImageUrl: string | null;
	OriginalUrl: string | null;
	ThumbnailUrl: string | null;
	ArchivedUrl: string | null;

	// Core classification (Bucket 1)
	sport_type: string;
	photo_category: string;
	action_type: string | null;
	play_type: string | null;
	action_intensity: string | null;
	composition: string | null;
	time_of_day: string | null;
	lighting: string | null;
	color_temperature: string | null;

	// People / identity
	jersey_number: number | null;
	athlete_id: string | null;
	players: PhotoPlayerJson[] | null;
	team_colors: PhotoTeamColorsJson | null;
	player_count: number | null;

	// Caption + semantic search (Phase 1 — vision-extraction v-next)
	caption: string | null;
	// 768-dim vector. Phase 1: caption-derived (OpenRouter text-embedding-3-large).
	// Pre-Phase-1 rows hold enum-string-derived vectors until backfilled.
	embedding: number[] | null;

	// Quality scores (Bucket 2)
	sharpness: number | null;
	composition_score: number | null;
	exposure_accuracy: number | null;
	emotional_impact: number | null;
	// Generated column: weighted blend (sharpness .35 / composition .30 / emotional .25 / exposure .10).
	quality_score: number | null;
	emotion: string | null;

	// Scene / game context
	ball_position: string | null;
	venue_type: string | null;
	crowd_density: string | null;
	key_moment: string | null;
	time_in_game: string | null;
	event_id: string | null;

	// Camera / EXIF
	file_name: string | null;
	width: number | null;
	height: number | null;
	aspect_ratio: number | null; // numeric in DB
	camera_make: string | null;
	camera_model: string | null;
	lens_model: string | null;
	focal_length: string | null;
	aperture: string | null;
	shutter_speed: string | null;
	iso: number | null;
	latitude: number | null;
	longitude: number | null;
	location_name: string | null;

	// Album associations
	album_key: string | null;
	album_name: string | null;

	// AI metadata
	ai_provider: string | null;
	ai_cost: number | null;
	/**
	 * @deprecated Dead field (Phase 1 audit): fetched + mapped onto every Photo but
	 * no consumer ever filtered/sorted/displayed it. Removed from PHOTO_COLUMNS so it
	 * is no longer fetched. Column retained in DB (no destructive drop in Phase 1).
	 */
	ai_confidence: number | null;

	// Timestamps
	enriched_at: string | null;
	photo_date: string | null;
	upload_date: string;
	date_added: string | null;
}

/**
 * Album row structure
 * Minimal representation for album queries
 */
export interface AlbumRow {
	album_key: string;
	album_name: string;
	photo_id: string;
	image_key: string;
	ImageUrl: string;
	ThumbnailUrl: string | null;
	cf_image_id: string | null;
	sport_type: string;
	photo_category: string;
	upload_date: string;
}

/**
 * Collection row structure
 * For collection queries with cover photo
 */
export interface CollectionRow {
	collection_slug: string;
	photo_id: string;
	image_key: string;
	ImageUrl: string;
	ThumbnailUrl: string | null;
	cf_image_id: string | null;
	sport_type: string;
	photo_category: string;
	upload_date: string;
}

/**
 * Sport distribution row
 * Result from aggregation queries
 */
export interface SportDistributionRow {
	name: string;
	count: number;
	percentage: number;
}

/**
 * Category distribution row
 * Result from aggregation queries
 */
export interface CategoryDistributionRow {
	name: string;
	count: number;
	percentage: number;
}

/**
 * Cover photo structure
 * Lightweight photo data for cover images
 */
export interface CoverPhotoRow {
	photo_id: string;
	image_key: string;
	ImageUrl: string;
	ThumbnailUrl: string | null;
	cf_image_id: string | null;
}

/**
 * Related photo row
 * Minimal data for related photo suggestions
 */
export interface RelatedPhotoRow {
	photo_id: string;
	image_key: string;
	ImageUrl: string;
	ThumbnailUrl: string | null;
	cf_image_id: string | null;
	sport_type: string;
	photo_category: string;
	emotion: string | null;
}

/**
 * Album settings row from album_settings table
 * Controls visibility and share tokens for unlisted albums
 */
export interface AlbumSettingsRow {
	album_key: string;
	visibility: 'public' | 'unlisted';
	share_token: string;
	gallery_scope: string | null;
	created_at: string;
	updated_at: string;
}

/**
 * Album with metadata structure
 * Complete album information with photo count and sport distribution
 */
export interface AlbumWithMetadata {
	albumKey: string;
	albumName: string;
	photoCount: number;
	primarySport?: string;
	primaryCategory?: string;
	firstPhotoDate?: string;
	lastPhotoDate?: string;
	coverPhoto?: CoverPhotoRow;
}
