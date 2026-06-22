/**
 * Photo Utility Functions - SvelteKit Migration
 *
 * Centralized utilities for photo-related calculations and transformations.
 * Eliminates duplicate logic across components.
 */

import type { Photo, PhotoMetadata } from '$types/photo';

/**
 * Quality-score weights — the SINGLE source of truth for how the four AI
 * sub-scores combine into a composite quality score.
 *
 * INVARIANT: these MUST stay in sync with the `quality_score` GENERATED column in
 * supabase/migrations/20260608000000_vnext_phase1_captions_quality_searchpath.sql:
 *
 *   quality_score = COALESCE(sharpness,0)*0.35 + COALESCE(composition_score,0)*0.30
 *                 + COALESCE(emotional_impact,0)*0.25 + COALESCE(exposure_accuracy,0)*0.10
 *
 * The DB column is what ranks photos (the "Best Photos" / `quality` sort). This JS
 * mirror exists so the per-photo score shown in the UI equals the score photos are
 * ranked by — they previously diverged (JS averaged equally; the DB weights). If you
 * change the weighting, change BOTH here and the migration, and re-rank is automatic
 * (the column is STORED/generated).
 */
export const QUALITY_WEIGHTS = {
  sharpness: 0.35,
  composition_score: 0.3,
  emotional_impact: 0.25,
  exposure_accuracy: 0.1
} as const;

/**
 * Calculate the composite quality score from photo metadata.
 *
 * Weighted blend of the four AI metrics (each 0–10), matching the DB
 * `quality_score` column. Missing sub-scores count as 0 (mirrors the column's
 * COALESCE), so the result stays on the same 0–10 scale.
 *
 * @param metadata - Photo metadata with quality scores
 * @returns Weighted quality score (0–10), rounded to 1 decimal for display
 *
 * @example
 * const score = calculateQualityScore(photo.metadata);
 * // => 8.5
 */
export function calculateQualityScore(metadata: PhotoMetadata | undefined | null): number {
  if (!metadata) {
    return 0;
  }

  const { sharpness, composition_score, emotional_impact, exposure_accuracy } = metadata;

  const score =
    (sharpness ?? 0) * QUALITY_WEIGHTS.sharpness +
    (composition_score ?? 0) * QUALITY_WEIGHTS.composition_score +
    (emotional_impact ?? 0) * QUALITY_WEIGHTS.emotional_impact +
    (exposure_accuracy ?? 0) * QUALITY_WEIGHTS.exposure_accuracy;

  // Round to 1 decimal for display; the DB column ranks on full precision.
  return Math.round(score * 10) / 10;
}

/**
 * Calculate the weighted quality score directly from a Photo object.
 *
 * @param photo - Photo object with metadata
 * @returns Weighted quality score (0-10)
 */
export function getPhotoQualityScore(photo: Photo): number {
  return calculateQualityScore(photo.metadata);
}

/**
 * Categorize photo quality into tiers
 *
 * @param score - Quality score (0-10)
 * @returns Quality tier classification
 */
export function getQualityTier(score: number): 'low' | 'medium' | 'high' | 'exceptional' {
  if (score < 5) return 'low';
  if (score < 7) return 'medium';
  if (score < 9) return 'high';
  return 'exceptional';
}

// REMOVED: isPortfolioQuality - Assumes quality varies (against two-bucket model)
// REMOVED: getQualityOpacity - Quality stratification removed
// REMOVED: getQualityBlurClass - Quality stratification removed

/**
 * Sort photos by quality score (descending)
 *
 * @param photos - Array of photos to sort
 * @returns Sorted array (highest quality first)
 */
export function sortPhotosByQuality(photos: Photo[]): Photo[] {
  return [...photos].sort((a, b) => {
    const qualityA = getPhotoQualityScore(a);
    const qualityB = getPhotoQualityScore(b);
    return qualityB - qualityA;
  });
}

/**
 * Sort photos by date (most recent first)
 *
 * @param photos - Array of photos to sort
 * @returns Sorted array (newest first)
 */
export function sortPhotosByDate(photos: Photo[]): Photo[] {
  return [...photos].sort((a, b) => {
    const dateA = new Date(a.created_at || 0).getTime();
    const dateB = new Date(b.created_at || 0).getTime();
    return dateB - dateA;
  });
}

// REMOVED: filterPhotosByQuality - User-facing quality filtering against two-bucket model

/**
 * Generate accessible alt text for a photo
 *
 * Combines metadata attributes into descriptive alt text for screen readers.
 *
 * The vanity CATEGORICAL aesthetic attributes (emotion, lighting, time_of_day,
 * action_intensity) were removed (cutover prep) — those columns are being DROPPED
 * at the schema cutover. Alt text now uses the durable concrete attributes.
 *
 * @param photo - Photo object
 * @param includeTitle - Whether to prepend photo title
 * @returns Alt text string
 *
 * @example
 * generatePhotoAltText(photo)
 * // => "Sunset Spike. volleyball photo. action. attack."
 */
export function generatePhotoAltText(photo: Photo, includeTitle: boolean = true): string {
  const { metadata } = photo;

  // Handle undefined metadata
  if (!metadata) {
    return photo.title || 'Sports photo';
  }

  const parts: string[] = [];

  // Include title if available and requested
  if (includeTitle && photo.title) {
    parts.push(photo.title);
  }

  // Sport type
  if (metadata.sport_type) {
    parts.push(`${metadata.sport_type} photo`);
  }

  // Category context
  if (metadata.photo_category) {
    parts.push(metadata.photo_category);
  }

  // Play type
  if (metadata.play_type) {
    parts.push(metadata.play_type);
  }

  return parts.join('. ');
}

/**
 * Generate user-friendly title for lightbox display
 *
 * Creates descriptive, readable titles instead of cryptic image keys.
 * Prioritizes durable concrete attributes (sport, play type, category).
 *
 * The vanity CATEGORICAL aesthetic attributes (action_intensity, time_of_day,
 * lighting) were removed (cutover prep) — those columns are being DROPPED at cutover.
 *
 * @param photo - Photo object with metadata
 * @returns User-friendly title string
 *
 * @example
 * generatePhotoTitle(photo)
 * // => "Volleyball Attack"
 * // => "Volleyball Celebration"
 */
export function generatePhotoTitle(photo: Photo): string {
  const { metadata } = photo;

  if (!metadata) {
    return photo.title || 'Sports Photo';
  }

  const parts: string[] = [];

  // Sport type (always include)
  if (metadata.sport_type) {
    parts.push(capitalize(metadata.sport_type));
  }

  // Primary action/play type
  if (metadata.play_type) {
    parts.push(capitalize(metadata.play_type));
  } else if (metadata.photo_category) {
    parts.push(capitalize(metadata.photo_category));
  }

  return parts.join(' ') || 'Sports Photo';
}

/**
 * Generate engaging caption for lightbox display
 *
 * Prefers the AI-extracted caption when present; otherwise falls back to a
 * concise sport/play/category description.
 *
 * The vanity CATEGORICAL aesthetic attributes (emotion, time_of_day, lighting)
 * were removed (cutover prep) — those columns are being DROPPED at cutover, so the
 * emotion-narrative caption generator is gone.
 *
 * @param photo - Photo object with metadata
 * @returns Engaging caption string
 */
export function generatePhotoCaption(photo: Photo): string {
  // Prefer the durable AI caption when available.
  if (photo.caption) {
    return photo.caption;
  }

  const { metadata } = photo;
  if (!metadata) {
    return '';
  }

  const parts: string[] = [];

  if (metadata.play_type) {
    parts.push(`during a ${metadata.play_type}`);
  } else if (metadata.photo_category) {
    parts.push(`in a ${metadata.photo_category} moment`);
  }

  if (metadata.sport_type) {
    parts.push(metadata.sport_type);
  }

  return parts.join(' ');
}

/**
 * Capitalize first letter of string
 *
 * @param str - String to capitalize
 * @returns Capitalized string
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Generate metadata summary for lightbox info bar
 *
 * Creates a concise, readable summary of key photo attributes.
 * Optimized for bottom info bar display.
 *
 * The vanity CATEGORICAL aesthetic attributes (action_intensity, time_of_day,
 * lighting) were removed (cutover prep) — those columns are being DROPPED at cutover.
 *
 * @param photo - Photo object
 * @returns Array of formatted metadata strings
 *
 * @example
 * generateMetadataSummary(photo)
 * // => ["Volleyball", "Attack"]
 */
export function generateMetadataSummary(photo: Photo): string[] {
  const { metadata } = photo;
  const summary: string[] = [];

  if (!metadata) return summary;

  // Sport (always first)
  if (metadata.sport_type) {
    summary.push(capitalize(metadata.sport_type));
  }

  // Action context
  if (metadata.play_type) {
    summary.push(capitalize(metadata.play_type));
  } else if (metadata.photo_category) {
    summary.push(capitalize(metadata.photo_category));
  }

  return summary;
}

/**
 * Calculate quality-based glow intensity
 *
 * Uses internal quality metrics (Bucket 2) for visual effects
 *
 * @param metadata - Photo metadata
 * @returns Glow intensity in pixels
 */
export function calculateGlowIntensity(metadata: PhotoMetadata): number {
  return calculateQualityScore(metadata);
}

/**
 * Recommended sizes attribute for common use cases
 *
 * These tell the browser how wide the image will be at different viewports,
 * allowing it to pick the right srcset image.
 */
export const SIZES_PRESETS = {
  // Full-width hero (100vw on all screens)
  hero: '100vw',

  // Gallery grid: 1 col mobile, 2 col tablet, 3-4 col desktop
  galleryCard: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw',

  // Album card: similar to gallery but slightly larger
  albumCard: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',

  // Lightbox: nearly full width
  lightbox: '(max-width: 1024px) 100vw, 90vw',

  // Thumbnail: small fixed size
  thumbnail: '150px',
} as const;
