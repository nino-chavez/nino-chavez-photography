/**
 * Public canonical addresses for the gallery. Keep canonical, share, sitemap
 * and JSON-LD URLs on the same apex base path.
 *
 * The independent gallery owns the photographic home as well as its archives.
 * The companion ninochavez-router change (PR 7) sends both apex entrance forms
 * to this app's /photography/ root internally. The slash is required by
 * SvelteKit at the origin; the public canonical remains /photography.
 * photography.ninochavez.co stays accessible through the same router, with
 * canonical links pointing to the apex. See DEPLOY.md for release ordering.
 */

/** Scheme and host, no path. Rarely what you want on its own — see SITE_URL. */
export const SITE_ORIGIN = 'https://ninochavez.co';

/**
 * The gallery's base path under the apex domain. The router forwards
 * `/photography/*` here; SvelteKit's own `base` is configured to match, so
 * in-app links are relative and only absolute URLs need this.
 */
export const SITE_BASE_PATH = '/photography';

/**
 * Absolute base for every canonical URL, `og:url`, share link, sitemap entry
 * and JSON-LD `url` the gallery emits: `https://ninochavez.co/photography`.
 * Never ends in a slash, so `${SITE_URL}/photo/${key}` composes cleanly.
 */
export const SITE_URL = `${SITE_ORIGIN}${SITE_BASE_PATH}`;
