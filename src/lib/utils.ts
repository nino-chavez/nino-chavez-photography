import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with proper precedence
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert a string to a URL-friendly slug
 * Example: "Lewis vs Pepperdine - Winter 2026" -> "lewis-vs-pepperdine-winter-2026"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove non-word chars (except spaces and hyphens)
    .replace(/\s+/g, '-')      // Replace spaces with hyphens
    .replace(/-+/g, '-')       // Replace multiple hyphens with single
    .replace(/^-|-$/g, '');    // Remove leading/trailing hyphens
}

/**
 * Create an album slug from name and key
 * Example: ("Lewis vs Pepperdine - Winter 2026", "pHqw25") -> "lewis-vs-pepperdine-winter-2026-pHqw25"
 */
export function createAlbumSlug(albumName: string, albumKey: string): string {
  const nameSlug = slugify(albumName);
  return `${nameSlug}-${albumKey}`;
}

/**
 * Extract the album key from a hybrid slug
 * Example: "lewis-vs-pepperdine-winter-2026-pHqw25" -> "pHqw25"
 * Also handles plain keys for backwards compatibility: "pHqw25" -> "pHqw25"
 */
export function extractAlbumKey(slug: string): string {
  // Album keys are alphanumeric, typically 6 chars
  // Extract the last segment after the final hyphen
  const parts = slug.split('-');
  const lastPart = parts[parts.length - 1];

  // If it looks like an album key (alphanumeric, 5-8 chars), return it
  if (/^[a-zA-Z0-9]{5,8}$/.test(lastPart)) {
    return lastPart;
  }

  // Fallback: return the whole slug (might be a plain key)
  return slug;
}
