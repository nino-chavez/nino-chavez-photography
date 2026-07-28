/**
 * Share URL Attribution
 *
 * Appends a `?src=<channel>` query param to outbound share URLs so Cloudflare Web
 * Analytics stops bucketing every share click as "direct" traffic. The value is
 * read back on arrival by $lib/analytics/tracker's trackArrival (see the albums/[slug]
 * and homepage loaders), which logs it as a view engagement event.
 */

import { SITE_URL } from '$lib/site-url';

// Callers that already hold an absolute URL (ShareMenu, SocialShareButtons, or
// `data.seo.canonical`) pass it through untouched; this base only resolves a
// relative path. It was the old `photography.ninochavez.co` subdomain until
// 2026-07-28, which meant every "copy link" and every social share handed out a
// URL that 301-redirects before it resolves. See $lib/site-url.
const FALLBACK_BASE = SITE_URL;

/**
 * Append (or overwrite) the `src` query param on a URL headed out of the app.
 * Preserves any existing query params. Falls back to returning the input
 * unchanged if it can't be parsed as a URL — attribution must never break sharing.
 *
 * @example
 * withSrc('https://ninochavez.co/photography/photo/DSC06067', 'share-x')
 * // => 'https://ninochavez.co/photography/photo/DSC06067?src=share-x'
 */
export function withSrc(url: string, src: string): string {
	try {
		const parsed = new URL(url, FALLBACK_BASE);
		parsed.searchParams.set('src', src);
		return parsed.toString();
	} catch {
		return url;
	}
}

/**
 * Absolute share URL for a photo, or `null` when the item has no `image_key` to
 * address it by (videos, and any row where the column is empty).
 *
 * Two call sites used to interpolate `image_key` straight into a template. When it
 * was null they emitted `/photo/null` — a real, shareable link to nothing. Facebook
 * cached one: over 7 days its scraper requested `/photography/photo/null` 334 times,
 * half of them timing out at the edge (167x 404, 167x 504). Returning null here
 * makes "this item can't be shared" a value the caller has to handle, instead of a
 * string that looks like a URL.
 */
export function photoShareUrl(imageKey: string | null | undefined): string | null {
	if (!imageKey) return null;
	return `${FALLBACK_BASE}/photo/${encodeURIComponent(imageKey)}`;
}
