<script lang="ts">
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { page, navigating } from '$app/stores';
	import { base } from '$app/paths';
	import '../app.css';
	import Header from '$lib/components/layout/Header.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';
	import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
	import ChatWidget from '$lib/components/ai/ChatWidget.svelte';
	import { SITE_ORIGIN, SITE_URL } from '$lib/site-url';
	import { canonicalUrl as buildCanonical } from '$lib/seo/canonical';
	import { canPublishRouteUrl, chatEnabledForRoute } from '$lib/routes';

	let { children } = $props();

	// Create QueryClient instance for TanStack Query
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 1000 * 60 * 5, // 5 minutes
				refetchOnWindowFocus: false,
			},
		},
	});

	// Navigation loading state
	let isNavigating = $derived($navigating !== null);

	// Kill switch: chat is OFF unless VITE_CHAT_ENABLED === 'true' (disabled in prod for now,
	// pending the v5 stream-contract fix + a verifiable output guardrail). Re-enable by setting
	// the env var and redeploying. Gated server-side too (see /api/chat).
	const chatEnabled = import.meta.env.VITE_CHAT_ENABLED === 'true';

	// PERFORMANCE: Only load ChatWidget on pages where AI search is useful
	// Reduces ~50-100KB JS on single photo pages, album pages, etc.
	// Keyed on route.id, NOT url.pathname — the latter carries the /photography base, so the
	// old comparison against bare paths was false on every page. See route-meta.ts.
	let showChat = $derived(chatEnabled && chatEnabledForRoute($page.route.id));

	// SEO metadata
	const siteTitle = 'Nino Chavez Photography';
	const siteDescription =
		'MOTION. EMOTION. Frame by Frame. Professional action sports photography capturing the intensity, emotion, and dynamic energy of volleyball, basketball, softball, and more.';
	const defaultKeywords =
		'sports photography, volleyball photography, action sports, basketball photography, softball photography, professional photography, Nino Chavez, motion photography, emotion photography';
	const twitterHandle = '@flickday.media';

	// Page-level SEO override (set by leaf load functions as `data.seo`). The
	// layout is the SINGLE source of og/twitter tags — pages must NOT emit their
	// own, or crawlers see duplicate og:image and may pick the wrong one (this is
	// what surfaced the stale brand card on album shares).
	type PageSeo = {
		title?: string;
		description?: string;
		canonical?: string;
		keywords?: string;
		ogType?: string;
		ogImage?: string;
		ogImageAlt?: string;
		ogImageWidth?: number;
		ogImageHeight?: number;
	};
	const seo = $derived(($page.data?.seo ?? undefined) as PageSeo | undefined);

	// Title fallback for any route that does not set `data.seo.title`. There is deliberately
	// no per-route title map here: every route that used to have one sets its own title in its
	// load function, and `seo?.title ?? …` means a map would be unreachable. The old version
	// carried six such branches, all of them dead AND all of them keyed on a path that could
	// never match (see below).
	const pageTitle = $derived(siteTitle);

	// Page description fallback. There is deliberately no per-route map here either: every
	// page supplies `data.seo.description` from its load function, the same way /photo/[id]
	// and /albums/[slug] already did. The old inline map compared `$page.url.pathname`
	// against bare paths like '/explore' — but that pathname carries the /photography base,
	// so no branch ever matched and the map was dead the whole time. `scripts/check-head-tags.mjs`
	// keeps pages from emitting their own <meta name="description"> instead.
	const pageDescription = $derived(siteDescription);

	// Canonical URL. SITE_ORIGIN, not SITE_URL: `$page.url.pathname` already carries
	// the `/photography` base (svelte.config.js sets paths.base), so composing it with
	// the base-inclusive SITE_URL yields /photography/photography/... — verified in the
	// built page, not assumed. Leaf loads that build their own canonical from SITE_URL
	// are correct, because they append a bare route like `/photo/${key}`.
	//
	// The trailing-slash strip is load-bearing on exactly one route — see canonical.ts.
	const pageCanonical = $derived(buildCanonical(SITE_ORIGIN, $page.url.pathname));

	// Resolved SEO values: page override (data.seo) → site default.
	const resolvedTitle = $derived(seo?.title ?? pageTitle);
	const resolvedDescription = $derived(seo?.description ?? pageDescription);
	const resolvedCanonical = $derived(seo?.canonical ?? pageCanonical);
	// ...and whether the page's own URL may be published at all. `/share/<token>` carries the
	// private-album capability in its path, and this layout was emitting that path as the
	// canonical URL, og:url and twitter:url of a page whose next tag is `noindex, nofollow`.
	// See canPublishRouteUrl.
	const publishUrl = $derived(canPublishRouteUrl($page.route.id));
	const resolvedKeywords = $derived(seo?.keywords ?? defaultKeywords);
	const resolvedOgType = $derived(seo?.ogType ?? 'website');
	// Default share card is the branded /og.png endpoint, absolute on SITE_URL. It was
	// built from $page.url.origin, which inside this app is the pages.dev origin the
	// router refetches from — so the default card was advertised on the internal host.
	const resolvedOgImage = $derived(seo?.ogImage ?? `${SITE_URL}/og.png`);
	const resolvedOgImageAlt = $derived(seo?.ogImageAlt ?? siteTitle);
	// Dimensions are only truthful for our generated 1200×630 cards (default +
	// albums). Pages that override with a raw image (photos) omit them.
	const resolvedOgWidth = $derived(seo?.ogImage ? seo?.ogImageWidth : 1200);
	const resolvedOgHeight = $derived(seo?.ogImage ? seo?.ogImageHeight : 630);
</script>

<svelte:head>
	<!-- Primary Meta Tags -->
	<title>{resolvedTitle}</title>
	<meta name="title" content={resolvedTitle} />
	<meta name="description" content={resolvedDescription} />
	<meta name="keywords" content={resolvedKeywords} />
	{#if publishUrl}
		<link rel="canonical" href={resolvedCanonical} />
	{/if}

	<!-- PERFORMANCE: View Transitions API for smooth page transitions -->
	<meta name="view-transition" content="same-origin" />

	<!--
		Open Graph / Twitter — emitted ONCE here for every page. Leaf pages provide
		overrides via `data.seo` (see PageSeo above); they must not emit their own
		og/twitter tags or crawlers see duplicates.

		The three URL tags (canonical, og:url, twitter:url) are the exception to
		"every page": they are gated on `publishUrl`, because a route whose path is
		a secret must not have that path published as its public address.
	-->
	<meta property="og:type" content={resolvedOgType} />
	{#if publishUrl}
		<meta property="og:url" content={resolvedCanonical} />
	{/if}
	<meta property="og:title" content={resolvedTitle} />
	<meta property="og:description" content={resolvedDescription} />
	<meta property="og:image" content={resolvedOgImage} />
	<meta property="og:image:alt" content={resolvedOgImageAlt} />
	{#if resolvedOgWidth && resolvedOgHeight}
		<meta property="og:image:width" content={String(resolvedOgWidth)} />
		<meta property="og:image:height" content={String(resolvedOgHeight)} />
	{/if}
	<meta property="og:site_name" content={siteTitle} />

	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	{#if publishUrl}
		<meta property="twitter:url" content={resolvedCanonical} />
	{/if}
	<meta property="twitter:title" content={resolvedTitle} />
	<meta property="twitter:description" content={resolvedDescription} />
	<meta property="twitter:image" content={resolvedOgImage} />
	<meta property="twitter:image:alt" content={resolvedOgImageAlt} />
	<meta property="twitter:site" content={twitterHandle} />
	<meta property="twitter:creator" content={twitterHandle} />

	<!-- Additional Meta Tags -->
	<meta name="author" content="Nino Chavez" />
	<!--
		NO `<meta name="robots">` HERE, DELIBERATELY.

		This layout wraps every route, so an unconditional `index, follow` shipped
		on the four pages that ask NOT to be indexed too — `/share/<token>`,
		`/style-guide`, `/hero-demo`, `/timeline-variants` each emitted their own
		`noindex` and the layout's tag landed beside it. Two contradictory
		directives in one head. Google resolves that by taking the most
		restrictive, so it happened to behave; nothing else is documented to, and
		`/share/<token>` is a private link that was relying on it.

		Absence is the fix, not an override mechanism: no robots tag already means
		`index, follow` to every crawler, so the tag asserted nothing its absence
		does not. A page that wants out says so on its own, once.
	-->
	<meta name="theme-color" content="#D4AF37" />

	<!-- Google Search Console Verification -->
	<meta name="google-site-verification" content="m_DGu93JLdDvx0_KNbZhjwVB75OdnQEURDhinyriJKQ" />
</svelte:head>

<QueryClientProvider client={queryClient}>
	<!-- Global Navigation Loading Bar -->
	{#if isNavigating}
		<div class="fixed top-0 left-0 right-0 z-[9999] h-1 bg-gold-500/20">
			<div class="h-full bg-gold-500 animate-progress-bar origin-left"></div>
		</div>
	{/if}

	<div class="min-h-screen bg-charcoal-950 text-white flex flex-col">
		<Header />

		<main class="flex-1 pb-20 sm:pb-0">
			{@render children?.()}
		</main>

		<Footer />
	</div>

	<!-- Global Toast Notifications -->
	<ToastContainer />

	<!-- Global AI Chat Widget - Only on pages where AI search is useful -->
	{#if showChat}
		<ChatWidget />
	{/if}
</QueryClientProvider>

<style>
	/* Progress bar animation */
	@keyframes progress {
		0% {
			transform: scaleX(0);
		}
		50% {
			transform: scaleX(0.5);
		}
		100% {
			transform: scaleX(0.95);
		}
	}

	:global(.animate-progress-bar) {
		animation: progress 1s cubic-bezier(0.4, 0, 0.2, 1) forwards;
	}
</style>
