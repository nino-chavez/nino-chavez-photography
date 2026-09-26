import { resolve } from '$app/paths';

/**
 * URL for a photo's web-sized Ultra HDR (gain-map) copy, served from R2 via
 * src/routes/api/hdr/[id]/+server.ts. Only call this when `photo.hdr_web_available` is true —
 * the route 404s otherwise, and callers (PhotoDetailModal, /photo/[id]) fall back to the
 * Cloudflare Images URL in that case, same as before this feature existed.
 *
 * Uses `resolve()` (not the deprecated `base` string prefix) so this is checked against the
 * real route table — a typo or a renamed route fails at compile time instead of 404ing silently.
 */
export function hdrPhotoUrl(photoId: string): string {
	return resolve('/api/hdr/[id]', { id: photoId });
}
