import type { AlbumPhoto } from './types';

/**
 * Compute a content hash from a list of photos.
 * SHA-256 of sorted cf_image_id values, truncated to 32 hex chars.
 */
export async function computeContentHash(photos: AlbumPhoto[]): Promise<string> {
	const sorted = photos.map((p) => p.cf_image_id).sort();
	const data = new TextEncoder().encode(sorted.join(','));
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = new Uint8Array(hashBuffer);
	const hex = Array.from(hashArray)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return hex.slice(0, 32);
}

/**
 * Build the R2 cache key for a given album and content hash.
 */
export function cacheKey(albumKey: string, contentHash: string): string {
	return `${albumKey}/large/${contentHash}.zip`;
}
