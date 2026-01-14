/**
 * Photo Scoring Service
 *
 * Centralized business logic for calculating photo quality scores,
 * determining hero-worthiness, and ranking photos.
 *
 * These functions are pure and testable - they take photo metadata
 * as input and return computed values.
 */

import type { PhotoMetadata } from '$types/photo';

/**
 * Quality score weights for different metrics
 */
export const QUALITY_WEIGHTS = {
	sharpness: 0.35,
	composition: 0.30,
	emotionalImpact: 0.25,
	exposureAccuracy: 0.10,
} as const;

/**
 * Thresholds for hero photo selection
 */
export const HERO_THRESHOLDS = {
	minSharpness: 8.0,
	minComposition: 8.0,
	minEmotionalImpact: 8.0,
	minAspectRatio: 1.0, // Landscape or square only
} as const;

/**
 * Calculate composite quality score for a photo
 *
 * @param metadata - Photo metadata with quality metrics
 * @returns Weighted quality score (0-10)
 *
 * @example
 * const score = calculateQualityScore(photo.metadata)
 * // Returns: 8.5
 */
export function calculateQualityScore(metadata: Partial<PhotoMetadata>): number {
	const {
		sharpness = 0,
		composition_score = 0,
		emotional_impact = 0,
		exposure_accuracy = 0,
	} = metadata;

	const score =
		sharpness * QUALITY_WEIGHTS.sharpness +
		composition_score * QUALITY_WEIGHTS.composition +
		emotional_impact * QUALITY_WEIGHTS.emotionalImpact +
		exposure_accuracy * QUALITY_WEIGHTS.exposureAccuracy;

	// Round to 1 decimal place
	return Math.round(score * 10) / 10;
}

/**
 * Determine if a photo is hero-worthy
 *
 * Hero photos are displayed prominently on the homepage and
 * must meet strict quality criteria.
 *
 * @param metadata - Photo metadata
 * @param aspectRatio - Photo aspect ratio (width/height)
 * @returns Whether the photo qualifies for hero display
 *
 * @example
 * const isHero = isHeroWorthy(photo.metadata, 1.5)
 * // Returns: true (landscape photo with high quality)
 */
export function isHeroWorthy(
	metadata: Partial<PhotoMetadata>,
	aspectRatio?: number
): boolean {
	const {
		sharpness = 0,
		composition_score = 0,
		emotional_impact = 0,
		photo_category,
	} = metadata;

	// Must meet minimum quality thresholds
	if (sharpness < HERO_THRESHOLDS.minSharpness) return false;
	if (composition_score < HERO_THRESHOLDS.minComposition) return false;
	if (emotional_impact < HERO_THRESHOLDS.minEmotionalImpact) return false;

	// Must be landscape or square (fills hero section better)
	if (aspectRatio !== undefined && aspectRatio < HERO_THRESHOLDS.minAspectRatio) {
		return false;
	}

	// Preferred categories for hero display
	const heroCategories = ['action', 'celebration', 'portrait'];
	if (photo_category && !heroCategories.includes(photo_category)) {
		return false;
	}

	return true;
}

/**
 * Sort photos by quality score (descending)
 *
 * @param photos - Array of photos with metadata
 * @returns Sorted array (highest quality first)
 */
export function sortByQuality<T extends { metadata: Partial<PhotoMetadata> }>(
	photos: T[]
): T[] {
	return [...photos].sort((a, b) => {
		const scoreA = calculateQualityScore(a.metadata);
		const scoreB = calculateQualityScore(b.metadata);
		return scoreB - scoreA;
	});
}

/**
 * Get the top N photos by quality
 *
 * @param photos - Array of photos with metadata
 * @param limit - Maximum number of photos to return
 * @returns Top N photos by quality score
 */
export function getTopQualityPhotos<T extends { metadata: Partial<PhotoMetadata> }>(
	photos: T[],
	limit: number
): T[] {
	return sortByQuality(photos).slice(0, limit);
}

/**
 * Calculate album quality statistics
 *
 * @param photos - Array of photos in an album
 * @returns Album statistics
 */
export function calculateAlbumStats(
	photos: Array<{ metadata: Partial<PhotoMetadata> }>
): {
	avgQuality: number;
	minQuality: number;
	maxQuality: number;
	heroCount: number;
} {
	if (photos.length === 0) {
		return { avgQuality: 0, minQuality: 0, maxQuality: 0, heroCount: 0 };
	}

	const scores = photos.map((p) => calculateQualityScore(p.metadata));
	const heroCount = photos.filter((p) => isHeroWorthy(p.metadata)).length;

	return {
		avgQuality: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
		minQuality: Math.min(...scores),
		maxQuality: Math.max(...scores),
		heroCount,
	};
}
