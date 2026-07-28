/**
 * The gallery's public address.
 *
 * WHY THIS IS A CONSTANT AND NOT A STRING IN NINE FILES
 *
 * The gallery moved from the `photography.ninochavez.co` subdomain to a base
 * path on the apex domain, and `apps/router` 301-redirects the old host. The
 * move was never propagated to the nine places that had the old origin typed
 * out, so every page in the gallery kept declaring a `<link rel="canonical">`
 * and an `og:url` pointing at a URL that redirects — while the sitemap listed
 * the new one. Search engines got two different answers to "where does this
 * page live", from the same page.
 *
 * Share links had the same bug with a more visible cost: `photoShareUrl` built
 * every "copy link" and social share on the old host, so a link pasted into
 * Slack or a text message spent a redirect before it resolved.
 *
 * One constant means the next move is one edit. Prefer `SITE_URL` for anything
 * a visitor or a crawler will see.
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
