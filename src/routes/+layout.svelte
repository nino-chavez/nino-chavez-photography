<script lang="ts">
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { page, navigating } from '$app/stores';
	import { base } from '$app/paths';
	import '../app.css';
	import Header from '$lib/components/layout/Header.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';
	import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
	import ChatWidget from '$lib/components/ai/ChatWidget.svelte';

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
	const chatEnabledRoutes = ['/', '/explore', '/collections', '/albums', '/timeline'];
	let showChat = $derived(chatEnabled && chatEnabledRoutes.some(route =>
		$page.url.pathname === route || $page.url.pathname.startsWith(route + '/')
	));

	// SEO metadata
	const siteTitle = 'Nino Chavez Photography';
	const siteDescription =
		'MOTION. EMOTION. Frame by Frame. Professional action sports photography capturing the intensity, emotion, and dynamic energy of volleyball, basketball, softball, and more.';
	const siteUrl = 'https://photography.ninochavez.co';
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

	// Derive page-specific title
	const pageTitle = $derived.by(() => {
		const path = $page.url.pathname;
		if (path === '/') return siteTitle;
		if (path === '/explore') return `Search Photos | ${siteTitle}`;
		if (path === '/timeline') return `Timeline | ${siteTitle}`;
		if (path === '/collections') return `Collections | ${siteTitle}`;
		if (path === '/albums') return `Albums | ${siteTitle}`;
		if (path === '/favorites') return `Favorites | ${siteTitle}`;
		return siteTitle;
	});

	// Derive page-specific description
	const pageDescription = $derived.by(() => {
		const path = $page.url.pathname;
		if (path === '/explore')
			return 'Search and filter through 19,000+ professional action sports photos. Find the perfect shot with advanced search and filtering.';
		if (path === '/timeline') return 'Explore photos chronologically by upload date.';
		if (path === '/collections')
			return 'Curated collections showcasing portfolio-worthy shots and emotion-driven moments.';
		if (path === '/albums') return 'Browse all 253 photo albums organized by event and date.';
		if (path === '/favorites') return 'Your favorited photos - create your own collection.';
		return siteDescription;
	});

	// Canonical URL
	const canonicalUrl = $derived(`${siteUrl}${$page.url.pathname}`);

	// Resolved SEO values: page override (data.seo) → site default.
	const resolvedTitle = $derived(seo?.title ?? pageTitle);
	const resolvedDescription = $derived(seo?.description ?? pageDescription);
	const resolvedCanonical = $derived(seo?.canonical ?? canonicalUrl);
	const resolvedKeywords = $derived(seo?.keywords ?? defaultKeywords);
	const resolvedOgType = $derived(seo?.ogType ?? 'website');
	// Default share card is the branded /og.png endpoint, origin-relative so it
	// unfurls on whichever host served the page (apex + base, or subdomain).
	const resolvedOgImage = $derived(seo?.ogImage ?? `${$page.url.origin}${base}/og.png`);
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
	<link rel="canonical" href={resolvedCanonical} />

	<!-- PERFORMANCE: View Transitions API for smooth page transitions -->
	<meta name="view-transition" content="same-origin" />

	<!--
		Open Graph / Twitter — emitted ONCE here for every page. Leaf pages provide
		overrides via `data.seo` (see PageSeo above); they must not emit their own
		og/twitter tags or crawlers see duplicates.
	-->
	<meta property="og:type" content={resolvedOgType} />
	<meta property="og:url" content={resolvedCanonical} />
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
	<meta property="twitter:url" content={resolvedCanonical} />
	<meta property="twitter:title" content={resolvedTitle} />
	<meta property="twitter:description" content={resolvedDescription} />
	<meta property="twitter:image" content={resolvedOgImage} />
	<meta property="twitter:image:alt" content={resolvedOgImageAlt} />
	<meta property="twitter:site" content={twitterHandle} />
	<meta property="twitter:creator" content={twitterHandle} />

	<!-- Additional Meta Tags -->
	<meta name="author" content="Nino Chavez" />
	<meta name="robots" content="index, follow" />
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
