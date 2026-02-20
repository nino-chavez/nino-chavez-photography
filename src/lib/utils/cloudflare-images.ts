/**
 * Cloudflare Images URL Builder
 *
 * All photos use `imagedelivery.net` URLs with named variants.
 *
 * Variant Reference (configured in CF Dashboard):
 * - thumbnail: 150px  (blur placeholders)
 * - grid:      400px  (gallery cards)
 * - medium:    800px  (album covers, lightbox entry)
 * - large:     1600px (full lightbox, detail pages)
 * - public:    original (downloads, q=90 jpeg)
 */

export const CF_ACCOUNT_HASH = 'wg34HB28-JkySWVm5fW4kA';

export type CFVariant = 'thumbnail' | 'grid' | 'medium' | 'large' | 'public';

/**
 * Build a Cloudflare Images delivery URL for a given image ID and variant.
 *
 * @param id - The Cloudflare Image ID (typically the image_key, e.g. "i-AbCdEf")
 * @param variant - Named variant configured in CF dashboard
 * @returns Full imagedelivery.net URL
 *
 * @example
 * cfImageUrl('i-AbCdEf', 'grid')
 * // => 'https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/i-AbCdEf/grid'
 */
export function cfImageUrl(id: string, variant: CFVariant): string {
	return `https://imagedelivery.net/${CF_ACCOUNT_HASH}/${id}/${variant}`;
}

/**
 * Generate a responsive srcset string for Cloudflare Images.
 * Uses grid (400w), medium (800w), and large (1600w) variants.
 *
 * @param id - The Cloudflare Image ID
 * @returns srcset string for use in <img> elements
 *
 * @example
 * cfSrcSet('i-AbCdEf')
 * // => 'https://imagedelivery.net/.../i-AbCdEf/grid 400w, .../medium 800w, .../large 1600w'
 */
export function cfSrcSet(id: string): string {
	return [
		`${cfImageUrl(id, 'grid')} 400w`,
		`${cfImageUrl(id, 'medium')} 800w`,
		`${cfImageUrl(id, 'large')} 1600w`
	].join(', ');
}

/**
 * Type guard to check if a photo has a Cloudflare Image ID.
 *
 * @param id - The cf_image_id field from the photo record
 * @returns true if the photo has a valid CF image ID
 */
export function hasCFImage(id: string | undefined | null): id is string {
	return typeof id === 'string' && id.length > 0;
}
