/**
 * SvelteKit Server Hooks
 *
 * Security headers and the analytics hostname boundary for server-rendered responses.
 *
 * WHY HERE AND NOT IN `_headers`. Cloudflare Pages applies `_headers` to STATIC
 * ASSET responses only. Everything this app serves as HTML is rendered by the
 * Pages Function, so a `/*` block in `_headers` reaches the favicons and misses
 * every page — verified under `wrangler pages dev`: the favicon picked up its
 * Cache-Control, `/about` and `/login` picked up nothing. The blog gets away with
 * `_headers` for the same job because Astro emits it fully static. This app does
 * not, so the headers belong on the response the app itself produces.
 *
 * WHAT THEY'RE FOR. The router (apps/router) forwards origin responses unchanged,
 * so these are exactly what a visitor receives on ninochavez.co. Without
 * X-Frame-Options every page — including /login, /admin/*, and /analytics — could
 * be embedded in an iframe on any site, which is the setup for a clickjacked admin
 * action. DENY rather than SAMEORIGIN because nothing here frames its own pages:
 * the only <iframe> is VideoPlayer embedding Cloudflare Stream, which is this page
 * framing something else, and auth is a full-page PKCE redirect through
 * /auth/callback rather than a popup or an iframe.
 *
 * Referrer-Policy is stated rather than left to the browser default. The current
 * defaults agree with this value, but this app puts a secret in a URL —
 * /share/<token> — and that is not a thing to leave to a default a browser could
 * revise.
 *
 * Deliberately NOT set: X-Robots-Tag. It would apply to every response and fight
 * the `noindex` meta tags on /hero-demo, /style-guide and /timeline-variants. A
 * header and a meta tag disagreeing about indexing is a coin flip nobody should
 * have to reason about.
 */

import type { Handle } from '@sveltejs/kit';

const SECURITY_HEADERS: Record<string, string> = {
	'X-Frame-Options': 'DENY',
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin'
};

const analyticsRedirect = (location: string) => new Response(null, { status: 308, headers: { location } });

export const handle: Handle = async ({ event, resolve }) => {
	// @supabase/ssr handles all cookie-based session management automatically
	// No manual session handling needed
	const { hostname, pathname, search } = event.url;
	const analyticsPath = '/photography/analytics';
	const analyticsHome = `${analyticsPath}/operator`;
	const isAnalyticsRoute = pathname === analyticsPath || pathname.startsWith(`${analyticsPath}/`);
	const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
	let response: Response;
	if (isAnalyticsRoute && hostname !== 'analytics.ninochavez.co' && !isLocal) {
		const destination = pathname === analyticsPath ? analyticsHome : pathname;
		response = event.request.method === 'GET' || event.request.method === 'HEAD'
			? analyticsRedirect(`https://analytics.ninochavez.co${destination}${search}`)
			: new Response('Analytics actions must use analytics.ninochavez.co.', { status: 404 });
	} else {
		response = await resolve(event);
	}

	// `set` rather than `append`: a route that has already made a deliberate choice
	// (a future embeddable surface relaxing X-Frame-Options, say) would be overwritten
	// here, so any such route must opt out by name rather than by setting its own value.
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		response.headers.set(name, value);
	}

	return response;
};
