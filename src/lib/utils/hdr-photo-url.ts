import { resolve } from '$app/paths';
import { SvelteSet } from 'svelte/reactivity';

/**
 * URL for a photo's web-sized Ultra HDR (gain-map) copy, served from R2 via
 * src/routes/api/hdr/[id]/+server.ts. Only call this when `photo.hdr_web_available` is true —
 * the route 404s otherwise, and callers (Lightbox, PhotoDetailModal, /photo/[id]) fall back to the
 * Cloudflare Images URL in that case, same as before this feature existed.
 *
 * Uses `resolve()` (not the deprecated `base` string prefix) so this is checked against the
 * real route table — a typo or a renamed route fails at compile time instead of 404ing silently.
 */
export function hdrPhotoUrl(photoId: string): string {
	return resolve('/api/hdr/[id]', { id: photoId });
}

interface HdrCandidate {
	id?: string | null;
	hdr_web_available?: boolean | null;
}

/**
 * Per-viewer HDR source choice with a per-PHOTO fallback. Every viewer shows many photos over its
 * lifetime (Lightbox navigation, a reused modal, SvelteKit reusing /photo/[id] across ids), so a
 * load failure must only demote the photo that failed. The earlier per-component boolean demoted
 * every later photo to the Cloudflare Images copy after a single failure.
 */
export function createHdrSource() {
	const failed = new SvelteSet<string>();
	return {
		/** The HDR URL to show for this photo, or null to use the Cloudflare Images copy. */
		url(photo: HdrCandidate | null | undefined): string | null {
			if (!photo?.hdr_web_available || !photo.id || failed.has(photo.id)) return null;
			return hdrPhotoUrl(photo.id);
		},
		/** Call from the <img> onerror while it was showing the HDR URL. */
		markFailed(photo: HdrCandidate | null | undefined): void {
			if (photo?.id) failed.add(photo.id);
		}
	};
}
