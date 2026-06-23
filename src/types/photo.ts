/**
 * Photo Types - Living Archive v3 (SvelteKit)
 *
 * Core type definitions for AI-enriched photo metadata
 * Migrated from v2 Next.js implementation
 */

// =============================================================================
// BUCKET 1: Concrete & Filterable (USER-FACING)
// These types are exposed as search filters
// =============================================================================

export type PlayType =
  | 'attack'
  | 'block'
  | 'dig'
  | 'set'
  | 'serve'
  | 'celebration'
  | 'transition'
  | null;

// =============================================================================
// REMOVED: vanity CATEGORICAL aesthetic types (cutover prep)
// ActionIntensity, CompositionType, TimeOfDay, LightingType, ColorTemperature,
// EmotionType — the underlying columns are being DROPPED at the schema cutover.
// The numeric quality sub-scores (sharpness/composition_score/exposure_accuracy/
// emotional_impact) are DIFFERENT columns and remain below.
// =============================================================================

export type TimeInGame =
  | 'first_5_min'
  | 'middle'
  | 'final_5_min'
  | 'overtime'
  | 'unknown';

// =============================================================================
// AI Provider
// =============================================================================

export type AIProvider = 'gemini' | 'claude' | 'openai';

/**
 * AI-enriched photo metadata (Two-Bucket Model)
 *
 * BUCKET 1: Concrete & Filterable (user-facing search filters)
 * BUCKET 2: Abstract & Internal (AI story detection only)
 */
export interface PhotoMetadata {
  // ==========================================================================
  // BUCKET 1: Concrete & Filterable (USER-FACING)
  // ==========================================================================

  /** Source album — carried so /photo/[id] links can disambiguate a non-unique image_key. */
  album_key?: string;

  // Action dimension
  play_type: PlayType;
  sport_type: string;        // volleyball, basketball, soccer
  photo_category: string;    // action, celebration, candid, portrait

  // ==========================================================================
  // BUCKET 2: Abstract & Internal (AI-ONLY, NOT USER-FACING)
  // ==========================================================================

  // Quality metrics (internal scoring)
  sharpness: number;              // 0-10
  composition_score: number;      // 0-10
  exposure_accuracy: number;      // 0-10
  emotional_impact: number;       // 0-10

  // Story detection context (internal)
  time_in_game?: TimeInGame;      // NEW: For game-winning rally detection
  jersey_number?: number;         // NEW: Player jersey number

  // ==========================================================================
  // AI Metadata
  // ==========================================================================

  ai_provider: AIProvider;
  ai_cost: number;
  enriched_at: string;
}

/**
 * Photo with enriched metadata and EXIF data
 */
export interface Photo {
  id: string;
  image_key: string;
  cf_image_id?: string; // Cloudflare Images ID (uses imagedelivery.net)
  image_url: string;
  thumbnail_url?: string; // Thumbnail URL for blur placeholders
  original_url?: string; // Full-resolution URL
  title: string;
  caption: string;
  keywords: string[];
  created_at: string; // Actual photo date (photo_date from DB, prioritized for sorting)
  metadata: PhotoMetadata;

  // EXIF and image metadata
  exif?: {
    // Dates (for frontend flexibility)
    photo_date?: string;      // Actual capture date from EXIF
    upload_date?: string;      // Upload date
    date_added?: string;       // When added to album

    // Image dimensions
    width?: number;
    height?: number;
    file_name?: string;
    aspect_ratio?: number;     // Width/height ratio for responsive layout

    // Album context
    album_key?: string;
    album_name?: string;

    // Geolocation (for future map features)
    latitude?: number;
    longitude?: number;
    location_name?: string;

    // EXIF camera data (for photography enthusiasts)
    camera_make?: string;
    camera_model?: string;
    lens_model?: string;
    focal_length?: string;
    aperture?: string;
    shutter_speed?: string;
    iso?: number;
  };
}

/**
 * Video from Cloudflare Stream
 */
export interface Video {
	id: string;
	cf_stream_id: string;
	cf_stream_thumbnail: string | null;
	album_key: string;
	album_name: string;
	title: string | null;
	description: string | null;
	duration_seconds: number | null;
	sport_type: string;
	video_category: string;
	video_date: string | null;
}

/**
 * Filter state for photo browsing (CONCRETE FILTERS ONLY)
 *
 * Only Bucket 1 (user-facing) fields are exposed as filters.
 * The vanity CATEGORICAL aesthetic filters (compositions, timeOfDay, lighting,
 * colorTemperature, emotion, actionIntensity) were removed (cutover prep) — their
 * backing columns are being DROPPED at the schema cutover.
 */
export interface PhotoFilterState {
  // ==========================================================================
  // Action Filters (Concrete)
  // ==========================================================================
  playTypes?: PlayType[];
  sportType?: string;
  photoCategory?: string;

  // ==========================================================================
  // Context Filters
  // ==========================================================================
  albumKey?: string;
  /** Restrict to a set of album_keys (e.g. all albums of a given division/level facet). */
  albumKeys?: string[];
  jerseyNumber?: number;

  // ==========================================================================
  // REMOVED: Obsolete/Internal Filters
  // ==========================================================================
  // ❌ portfolioWorthy (assumes quality varies)
  // ❌ printReady (subjective, not extractable)
  // ❌ socialMediaOptimized (subjective, not extractable)
  // ❌ minQualityScore / maxQualityScore (futile filter)
  // ❌ compositions / timeOfDay / lighting / colorTemperature / emotion /
  //    actionIntensity (vanity categorical — columns dropped at cutover)
}

/**
 * Sort modes for photo grid (CONCRETE ONLY)
 */
export type PhotoSortMode =
  | 'chronological' // Sort by created_at (default)
  | 'play-type';    // Sort by play type

/**
 * Photo grid view mode
 */
export type PhotoGridMode =
  | 'standard'      // Equal visual weight (default)
  | 'play-grouped'; // Grouped by play type

// =============================================================================
// REMOVED: Obsolete sort/view modes
// =============================================================================
// ❌ 'quality' sort (assumes quality varies)
// ❌ 'emotion' sort (abstract, not user-facing)
// ❌ 'intensity' sort (vanity action_intensity — column dropped at cutover)
// ❌ 'quality-stratified' view (assumes quality varies)
// ❌ 'emotion-grouped' / 'time-grouped' view (vanity categorical — dropped at cutover)

/**
 * Narrative arc type for AI story curation
 */
export type NarrativeArcType =
  | 'game-winning-rally'
  | 'player-highlight-reel'
  | 'season-journey'
  | 'comeback-story'
  | 'technical-excellence'
  | 'emotion-spectrum';

/**
 * AI-generated narrative arc
 */
export interface NarrativeArc {
  type: NarrativeArcType;
  title: string;
  description: string;
  photos: Photo[];
  emotionalCurve: number[]; // Emotional intensity over time (0-10)
  duration: number; // Seconds
  generatedAt: string;
}
