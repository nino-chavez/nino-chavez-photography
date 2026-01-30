/**
 * Photo Utility Functions - SvelteKit Migration
 *
 * Centralized utilities for photo-related calculations and transformations.
 * Eliminates duplicate logic across components.
 */

import type { Photo, PhotoMetadata } from '$types/photo';
import {
	Trophy,
	Flame,
	Target,
	Zap,
	Sparkles,
	Waves,
	type Icon
} from 'lucide-svelte';

/**
 * Emotion Color Mapping (from app.css emotion palette)
 * These colors are used for emotion halos and visual indicators
 */
export const emotionColors: Record<string, string> = {
	triumph: '#FFD700',
	intensity: '#FF4500',
	focus: '#4169E1',
	determination: '#8B008B',
	excitement: '#FF69B4',
	serenity: '#20B2AA'
};

/**
 * Emotion Icon Mapping (WCAG 1.4.1 Compliance)
 *
 * Icons provide a non-color indicator to supplement emotion halos.
 * This ensures users with color blindness can distinguish emotions.
 *
 * @see https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html
 */
export const emotionIcons: Record<string, typeof Icon> = {
	triumph: Trophy,
	intensity: Flame,
	focus: Target,
	determination: Zap,
	excitement: Sparkles,
	serenity: Waves
};

/**
 * Get emotion icon component for a given emotion
 *
 * @param emotion - Emotion string (case-insensitive)
 * @returns Icon component or null if emotion not found
 */
export function getEmotionIcon(emotion: string | null | undefined): typeof Icon | null {
	if (!emotion) return null;
	return emotionIcons[emotion.toLowerCase()] || null;
}

/**
 * Get emotion color hex value for a given emotion
 *
 * @param emotion - Emotion string (case-insensitive)
 * @returns Hex color string or null if emotion not found
 */
export function getEmotionColor(emotion: string | null | undefined): string | null {
	if (!emotion) return null;
	return emotionColors[emotion.toLowerCase()] || null;
}

/**
 * Calculate average quality score from photo metadata
 *
 * Quality score is the average of 4 metrics:
 * - Sharpness (0-10)
 * - Exposure accuracy (0-10)
 * - Composition score (0-10)
 * - Emotional impact (0-10)
 *
 * @param metadata - Photo metadata with quality scores
 * @returns Average quality score (0-10)
 *
 * @example
 * const score = calculateQualityScore(photo.metadata);
 * // => 8.5
 */
export function calculateQualityScore(metadata: PhotoMetadata | undefined | null): number {
  // Handle undefined or null metadata
  if (!metadata) {
    return 0;
  }

  const { sharpness, exposure_accuracy, composition_score, emotional_impact } = metadata;

  // Validate all scores are numbers
  const scores = [sharpness, exposure_accuracy, composition_score, emotional_impact];
  const validScores = scores.filter((score) => typeof score === 'number' && !isNaN(score));

  if (validScores.length === 0) {
    return 0;
  }

  return validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
}

/**
 * Calculate average quality score directly from a Photo object
 *
 * @param photo - Photo object with metadata
 * @returns Average quality score (0-10)
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
 * WCAG 1.4.1 compliant: includes emotion information that supplements visual halos.
 *
 * @param photo - Photo object
 * @param includeTitle - Whether to prepend photo title
 * @returns Alt text string
 *
 * @example
 * generatePhotoAltText(photo)
 * // => "Portfolio-worthy volleyball photo. Emotion: Triumph. Quality score 8.5/10. High intensity action."
 */
export function generatePhotoAltText(photo: Photo, includeTitle: boolean = true): string {
  const { metadata } = photo;

  // Handle undefined metadata
  if (!metadata) {
    return photo.title || 'Sports photo';
  }

  const qualityScore = getPhotoQualityScore(photo);
  const parts: string[] = [];

  // Include title if available and requested
  if (includeTitle && photo.title) {
    parts.push(photo.title);
  }

  // Sport type
  if (metadata.sport_type) {
    parts.push(`${metadata.sport_type} photo`);
  }

  // Emotion (WCAG 1.4.1: non-color indicator for emotion halo)
  if (metadata.emotion) {
    parts.push(`Emotion: ${metadata.emotion}`);
  }

  // Lighting and aesthetic info (Bucket 1)
  if (metadata.lighting) {
    parts.push(`${metadata.lighting} lighting`);
  }

  if (metadata.time_of_day) {
    parts.push(`${metadata.time_of_day}`);
  }

  // Action intensity
  if (metadata.action_intensity) {
    parts.push(`${metadata.action_intensity} intensity action`);
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
 * Prioritizes action context and emotional impact for engaging UX.
 *
 * @param photo - Photo object with metadata
 * @returns User-friendly title string
 *
 * @example
 * generatePhotoTitle(photo)
 * // => "Volleyball Attack - High Intensity Action"
 * // => "Celebration Moment - Peak Emotion"
 * // => "Golden Hour Portrait - Soft Natural Lighting"
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

  // Action intensity (if high/peak)
  if (metadata.action_intensity === 'high' || metadata.action_intensity === 'peak') {
    parts.push('-', capitalize(metadata.action_intensity), 'Intensity');
  }

  // If no action context, use aesthetic context
  if (parts.length === 1 && metadata.time_of_day) {
    parts.push('-', formatTimeOfDay(metadata.time_of_day));
  }

  if (parts.length === 1 && metadata.lighting) {
    parts.push('-', capitalize(metadata.lighting), 'Lighting');
  }

  return parts.join(' ') || 'Sports Photo';
}

/**
 * Generate engaging caption for lightbox display
 *
 * Creates narrative descriptions that tell the story behind the photo.
 * Focuses on emotion and context for immersive viewing experience.
 *
 * @param photo - Photo object with metadata
 * @returns Engaging caption string
 *
 * @example
 * generatePhotoCaption(photo)
 * // => "A moment of triumph captured during golden hour"
 * // => "Intense determination in the heat of competition"
 * // => "Serene focus during a crucial volleyball play"
 */
export function generatePhotoCaption(photo: Photo): string {
  const { metadata } = photo;

  if (!metadata) {
    return '';
  }

  const emotion = metadata.emotion;
  const sport = metadata.sport_type;
  const playType = metadata.play_type;
  const category = metadata.photo_category;
  const timeOfDay = metadata.time_of_day;
  const lighting = metadata.lighting;

  // Emotion-based narrative starters
  const emotionStarters: Record<string, string[]> = {
    triumph: ['A moment of triumph', 'Victory captured', 'Success in motion'],
    determination: ['Intense determination', 'Unwavering focus', 'Resolute strength'],
    intensity: ['Raw intensity', 'Maximum effort', 'Full commitment'],
    focus: ['Complete concentration', 'Laser-focused', 'Absolute attention'],
    excitement: ['Electric excitement', 'Thrilling moment', 'Charged atmosphere'],
    serenity: ['Peaceful focus', 'Calm determination', 'Serene intensity']
  };

  let starter = '';
  if (emotion && emotionStarters[emotion]) {
    starter = emotionStarters[emotion][Math.floor(Math.random() * emotionStarters[emotion].length)];
  }

  const parts: string[] = [];

  // Add starter
  if (starter) {
    parts.push(starter.toLowerCase());
  }

  // Add context
  const contextParts: string[] = [];

  if (playType) {
    contextParts.push(`during a ${playType}`);
  } else if (category) {
    contextParts.push(`in a ${category} moment`);
  }

  if (sport) {
    contextParts.push(sport);
  }

  if (timeOfDay) {
    contextParts.push(formatTimeOfDay(timeOfDay).toLowerCase());
  }

  if (lighting && lighting !== 'natural') {
    contextParts.push(`with ${lighting} lighting`);
  }

  if (contextParts.length > 0) {
    parts.push(contextParts.join(' '));
  }

  return parts.join(' ') || '';
}

/**
 * Format time of day for display
 *
 * @param timeOfDay - Time of day enum value
 * @returns Formatted string
 */
function formatTimeOfDay(timeOfDay: string): string {
  const formats: Record<string, string> = {
    golden_hour: 'Golden Hour',
    blue_hour: 'Blue Hour',
    time_of_day: timeOfDay.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  };

  return formats[timeOfDay] || timeOfDay.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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
 * @param photo - Photo object
 * @returns Array of formatted metadata strings
 *
 * @example
 * generateMetadataSummary(photo)
 * // => ["Volleyball", "Attack", "High Intensity", "Golden Hour", "Natural Light"]
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

  // Intensity (if notable)
  if (metadata.action_intensity === 'high' || metadata.action_intensity === 'peak') {
    summary.push(`${capitalize(metadata.action_intensity)} Intensity`);
  }

  // Time context
  if (metadata.time_of_day) {
    summary.push(formatTimeOfDay(metadata.time_of_day));
  }

  // Lighting context
  if (metadata.lighting && metadata.lighting !== 'natural') {
    summary.push(`${capitalize(metadata.lighting)} Light`);
  }

  return summary;
}

/**
 * Calculate emotion-based glow intensity
 *
 * Uses internal quality metrics (Bucket 2) for visual effects
 *
 * @param metadata - Photo metadata
 * @returns Glow intensity in pixels
 */
export function calculateGlowIntensity(metadata: PhotoMetadata): number {
  return calculateQualityScore(metadata);
}

// ============================================================================
// Image Proxy Configuration
// ============================================================================

/**
 * Image Proxy Configuration
 *
 * When enabled, SmugMug images are served through our Cloudflare Worker:
 * - Eliminates third-party cookies (first-party domain)
 * - Edge caching with 1-year TTL
 * - Future: WebP/AVIF conversion (with Cloudflare Pro)
 *
 * The proxy URL format is:
 *   gallery.ninochavez.co/proxy/photos.smugmug.com/path/to/image.jpg
 *
 * @example
 * // Direct SmugMug: https://photos.smugmug.com/photos/i-AbCdEf/.../i-AbCdEf-L.jpg
 * // With Proxy:     https://gallery.ninochavez.co/proxy/photos.smugmug.com/photos/i-AbCdEf/.../i-AbCdEf-L.jpg
 */
export const IMAGE_PROXY_CONFIG = {
  // Proxy domain (Cloudflare Worker)
  proxyDomain: 'gallery.ninochavez.co',

  // Enable/disable the proxy
  enabled: true,
} as const;

/**
 * Convert SmugMug URL to proxied URL
 *
 * Transforms SmugMug CDN URLs to route through our Cloudflare Worker.
 * The Worker intercepts image requests, adds edge caching, and serves
 * from a first-party domain.
 *
 * @param smugmugUrl - Original SmugMug image URL
 * @returns Proxied URL or original if proxy disabled
 *
 * @example
 * getProxiedImageUrl('https://photos.smugmug.com/photos/i-abc/0/hash/L/i-abc-L.jpg')
 * // => 'https://gallery.ninochavez.co/proxy/photos.smugmug.com/photos/i-abc/0/hash/L/i-abc-L.jpg'
 */
export function getProxiedImageUrl(smugmugUrl: string): string {
  if (!IMAGE_PROXY_CONFIG.enabled || !IMAGE_PROXY_CONFIG.proxyDomain) {
    return smugmugUrl;
  }

  // Proxy any SmugMug image URL (photos.smugmug.com, ninochavez.smugmug.com, etc.)
  if (!smugmugUrl.includes('smugmug.com')) {
    return smugmugUrl;
  }

  // Extract the path after the protocol
  // https://photos.smugmug.com/path/to/image.jpg → photos.smugmug.com/path/to/image.jpg
  // https://ninochavez.smugmug.com/photos/... → ninochavez.smugmug.com/photos/...
  const urlPath = smugmugUrl.replace('https://', '');

  return `https://${IMAGE_PROXY_CONFIG.proxyDomain}/proxy/${urlPath}`;
}

// ============================================================================
// SmugMug Image URL Utilities
// ============================================================================

/**
 * SmugMug image size suffixes and their approximate widths
 *
 * SmugMug appends these suffixes before the file extension:
 * - Original URL: https://photos.smugmug.com/path/i-AbCdEf/0/abc123/O/i-AbCdEf-O.jpg
 * - Sized URL:    https://photos.smugmug.com/path/i-AbCdEf/0/abc123/L/i-AbCdEf-L.jpg
 */
export const SMUGMUG_SIZES = {
  Th: { suffix: '-Th', width: 150, label: 'Thumbnail' },
  S: { suffix: '-S', width: 320, label: 'Small' },
  M: { suffix: '-M', width: 600, label: 'Medium' },
  L: { suffix: '-L', width: 800, label: 'Large' },
  XL: { suffix: '-XL', width: 1024, label: 'X-Large' },
  X2: { suffix: '-X2', width: 1600, label: '2X' },
  X3: { suffix: '-X3', width: 2400, label: '3X' },
} as const;

export type SmugMugSize = keyof typeof SMUGMUG_SIZES;

/**
 * Get SmugMug image URL at a specific size
 *
 * Optionally routes through image proxy for:
 * - First-party domain (eliminates third-party cookies)
 * - WebP/AVIF conversion (when proxy supports it)
 *
 * @param url - Original SmugMug image URL
 * @param size - Desired size suffix (Th, S, M, L, XL, X2, X3)
 * @param useProxy - Whether to use image proxy (default: uses config)
 * @returns Resized URL, optionally proxied
 *
 * @example
 * getSmugMugUrl('https://photos.smugmug.com/.../i-AbCdEf-O.jpg', 'L')
 * // => 'https://photos.smugmug.com/.../i-AbCdEf-L.jpg'
 * // or with proxy: 'https://gallery.ninochavez.co/i-AbCdEf-L.jpg'
 */
export function getSmugMugUrl(
  url: string | undefined | null,
  size: SmugMugSize,
  useProxy: boolean = IMAGE_PROXY_CONFIG.enabled
): string {
  if (!url) return '';
  if (!url.includes('smugmug.com')) return url;

  const sizeInfo = SMUGMUG_SIZES[size];

  // Strip ALL SmugMug size suffixes before adding new one
  // Suffixes: -Th, -S, -M, -L, -XL, -X2, -X3, -X4, -X5, -O
  // Some URLs have multiple suffixes (e.g., filename-Th-X2.jpg)
  // Pattern matches: -Th, -XL, -X[2-5], or single letter -[SMLO]
  const sizedUrl = url
    .replace(/-(?:Th|XL|X[2-5]|[SMLO])(?=[-.])/g, '')  // Remove all size suffixes (globally)
    .replace(/(\.[^.]+)$/, `${sizeInfo.suffix}$1`);  // Add new suffix

  // Optionally route through proxy
  return useProxy ? getProxiedImageUrl(sizedUrl) : sizedUrl;
}

/**
 * Generate srcset for responsive SmugMug images
 *
 * Creates a srcset string with multiple sizes for browser to choose from.
 * Browsers pick the smallest image that fits their viewport/DPR.
 *
 * @param url - Original SmugMug image URL
 * @param sizes - Array of sizes to include (default: M, L, XL, X2)
 * @returns srcset string for img element
 *
 * @example
 * generateSmugMugSrcset('https://photos.smugmug.com/.../i-AbCdEf-O.jpg')
 * // => 'https://.../-M.jpg 600w, https://.../-L.jpg 800w, https://.../-XL.jpg 1024w, https://.../-X2.jpg 1600w'
 */
export function generateSmugMugSrcset(
  url: string | undefined | null,
  sizes: SmugMugSize[] = ['M', 'L', 'XL', 'X2']
): string {
  if (!url || !url.includes('smugmug.com')) return '';

  return sizes
    .map(size => {
      const sizeInfo = SMUGMUG_SIZES[size];
      const sizedUrl = getSmugMugUrl(url, size);
      return `${sizedUrl} ${sizeInfo.width}w`;
    })
    .join(', ');
}

/**
 * Get optimal SmugMug size for a given display width
 *
 * Considers 2x DPR for retina displays.
 *
 * @param displayWidth - Target display width in CSS pixels
 * @param highDpi - Whether to optimize for 2x displays (default: true)
 * @returns Optimal SmugMug size suffix
 *
 * @example
 * getOptimalSmugMugSize(400) // => 'L' (800px for 2x)
 * getOptimalSmugMugSize(400, false) // => 'M' (600px for 1x)
 */
export function getOptimalSmugMugSize(displayWidth: number, highDpi: boolean = true): SmugMugSize {
  const targetWidth = highDpi ? displayWidth * 2 : displayWidth;

  // Find smallest size that's >= target width
  const sizes: SmugMugSize[] = ['Th', 'S', 'M', 'L', 'XL', 'X2', 'X3'];
  for (const size of sizes) {
    if (SMUGMUG_SIZES[size].width >= targetWidth) {
      return size;
    }
  }

  return 'X3'; // Largest available
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
