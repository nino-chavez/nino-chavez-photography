import { isValidSrcParam } from '$lib/analytics/share';

/**
 * Edge cache policy for /photo/[id].
 *
 * WHY. Crawlers (Meta's unverified network above all) request ~27k photo pages a day. With no
 * cache header every one re-ran the Supabase lookup and the related-photos query, and about 19%
 * of cache misses timed out at the edge (504). The page is the same for every visitor: the
 * loader reads cookies only inside the `?src=` arrival branch, and the layout loads site-wide
 * facets, so nothing in the response depends on who asks.
 *
 * HOW IT REACHES THE EDGE. The router worker (platform/ninochavez-router) fetches
 * nino-chavez-photography.pages.dev, and Cloudflare's cache honours the origin `Cache-Control`
 * on that subrequest (the same way /explore's `s-maxage` already yields `cf-cache-status: HIT`
 * on ninochavez.co). Nothing to configure in the router or the zone.
 *
 * `max-age` and not `s-maxage`: Cloudflare disables `stale-while-revalidate` when `s-maxage` is
 * present (RFC 9111 4.2.4). With `max-age` the edge serves a stale copy immediately while it
 * refreshes in the background, and a slow origin no longer 504s a page it already holds.
 *
 * TTL IS A PRIVACY BOUND. The cache lives under the pages.dev subrequest hostname, a zone this
 * account cannot purge (see OG_CACHE_CONTROL). An album made unlisted stays visible here for at
 * most max-age + stale-while-revalidate. Keep both short.
 */
export const PHOTO_PAGE_CACHE_CONTROL = 'public, max-age=600, stale-while-revalidate=3600';

/**
 * A tagged arrival (`?src=share-x`) must reach the loader every time: the loader records the
 * arrival, and a cache hit would swallow it. It also reads cookies and may mint a Supabase
 * session refresh, so the response must never be shared.
 */
export const PHOTO_PAGE_ARRIVAL_CACHE_CONTROL = 'private, no-store';

export function photoPageCacheControl(src: string | null): string {
	return isValidSrcParam(src) ? PHOTO_PAGE_ARRIVAL_CACHE_CONTROL : PHOTO_PAGE_CACHE_CONTROL;
}
