/**
 * SmugMug Image Size Optimizer
 *
 * Converts SmugMug image URLs to appropriate sizes for different contexts.
 * Routes all SmugMug URLs through our Cloudflare proxy for:
 * - First-party domain (eliminates third-party cookies)
 * - Edge caching with 1-year TTL
 *
 * SmugMug Size Reference:
 * - Th: 100x100   (thumbnail, blur placeholder)
 * - S:  400xAuto  (grid thumbnails)
 * - M:  600xAuto  (lightbox preview)
 * - L:  1024xAuto (full screen view)
 * - D:  1600xAuto (display/download)
 * - X2: 2048xAuto (high resolution)
 * - X3: 3000xAuto (original quality)
 *
 * Performance Impact:
 * - Using D-size (1600px) for 400px grid = 4x unnecessary data
 * - Using S-size (400px) = 75% bandwidth savings
 * - Load time: 800ms → 200ms per image
 */

import { getProxiedImageUrl } from '$lib/photo-utils';

export type SmugMugSize = 'Th' | 'S' | 'M' | 'L' | 'D' | 'B' | 'X2' | 'X3' | 'X4' | 'X5' | 'O';

export interface SmugMugSizeConfig {
  /** Approximate pixel width */
  width: number;
  /** Use case description */
  useCase: string;
  /** Typical file size */
  typicalSize: string;
}

export const SMUGMUG_SIZES: Record<SmugMugSize, SmugMugSizeConfig> = {
  Th: { width: 100, useCase: 'Thumbnail square', typicalSize: '5-10 KB' },
  S: { width: 400, useCase: 'Small (grid)', typicalSize: '20-40 KB' },
  M: { width: 600, useCase: 'Medium (lightbox)', typicalSize: '50-100 KB' },
  L: { width: 1024, useCase: 'Large (full view)', typicalSize: '100-200 KB' },
  D: { width: 1600, useCase: 'Display (download)', typicalSize: '200-400 KB' },
  B: { width: 2048, useCase: 'Big 2K (legacy)', typicalSize: '400-800 KB' },
  X2: { width: 2048, useCase: 'Extra large 2K', typicalSize: '400-800 KB' },
  X3: { width: 3000, useCase: 'Extra large 3K', typicalSize: '800-1500 KB' },
  X4: { width: 4000, useCase: 'Extra large 4K', typicalSize: '1-2 MB' },
  X5: { width: 5000, useCase: 'Original 5K+', typicalSize: '2-5 MB' },
  O: { width: 0, useCase: 'Original (full resolution)', typicalSize: '3-10 MB' }
};

/**
 * Extract size codes from a SmugMug URL (both path and filename)
 *
 * SmugMug URLs can have DIFFERENT sizes in path vs filename:
 * .../D/photo-L.jpg means path=D, filename=L
 * SmugMug uses the PATH to determine actual image size!
 *
 * @example
 * extractSize('https://photos.smugmug.com/.../D/photo-L.jpg')
 * // Returns: { path: 'D', filename: 'L' }
 */
export function extractSmugMugSizes(url: string): { path: SmugMugSize | null; filename: SmugMugSize | null } {
  if (!url) return { path: null, filename: null };

  // Extract from path: /SIZE/ where SIZE is one of our known sizes
  // Pattern: /HASH/SIZE/filename where SIZE is Th, S, M, L, D, X2, X3, X4, X5, O, B
  const pathMatch = url.match(/\/([A-Z][a-z0-9]?|[A-Z]\d)\/[^/]+\.(jpg|jpeg|png|gif)$/i);
  let pathSize: SmugMugSize | null = null;
  if (pathMatch) {
    const code = pathMatch[1];
    if (Object.keys(SMUGMUG_SIZES).includes(code)) {
      pathSize = code as SmugMugSize;
    }
  }

  // Extract from filename: -SIZE.jpg
  const filenameMatch = url.match(/-([A-Z][a-z0-9]?|[A-Z]\d)\.(jpg|jpeg|png|gif)$/i);
  let filenameSize: SmugMugSize | null = null;
  if (filenameMatch) {
    const code = filenameMatch[1];
    if (Object.keys(SMUGMUG_SIZES).includes(code)) {
      filenameSize = code as SmugMugSize;
    }
  }

  return { path: pathSize, filename: filenameSize };
}

/**
 * Extract the current size code from a SmugMug URL
 * Prefers path size over filename size (SmugMug uses path for actual size)
 */
export function extractSmugMugSize(url: string): SmugMugSize | null {
  const sizes = extractSmugMugSizes(url);
  return sizes.path || sizes.filename;
}

/**
 * Replace the size code in a SmugMug URL
 * Routes through our Cloudflare proxy for first-party domain
 *
 * @example
 * replaceSize('https://photos.smugmug.com/.../D/...-D.jpg', 'S')
 * // Returns: 'https://gallery.ninochavez.co/proxy/photos.smugmug.com/.../S/...-S.jpg'
 */
export function replaceSmugMugSize(url: string, newSize: SmugMugSize): string {
  if (!url) return url;

  const sizes = extractSmugMugSizes(url);

  if (!sizes.path && !sizes.filename) {
    console.warn('[SmugMug Optimizer] Could not extract size from URL:', url);
    // Still route through proxy even if size extraction fails
    return url.includes('smugmug.com') ? getProxiedImageUrl(url) : url;
  }

  // Replace BOTH path and filename sizes (they may be different!)
  // SmugMug uses the PATH to determine actual image size
  let optimizedUrl = url;

  // Replace path size (this is what SmugMug actually uses)
  if (sizes.path) {
    optimizedUrl = optimizedUrl.replace(`/${sizes.path}/`, `/${newSize}/`);
  }

  // Replace filename size (for consistency, but path is what matters)
  if (sizes.filename) {
    optimizedUrl = optimizedUrl.replace(`-${sizes.filename}.`, `-${newSize}.`);
  }

  // Route through our Cloudflare proxy for first-party domain
  return getProxiedImageUrl(optimizedUrl);
}

/**
 * Get optimized SmugMug URL for a specific use case
 *
 * @param url - Original SmugMug URL (any size)
 * @param context - Usage context (determines optimal size)
 * @returns Optimized URL with appropriate size
 *
 * @example
 * // For photo grid
 * const gridUrl = getOptimizedUrl(originalUrl, 'grid');
 *
 * // For lightbox
 * const lightboxUrl = getOptimizedUrl(originalUrl, 'lightbox');
 */
export function getOptimizedSmugMugUrl(
  url: string | undefined,
  context: 'thumbnail' | 'grid' | 'lightbox' | 'fullscreen' | 'download' | 'original'
): string | undefined {
  if (!url) return undefined;

  const sizeMap: Record<typeof context, SmugMugSize> = {
    thumbnail: 'Th',   // 100px - blur placeholder
    grid: 'S',         // 400px - photo grid
    lightbox: 'M',     // 600px - lightbox preview
    fullscreen: 'L',   // 1024px - full screen
    download: 'D',     // 1600px - download
    original: 'X3'     // 3000px+ - original quality
  };

  const targetSize = sizeMap[context];
  return replaceSmugMugSize(url, targetSize);
}

/**
 * Get responsive srcset for SmugMug image
 * Generates multiple sizes for responsive images
 *
 * @example
 * const srcset = getSmugMugSrcSet(originalUrl);
 * // Returns: "...S.jpg 400w, ...M.jpg 600w, ...L.jpg 1024w"
 */
export function getSmugMugSrcSet(url: string | undefined): string | undefined {
  if (!url) return undefined;

  // Optimized srcset for lightbox: focus on sizes actually needed
  // Browser will choose the best match based on viewport and device pixel ratio
  const sizes: Array<{ size: SmugMugSize; width: number }> = [
    { size: 'L', width: 1024 },   // ~100-200KB - Mobile/tablet
    { size: 'D', width: 1600 },   // ~200-400KB - Desktop standard
    { size: 'X2', width: 2048 }   // ~400-800KB - Retina/high zoom (avoid X3/X4/X5)
  ];

  return sizes
    .map(({ size, width }) => `${replaceSmugMugSize(url, size)} ${width}w`)
    .join(', ');
}

/**
 * Check if URL is a SmugMug photo URL
 */
export function isSmugMugUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.includes('smugmug.com') && url.includes('/i-');
}

/**
 * Get estimated file size for a SmugMug URL
 * Useful for debugging and performance analysis
 */
export function getEstimatedSize(url: string): string {
  const size = extractSmugMugSize(url);
  if (!size) return 'Unknown';
  return SMUGMUG_SIZES[size]?.typicalSize || 'Unknown';
}

/**
 * Batch optimize multiple URLs
 * Useful for optimizing entire photo grids
 *
 * @example
 * const photos = [{ image_url: '...D.jpg' }, { image_url: '...D.jpg' }];
 * const optimized = batchOptimize(photos.map(p => p.image_url), 'grid');
 */
export function batchOptimizeSmugMugUrls(
  urls: (string | undefined)[],
  context: Parameters<typeof getOptimizedSmugMugUrl>[1]
): (string | undefined)[] {
  return urls.map(url => getOptimizedSmugMugUrl(url, context));
}
