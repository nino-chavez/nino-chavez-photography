/**
 * Photo Filtering Service
 *
 * Business logic for filtering, grouping, and selecting photos.
 * Extracted from route handlers to enable reuse and testing.
 */

import type { Photo } from '$types/photo';

/**
 * Group photos by album for diversity selection
 *
 * Used by hero photo selection to prevent one album from dominating.
 *
 * @param photos - Array of photos
 * @param albumKeyFn - Function to extract album key from photo
 * @returns Map of album key to photos
 */
export function groupByAlbum<T>(
	photos: T[],
	albumKeyFn: (photo: T) => string
): Map<string, T[]> {
	const groups = new Map<string, T[]>();

	for (const photo of photos) {
		const albumKey = albumKeyFn(photo);
		if (!groups.has(albumKey)) {
			groups.set(albumKey, []);
		}
		groups.get(albumKey)!.push(photo);
	}

	return groups;
}

/**
 * Select diverse photos across albums
 *
 * Ensures representation from multiple albums by limiting
 * the number of photos selected from each.
 *
 * @param photos - Array of photos
 * @param albumKeyFn - Function to extract album key
 * @param maxPerAlbum - Maximum photos per album
 * @returns Balanced selection of photos
 *
 * @example
 * const balanced = selectDiversePhotos(photos, p => p.album_name, 10)
 * // Returns up to 10 photos per album
 */
export function selectDiversePhotos<T>(
	photos: T[],
	albumKeyFn: (photo: T) => string,
	maxPerAlbum: number
): T[] {
	const groups = groupByAlbum(photos, albumKeyFn);
	const result: T[] = [];

	for (const [, albumPhotos] of groups) {
		result.push(...albumPhotos.slice(0, maxPerAlbum));
	}

	return result;
}

/**
 * Filter photos by sport type
 */
export function filterBySport<T extends { metadata?: { sport_type?: string } }>(
	photos: T[],
	sportType: string
): T[] {
	return photos.filter(
		(p) => p.metadata?.sport_type?.toLowerCase() === sportType.toLowerCase()
	);
}

/**
 * Filter photos by category
 */
export function filterByCategory<T extends { metadata?: { photo_category?: string } }>(
	photos: T[],
	category: string
): T[] {
	return photos.filter(
		(p) => p.metadata?.photo_category?.toLowerCase() === category.toLowerCase()
	);
}

/**
 * Filter photos by multiple criteria
 *
 * @param photos - Array of photos
 * @param filters - Filter criteria
 * @returns Filtered photos
 */
export function filterPhotos(
	photos: Photo[],
	filters: {
		sport?: string;
		category?: string;
		albumKey?: string;
		minQuality?: number;
	}
): Photo[] {
	let result = [...photos];

	if (filters.sport) {
		result = result.filter(
			(p) => p.metadata.sport_type?.toLowerCase() === filters.sport!.toLowerCase()
		);
	}

	if (filters.category) {
		result = result.filter(
			(p) => p.metadata.photo_category?.toLowerCase() === filters.category!.toLowerCase()
		);
	}

	if (filters.albumKey) {
		result = result.filter(
			(p) => (p as Photo & { album_key?: string }).album_key?.toLowerCase() === filters.albumKey!.toLowerCase()
		);
	}

	if (filters.minQuality !== undefined) {
		result = result.filter((p) => {
			const qualityScore =
				((p.metadata.sharpness || 0) +
					(p.metadata.composition_score || 0) +
					(p.metadata.emotional_impact || 0)) /
				3;
			return qualityScore >= filters.minQuality!;
		});
	}

	return result;
}

/**
 * Pick a random photo from an array
 *
 * @param photos - Array of photos
 * @returns Random photo or null if empty
 */
export function pickRandom<T>(photos: T[]): T | null {
	if (photos.length === 0) return null;
	const index = Math.floor(Math.random() * photos.length);
	return photos[index];
}

/**
 * Deduplicate photos by image key
 *
 * @param photos - Array of photos (may contain duplicates)
 * @returns Deduplicated array
 */
export function deduplicateByImageKey<T extends { image_key: string }>(
	photos: T[]
): T[] {
	const seen = new Set<string>();
	return photos.filter((photo) => {
		if (seen.has(photo.image_key)) {
			return false;
		}
		seen.add(photo.image_key);
		return true;
	});
}
