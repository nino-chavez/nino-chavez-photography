/**
 * Optimized Images Module
 *
 * Provides utilities for loading locally-cached optimized images.
 * Falls back to SmugMug URLs when local images aren't available.
 *
 * Categories:
 * - hero: Homepage hero images
 * - albums: Album cover images
 * - explore: Gallery grid images
 * - timeline: Timeline featured photos
 */

export interface OptimizedImage {
  id: string;
  imageKey: string;
  albumKey?: string;
  albumName?: string;
  qualityScore?: number;
  priority: number;
  originalUrl: string;
  paths: {
    desktop: string;
    mobile: string;
    thumbnail: string;
  };
}

export interface OptimizedImageManifest {
  version: number;
  generatedAt: string;
  category: string;
  images: OptimizedImage[];
}

export type ImageCategory = 'hero' | 'albums' | 'explore' | 'timeline';

// Import manifests at build time (bundled into serverless functions)
// These are optional - pages work without them, just slower
let heroManifest: OptimizedImageManifest | null = null;
let albumsManifest: OptimizedImageManifest | null = null;
let exploreManifest: OptimizedImageManifest | null = null;
let timelineManifest: OptimizedImageManifest | null = null;

// Try to load manifests (may not exist on first build)
try {
  // @ts-ignore - JSON imports from static folder
  heroManifest = await import('../../static/optimized/hero/manifest.json');
} catch { /* Manifest doesn't exist yet */ }

try {
  // @ts-ignore
  albumsManifest = await import('../../static/optimized/albums/manifest.json');
} catch { /* Manifest doesn't exist yet */ }

try {
  // @ts-ignore
  exploreManifest = await import('../../static/optimized/explore/manifest.json');
} catch { /* Manifest doesn't exist yet */ }

try {
  // @ts-ignore
  timelineManifest = await import('../../static/optimized/timeline/manifest.json');
} catch { /* Manifest doesn't exist yet */ }

/**
 * Get the manifest for a category
 */
export function getManifest(category: ImageCategory): OptimizedImageManifest | null {
  switch (category) {
    case 'hero':
      return heroManifest;
    case 'albums':
      return albumsManifest;
    case 'explore':
      return exploreManifest;
    case 'timeline':
      return timelineManifest;
    default:
      return null;
  }
}

/**
 * Check if optimized images are available for a category
 */
export function hasOptimizedImages(category: ImageCategory): boolean {
  const manifest = getManifest(category);
  return manifest !== null && manifest.images.length > 0;
}

/**
 * Get optimized image by image key
 * Returns null if not found in local cache
 */
export function getOptimizedImage(
  category: ImageCategory,
  imageKey: string
): OptimizedImage | null {
  const manifest = getManifest(category);
  if (!manifest) return null;

  return manifest.images.find(img => img.imageKey === imageKey) || null;
}

/**
 * Get optimized image by album key (for album covers)
 */
export function getOptimizedAlbumCover(albumKey: string): OptimizedImage | null {
  if (!albumsManifest) return null;
  return albumsManifest.images.find(img => img.albumKey === albumKey) || null;
}

/**
 * Get all optimized images for a category
 */
export function getOptimizedImages(category: ImageCategory): OptimizedImage[] {
  const manifest = getManifest(category);
  return manifest?.images || [];
}

/**
 * Get the best available image URL for display
 * Prefers local optimized images, falls back to SmugMug
 *
 * @param category - Image category to check
 * @param imageKey - The image key or album key to look up
 * @param smugMugUrl - Fallback SmugMug URL
 * @param size - Which size to return (desktop, mobile, thumbnail)
 */
export function getBestImageUrl(
  category: ImageCategory,
  imageKey: string,
  smugMugUrl: string | null | undefined,
  size: 'desktop' | 'mobile' | 'thumbnail' = 'desktop'
): string {
  // Try to find optimized local version
  let optimized: OptimizedImage | null = null;

  if (category === 'albums') {
    optimized = getOptimizedAlbumCover(imageKey);
  } else {
    optimized = getOptimizedImage(category, imageKey);
  }

  if (optimized) {
    return optimized.paths[size];
  }

  // Fall back to SmugMug URL
  return smugMugUrl || '';
}

/**
 * Get srcset string for responsive images
 * Uses local optimized images if available
 */
export function getOptimizedSrcset(
  category: ImageCategory,
  imageKey: string
): string | null {
  let optimized: OptimizedImage | null = null;

  if (category === 'albums') {
    optimized = getOptimizedAlbumCover(imageKey);
  } else {
    optimized = getOptimizedImage(category, imageKey);
  }

  if (!optimized) return null;

  // Build srcset with all available sizes
  const sizes: [string, number][] = [];

  if (category === 'hero') {
    sizes.push([optimized.paths.thumbnail, 100]);
    sizes.push([optimized.paths.mobile, 1200]);
    sizes.push([optimized.paths.desktop, 1920]);
  } else if (category === 'albums' || category === 'explore') {
    sizes.push([optimized.paths.thumbnail, 80]);
    sizes.push([optimized.paths.mobile, 600]);
    sizes.push([optimized.paths.desktop, 800]);
  } else {
    sizes.push([optimized.paths.thumbnail, 100]);
    sizes.push([optimized.paths.mobile, 800]);
    sizes.push([optimized.paths.desktop, 1200]);
  }

  return sizes.map(([url, width]) => `${url} ${width}w`).join(', ');
}

/**
 * Check if an image key has a local optimized version
 */
export function isOptimized(category: ImageCategory, imageKey: string): boolean {
  if (category === 'albums') {
    return getOptimizedAlbumCover(imageKey) !== null;
  }
  return getOptimizedImage(category, imageKey) !== null;
}

/**
 * Get statistics about optimized images
 */
export function getOptimizedStats(): Record<ImageCategory, { count: number; version: number | null }> {
  const categories: ImageCategory[] = ['hero', 'albums', 'explore', 'timeline'];

  const stats: Record<ImageCategory, { count: number; version: number | null }> = {} as any;

  for (const category of categories) {
    const manifest = getManifest(category);
    stats[category] = {
      count: manifest?.images.length || 0,
      version: manifest?.version || null,
    };
  }

  return stats;
}
