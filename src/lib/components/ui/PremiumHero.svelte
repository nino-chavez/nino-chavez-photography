<!--
  PremiumHero - Split-layout hero with crossfade rotation and cinematic grain

  ARCHITECTURE:
  - Server sends 8 hero candidates, edge-cached for 5 min
  - Client rotates through images with crossfade every 8s
  - Two-layer system: preload next image on inactive layer, then swap opacity
  - Grain texture overlay for cinematic feel (from nino-chavez-website)

  PERFORMANCE:
  - Split layout reduces LCP image area by ~50%
  - First image SSR-rendered and preloaded (LCP optimized)
  - CSS transitions only (no JS animation library)
  - Preloads next image before crossfade (no flash)

  Layout:
  - Desktop: Split 50/50 (text left, image right)
  - Mobile: Stacked (image top, text below)
-->

<script lang="ts">
  import type { Snippet } from 'svelte';
  import Typography from './Typography.svelte';
  import { cn } from '$lib/utils';
  import { base } from '$app/paths';
  import { type CFVariant } from '$lib/utils/cloudflare-images';

  interface Props {
    images?: string[];
    staticHeroIndex?: number;
    title?: string;
    subtitle?: string;
    /** Compact band (~50vh) instead of the full 70–80vh splash — task-first homepage. */
    compact?: boolean;
    /** Full-bleed image with content overlaid (gallery hero) instead of the split band. */
    fullBleed?: boolean;
    /** Override the built-in static LCP hero (e.g. a curated flickday lead frame). */
    staticDesktop?: string;
    staticMobile?: string;
    /** Replaces the default "Browse Gallery" CTA in the content area (e.g. a search form). */
    children?: Snippet;
    class?: string;
  }

  let {
    images = [],
    staticHeroIndex = 0,
    title = 'SPORTS PHOTOGRAPHY',
    subtitle = 'ACTION & MOMENTS',
    compact = false,
    fullBleed = false,
    staticDesktop,
    staticMobile,
    children,
    class: className
  }: Props = $props();

  // Height tokens: compact lets the recent-events row sit above the fold; default keeps the splash.
  const sectionH = $derived(compact ? 'min-h-[46vh] lg:min-h-[52vh]' : 'min-h-[70vh] lg:min-h-[80vh]');
  const desktopGridH = $derived(compact ? 'lg:min-h-[52vh]' : 'min-h-[80vh]');
  const mobileWrapH = $derived(compact ? 'min-h-[44vh]' : 'min-h-[70vh]');
  const mobileImgH = $derived(compact ? 'h-[30vh]' : 'h-[45vh]');

  // --- Static hero for instant LCP ---
  const STATIC_HEROES = [
    { desktop: `${base}/images/hero/hero-1-desktop.webp`, mobile: `${base}/images/hero/hero-1-mobile.webp` }
  ];
  let staticHero = $derived(
    staticDesktop
      ? { desktop: staticDesktop, mobile: staticMobile ?? staticDesktop }
      : (STATIC_HEROES[staticHeroIndex] ?? STATIC_HEROES[0])
  );
  let dynamicReady = $state(false);

  // --- Image rotation state ---
  // Two layers for crossfade: layer 0 starts visible, layer 1 is preload target
  let activeLayer = $state<0 | 1>(0);
  let currentIndex = $state(0);
  let layerSources = $state<[string, string]>(['', '']);

  // Sync layer sources when images prop changes
  $effect(() => {
    layerSources = [
      images[0] || '',
      images.length > 1 ? images[1] : ''
    ];
    currentIndex = 0;
    activeLayer = 0;
  });

  // Preload first dynamic image, then reveal dynamic layer + start rotation
  $effect(() => {
    if (images.length === 0) return;
    const firstUrl = getOptimizedUrl(images[0], 'desktop');
    preloadImage(firstUrl).then(() => { dynamicReady = true; });
  });

  // Rotation: every 8s, preload next image then crossfade (only after dynamic ready)
  $effect(() => {
    if (!dynamicReady || images.length <= 1) return;

    const interval = setInterval(async () => {
      const nextIdx = (currentIndex + 1) % images.length;
      const nextUrl = images[nextIdx];
      if (!nextUrl) return;

      const desktopUrl = getOptimizedUrl(nextUrl, 'desktop');
      await preloadImage(desktopUrl);

      const inactive: 0 | 1 = activeLayer === 0 ? 1 : 0;
      layerSources[inactive] = nextUrl;

      requestAnimationFrame(() => {
        activeLayer = inactive;
        currentIndex = nextIdx;
      });
    }, 8000);

    return () => clearInterval(interval);
  });

  function preloadImage(url: string): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = url;
    });
  }

  // --- Image URL optimization ---
  function getOptimizedUrl(imageUrl: string, size: 'mobile' | 'desktop' | 'thumbnail'): string {
    if (!imageUrl) return '';

    // CF Images URLs: swap the variant segment
    if (imageUrl.includes('imagedelivery.net')) {
      const cfVariantMap: Record<typeof size, CFVariant> = {
        desktop: 'large',
        mobile: 'medium',
        thumbnail: 'thumbnail'
      };
      return imageUrl.replace(/\/[^/]+$/, `/${cfVariantMap[size]}`);
    }

    return imageUrl;
  }

  // Derived URLs for active layer (used by blur placeholder)
  let activeSource = $derived(layerSources[activeLayer]);
  let thumbnailUrl = $derived(getOptimizedUrl(activeSource, 'thumbnail'));

  // Per-layer optimized URLs
  let layer0Desktop = $derived(getOptimizedUrl(layerSources[0], 'desktop'));
  let layer0Mobile = $derived(getOptimizedUrl(layerSources[0], 'mobile'));
  let layer1Desktop = $derived(getOptimizedUrl(layerSources[1], 'desktop'));
  let layer1Mobile = $derived(getOptimizedUrl(layerSources[1], 'mobile'));

  let hasImages = $derived(images.length > 0);

  // Grain texture SVG (from nino-chavez-website)
  const grainSvg = "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E')";
</script>

{#if fullBleed}
  <!-- Full-bleed gallery hero: one curated frame fills the viewport, content overlaid. -->
  <section
    class={cn('relative w-full bg-charcoal-950 overflow-hidden min-h-[56vh] lg:min-h-[62vh]', className)}
    role="banner"
    aria-label="Hero section"
  >
    <div class="absolute inset-0">
      <!-- Static LCP hero (responsive) -->
      <img
        src={staticHero.desktop}
        alt="Volleyball action photography"
        width="2048"
        height="1365"
        class="hidden lg:block absolute inset-0 w-full h-full object-cover object-center hero-crossfade"
        style="opacity: {dynamicReady ? 0 : 1}"
        fetchpriority="high"
        decoding="sync"
      />
      <img
        src={staticHero.mobile}
        alt="Volleyball action photography"
        width="1024"
        height="683"
        class="lg:hidden absolute inset-0 w-full h-full object-cover object-center hero-crossfade"
        style="opacity: {dynamicReady ? 0 : 1}"
        fetchpriority="high"
        decoding="sync"
      />

      {#if thumbnailUrl}
        <div
          class="absolute inset-0 bg-cover bg-center blur-xl scale-110 transition-opacity duration-1000"
          style="background-image: url('{thumbnailUrl}');"
          aria-hidden="true"
        ></div>
      {/if}

      <!-- Crossfade layers (desktop large / mobile medium) -->
      {#if layer0Desktop}
        <img src={layer0Desktop} alt="" width="2048" height="1365" class="hidden lg:block absolute inset-0 w-full h-full object-cover object-center hero-crossfade" style="opacity: {activeLayer === 0 ? 1 : 0}" fetchpriority={activeLayer === 0 ? 'high' : 'low'} decoding={activeLayer === 0 ? 'sync' : 'async'} />
      {/if}
      {#if layer0Mobile}
        <img src={layer0Mobile} alt="" width="1024" height="683" class="lg:hidden absolute inset-0 w-full h-full object-cover object-center hero-crossfade" style="opacity: {activeLayer === 0 ? 1 : 0}" decoding="async" />
      {/if}
      {#if layer1Desktop}
        <img src={layer1Desktop} alt="" width="2048" height="1365" class="hidden lg:block absolute inset-0 w-full h-full object-cover object-center hero-crossfade" style="opacity: {activeLayer === 1 ? 1 : 0}" decoding="async" />
      {/if}
      {#if layer1Mobile}
        <img src={layer1Mobile} alt="" width="1024" height="683" class="lg:hidden absolute inset-0 w-full h-full object-cover object-center hero-crossfade" style="opacity: {activeLayer === 1 ? 1 : 0}" decoding="async" />
      {/if}

      {#if hasImages}
        <div class="absolute inset-0 opacity-[0.08] mix-blend-overlay pointer-events-none" style="background-image: {grainSvg}" aria-hidden="true"></div>
      {/if}

      <!-- Legibility scrim: heavy on the content (left/bottom), clears the image on the right -->
      <div class="absolute inset-0 bg-gradient-to-r from-charcoal-950 via-charcoal-950/80 to-charcoal-950/10 lg:to-transparent pointer-events-none" aria-hidden="true"></div>
      <div class="absolute inset-0 bg-gradient-to-t from-charcoal-950 via-charcoal-950/10 to-charcoal-950/25 pointer-events-none" aria-hidden="true"></div>
    </div>

    <!-- Overlaid content -->
    <div class="relative z-10 min-h-[56vh] lg:min-h-[62vh] flex items-end lg:items-center pb-10 lg:pb-0">
      <div class="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="max-w-xl hero-content-animate">
          <Typography
            variant="h1"
            class="text-5xl sm:text-6xl xl:text-7xl font-bold text-white uppercase leading-[0.95] mb-6"
            style="font-family: 'Montserrat', 'Helvetica Neue', sans-serif; letter-spacing: 0.03em; font-weight: 700;"
          >
            {title}
          </Typography>
          {#if children}{@render children()}{/if}
        </div>
      </div>
    </div>
  </section>
{:else}
<!-- Split Hero Section -->
<section
  class={cn(
    "relative w-full bg-charcoal-950 overflow-hidden",
    sectionH,
    className
  )}
  role="banner"
  aria-label="Hero section"
>
  <!-- Desktop: Split Layout (50/50) -->
  <div class={cn("hidden lg:grid lg:grid-cols-2 h-full", desktopGridH)}>
    <!-- Left: Text Content -->
    <div class="relative z-10 flex items-center justify-center px-8 xl:px-16 bg-gradient-to-r from-charcoal-950 via-charcoal-950 to-charcoal-900/50">
      <div class="max-w-xl text-left hero-content-animate">
        <Typography
          variant="h1"
          class="text-4xl xl:text-5xl 2xl:text-6xl font-bold text-white uppercase tracking-wide leading-tight mb-4"
          style="font-family: 'Montserrat', 'Helvetica Neue', sans-serif; letter-spacing: 0.08em; font-weight: 700;"
        >
          {title}
        </Typography>

        {#if subtitle}
          <Typography
            variant="h2"
            class="text-lg xl:text-xl font-light text-charcoal-300 uppercase tracking-widest mb-8"
            style="font-family: 'Montserrat', 'Helvetica Neue', sans-serif; letter-spacing: 0.12em; font-weight: 300;"
          >
            {subtitle}
          </Typography>
        {/if}

        {#if children}
          {@render children()}
        {:else}
          <a
            href="{base}/explore"
            class="inline-flex items-center gap-2 px-6 py-3 bg-gold-500 hover:bg-gold-400 text-charcoal-950 font-semibold rounded-lg transition-all duration-200 hover:translate-y-[-2px] hover:shadow-lg"
          >
            Browse Gallery
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>
        {/if}
      </div>
    </div>

    <!-- Right: Hero Image with crossfade layers -->
    <div class="relative overflow-hidden">
      <!-- Static hero for instant LCP (Vercel CDN) -->
      <img
        src={staticHero.desktop}
        alt="Volleyball action photography"
        width="2048"
        height="1365"
        class="absolute inset-0 w-full h-full object-cover hero-crossfade"
        style="opacity: {dynamicReady ? 0 : 1}"
        fetchpriority="high"
        decoding="sync"
      />

      <!-- Blur placeholder (follows active image) -->
      {#if thumbnailUrl}
        <div
          class="absolute inset-0 bg-cover bg-center blur-xl scale-110 transition-opacity duration-1000"
          style="background-image: url('{thumbnailUrl}');"
          aria-hidden="true"
        ></div>
      {/if}

      <!-- Layer 0 -->
      {#if layer0Desktop}
        <img
          src={layer0Desktop}
          alt="Volleyball action photography"
          width="2048"
          height="1365"
          class="absolute inset-0 w-full h-full object-cover hero-crossfade"
          style="opacity: {activeLayer === 0 ? 1 : 0}"
          fetchpriority={activeLayer === 0 ? 'high' : 'low'}
          decoding={activeLayer === 0 ? 'sync' : 'async'}
        />
      {/if}

      <!-- Layer 1 -->
      {#if layer1Desktop}
        <img
          src={layer1Desktop}
          alt="Volleyball action photography"
          width="2048"
          height="1365"
          class="absolute inset-0 w-full h-full object-cover hero-crossfade"
          style="opacity: {activeLayer === 1 ? 1 : 0}"
          fetchpriority={activeLayer === 1 ? 'high' : 'low'}
          decoding="async"
        />
      {/if}

      <!-- Grain texture overlay -->
      {#if hasImages}
        <div
          class="absolute inset-0 opacity-[0.08] mix-blend-overlay pointer-events-none"
          style="background-image: {grainSvg}"
          aria-hidden="true"
        ></div>
      {/if}

      <!-- Gradient overlays for edge blending -->
      <div class="absolute inset-0 bg-gradient-to-r from-charcoal-950 via-transparent to-transparent pointer-events-none" aria-hidden="true"></div>
      <div class="absolute inset-0 bg-gradient-to-t from-charcoal-950/30 via-transparent to-charcoal-950/20 pointer-events-none" aria-hidden="true"></div>
    </div>
  </div>

  <!-- Mobile: Stacked Layout -->
  <div class={cn("lg:hidden flex flex-col", mobileWrapH)}>
    <!-- Top: Image (constrained height for faster LCP) -->
    <div class={cn("relative overflow-hidden", mobileImgH)}>
      <!-- Static hero for instant LCP (Vercel CDN) -->
      <img
        src={staticHero.mobile}
        alt="Volleyball action photography"
        width="1024"
        height="683"
        class="absolute inset-0 w-full h-full object-cover hero-crossfade"
        style="opacity: {dynamicReady ? 0 : 1}"
        fetchpriority="high"
        decoding="sync"
      />

      <!-- Blur placeholder -->
      {#if thumbnailUrl}
        <div
          class="absolute inset-0 bg-cover bg-center blur-xl scale-110 transition-opacity duration-1000"
          style="background-image: url('{thumbnailUrl}');"
          aria-hidden="true"
        ></div>
      {/if}

      <!-- Layer 0 - Mobile -->
      {#if layer0Mobile}
        <img
          src={layer0Mobile}
          alt="Volleyball action photography"
          width="1024"
          height="683"
          class="absolute inset-0 w-full h-full object-cover hero-crossfade"
          style="opacity: {activeLayer === 0 ? 1 : 0}"
          fetchpriority={activeLayer === 0 ? 'high' : 'low'}
          decoding={activeLayer === 0 ? 'sync' : 'async'}
        />
      {/if}

      <!-- Layer 1 - Mobile -->
      {#if layer1Mobile}
        <img
          src={layer1Mobile}
          alt="Volleyball action photography"
          width="1024"
          height="683"
          class="absolute inset-0 w-full h-full object-cover hero-crossfade"
          style="opacity: {activeLayer === 1 ? 1 : 0}"
          fetchpriority={activeLayer === 1 ? 'high' : 'low'}
          decoding="async"
        />
      {/if}

      <!-- Grain texture overlay -->
      {#if hasImages}
        <div
          class="absolute inset-0 opacity-[0.08] mix-blend-overlay pointer-events-none"
          style="background-image: {grainSvg}"
          aria-hidden="true"
        ></div>
      {/if}

      <!-- Gradient overlay -->
      <div class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-charcoal-950 pointer-events-none" aria-hidden="true"></div>
    </div>

    <!-- Bottom: Text Content -->
    <div class="relative z-10 flex-1 flex items-center justify-center px-6 py-8 bg-charcoal-950">
      <div class="text-center hero-content-animate">
        <Typography
          variant="h1"
          class="text-3xl sm:text-4xl font-bold text-white uppercase tracking-wide leading-tight mb-3"
          style="font-family: 'Montserrat', 'Helvetica Neue', sans-serif; letter-spacing: 0.08em; font-weight: 700;"
        >
          {title}
        </Typography>

        {#if subtitle}
          <Typography
            variant="h2"
            class="text-sm sm:text-base font-light text-charcoal-300 uppercase tracking-widest mb-6"
            style="font-family: 'Montserrat', 'Helvetica Neue', sans-serif; letter-spacing: 0.12em; font-weight: 300;"
          >
            {subtitle}
          </Typography>
        {/if}

        {#if children}
          {@render children()}
        {:else}
          <a
            href="{base}/explore"
            class="inline-flex items-center gap-2 px-5 py-2.5 bg-gold-500 hover:bg-gold-400 text-charcoal-950 font-semibold rounded-lg transition-colors text-sm"
          >
            Browse Gallery
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>
        {/if}
      </div>
    </div>
  </div>
</section>
{/if}

<style>
  /* Crossfade transition for hero image layers */
  .hero-crossfade {
    transition: opacity 1.2s ease-in-out;
  }

  /* PERFORMANCE: CSS animation instead of svelte-motion */
  @keyframes hero-fade-in {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .hero-content-animate {
    animation: hero-fade-in 0.6s ease-out forwards;
  }

  /* Reduce motion for accessibility */
  @media (prefers-reduced-motion: reduce) {
    .hero-content-animate {
      animation: none;
    }
    .hero-crossfade {
      transition: none;
    }
  }
</style>
