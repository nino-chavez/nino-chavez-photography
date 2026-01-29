/**
 * Hero Images Module
 *
 * Provides utilities for loading and selecting hero images from
 * the locally-cached static files or falling back to SmugMug.
 */

import type { Photo } from '$types/photo';

export interface HeroImage {
  id: number;
  photoId: string;
  imageKey: string;
  albumKey: string;
  albumName: string;
  qualityScore: number;
  priority: number;
  paths: {
    desktop: string;
    mobile: string;
    thumbnail: string;
  };
}

export interface HeroImageManifest {
  version: number;
  generatedAt: string;
  images: HeroImage[];
}

// In-memory cache for manifest
let cachedManifest: HeroImageManifest | null = null;

/**
 * Load the hero images manifest from static files
 * Returns null if manifest doesn't exist (falls back to SmugMug)
 */
export async function loadHeroManifest(): Promise<HeroImageManifest | null> {
  if (cachedManifest) return cachedManifest;

  try {
    // In SvelteKit, we can import JSON files from static/
    // But for server-side, we need to fetch or read from filesystem
    const response = await fetch('/hero-images/manifest.json');
    if (!response.ok) return null;

    cachedManifest = await response.json();
    return cachedManifest;
  } catch {
    // Manifest doesn't exist - using SmugMug fallback
    return null;
  }
}

/**
 * Load hero manifest synchronously from static import
 * For use in server-side load functions
 */
export function loadHeroManifestSync(): HeroImageManifest | null {
  try {
    // This will be replaced during build with the actual manifest
    // For now, we use dynamic import which works in Node.js
    return null;
  } catch {
    return null;
  }
}

/**
 * Select a random hero image from the manifest
 * Uses album diversity to prevent single-album dominance
 */
export function selectRandomHeroImage(manifest: HeroImageManifest): HeroImage {
  const images = manifest.images;
  if (images.length === 0) {
    throw new Error('No hero images in manifest');
  }

  // Group by album to ensure diversity
  const albumGroups = new Map<string, HeroImage[]>();
  for (const img of images) {
    const key = img.albumKey || 'unknown';
    if (!albumGroups.has(key)) {
      albumGroups.set(key, []);
    }
    albumGroups.get(key)!.push(img);
  }

  // Flatten with max 3 per album for diversity
  const MAX_PER_ALBUM = 3;
  const diversePool: HeroImage[] = [];
  for (const albumImages of albumGroups.values()) {
    // Sort by priority and take top 3
    const sorted = albumImages.sort((a, b) => b.priority - a.priority);
    diversePool.push(...sorted.slice(0, MAX_PER_ALBUM));
  }

  // Random selection
  const randomIndex = Math.floor(Math.random() * diversePool.length);
  return diversePool[randomIndex];
}

/**
 * Convert a HeroImage to a Photo-compatible object for the PremiumHero component
 */
export function heroImageToPhoto(hero: HeroImage): Partial<Photo> {
  return {
    id: hero.photoId,
    image_key: hero.imageKey,
    image_url: hero.paths.desktop,
    thumbnail_url: hero.paths.thumbnail,
    title: '',
    caption: '',
    keywords: [],
    created_at: '',
    metadata: {} as Photo['metadata'],
    smugmug: {
      album_key: hero.albumKey,
      album_name: hero.albumName,
    },
  };
}

/**
 * Get the preload link for a hero image (for <svelte:head>)
 */
export function getHeroPreloadLink(hero: HeroImage, isMobile: boolean): string {
  return isMobile ? hero.paths.mobile : hero.paths.desktop;
}
