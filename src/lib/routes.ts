/**
 * Route predicates keyed on `$page.route.id`, not `$page.url.pathname`.
 *
 * `svelte.config.js` sets `paths.base = '/photography'`, so `url.pathname` is
 * `/photography/explore` while the route id is `/explore`. Any comparison against a bare path
 * written against the pathname is false everywhere — silently, since a predicate that never
 * matches raises nothing. Route ids carry no base by construction, which is why they are the
 * right key for this.
 */

/** Routes where the chat widget earns its ~50-100KB of JS. */
const CHAT_ROUTES = ['/', '/explore', '/collections', '/albums', '/timeline'];

/**
 * Is the chat widget wanted on this route? Nested routes count — `/albums/[slug]` yes — except
 * under `/`, which as a prefix would match the entire site.
 *
 * The previous version was `pathname === route || pathname.startsWith(route + '/')` against the
 * based pathname, so it returned false on every page and the widget could never mount. Prod has
 * chat kill-switched off (`VITE_CHAT_ENABLED`), so nothing looked broken — but flipping that
 * switch back on would have changed nothing, and the reason would have been in another file.
 * Note the old form got the `/` case right only because `'/' + '/'` is `//`, which matches
 * nothing; that is a property of string concatenation, not of intent, so it is stated directly
 * below.
 */
export function chatEnabledForRoute(routeId: string | null | undefined): boolean {
	if (!routeId) return false;
	if (routeId === '/') return true;
	return CHAT_ROUTES.some((r) => r !== '/' && (routeId === r || routeId.startsWith(r + '/')));
}

/**
 * Routes whose URL is itself the secret.
 *
 * `/share/[token]` is the private-album flow: the token in the path IS the access capability —
 * present it and the server reads the album with service_role. Nothing else authorises the
 * request.
 */
const SECRET_URL_ROUTES = ['/share/[token]'];

/**
 * May the layout publish this page's own URL — `<link rel="canonical">`, `og:url`, `twitter:url`?
 *
 * False for the routes above. All three tags are instructions to treat that exact URL as the
 * page's public address: canonical tells a crawler which address to index the content under, and
 * og:url / twitter:url are what every unfurling service (Slack, Discord, iMessage) reads off the
 * page and stores in its own link record. On `/share/<token>` the address they were publishing
 * was the token.
 *
 * That also contradicted the page beside it. `/share/[token]` emits
 * `<meta name="robots" content="noindex, nofollow">`, so the head asked not to be indexed and
 * declared a canonical URL in the same breath. Suppressing the tag is the fix rather than
 * rewriting it: there is no other URL this page could honestly claim, and a canonical pointing
 * somewhere else would be a different lie.
 *
 * Keyed on the route id, not the pathname — see the module comment. The rest of the head
 * (title, description, the branded default og:image) is unaffected; unfurls fall back to the
 * URL the service already fetched, so nothing is lost from the preview.
 *
 * A null route id (no route matched — the catch-all 404) also suppresses. Failing closed is
 * both the safe direction and the right answer: an unmatched URL has no canonical address.
 */
export function canPublishRouteUrl(routeId: string | null | undefined): boolean {
	if (!routeId) return false;
	return !SECRET_URL_ROUTES.includes(routeId);
}
