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
