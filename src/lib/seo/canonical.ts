/**
 * Builds the canonical/og:url for a page from the request pathname.
 *
 * WHY THIS EXISTS: the root layout composed `SITE_ORIGIN + $page.url.pathname` directly, and
 * on exactly one page that produced a URL the site does not otherwise use anywhere.
 *
 * `svelte.config.js` sets `paths.base = '/photography'`, and SvelteKit serves a based app's
 * root at `${base}/` — so the home route's pathname is `/photography/`, with a trailing slash,
 * while every other route has none. The edge router (apps/router, routing.ts:133) knows this
 * and rewrites bare `/photography` to `/photography/` *internally* so the origin answers 200;
 * the visitor's address bar keeps `/photography` (verified in a real browser). That internal
 * rewrite was leaking into the canonical tag, so the site's most important page told crawlers
 * its real address was a URL the router only uses as an implementation detail:
 *
 *   sitemap.xml  →  https://ninochavez.co/photography      (priority 1)
 *   SITE_URL     →  https://ninochavez.co/photography
 *   address bar  →  https://ninochavez.co/photography
 *   canonical    →  https://ninochavez.co/photography/     ← the odd one out
 *
 * Checked against all 307 non-photo sitemap URLs plus a 25-photo sample: the home page was
 * the ONLY mismatch, which is why nothing surfaced it — one page out of 20,962.
 *
 * The rule below is just the site's own declared policy applied to the string it had not been
 * applied to: `+layout.server.ts` exports `trailingSlash = 'never'`, and SvelteKit honours it
 * for every route except the based root (`/photography/about/` really does 308 to
 * `/photography/about`). This closes that one gap.
 */

/**
 * `https://ninochavez.co/photography` for the home route, `…/photography/about` for the rest.
 *
 * A trailing slash is stripped, never added. The lone `/` case is kept rather than collapsed
 * to an empty string — a base-less deployment would otherwise emit a bare origin with no path,
 * which is a different URL from the site root on some crawlers.
 */
export function canonicalUrl(origin: string, pathname: string): string {
	return `${origin}${stripTrailingSlash(pathname)}`;
}

/** `/photography/` → `/photography`; `/` → `/`; `/a/b` → `/a/b`. */
export function stripTrailingSlash(pathname: string): string {
	if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
	return pathname;
}
