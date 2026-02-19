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
  import Typography from './Typography.svelte';
  import { cn } from '$lib/utils';
  import { base } from '$app/paths';
  import { replaceSmugMugSize, type SmugMugSize } from '$lib/utils/smugmug-image-optimizer';
  import { cfImageUrl, type CFVariant } from '$lib/utils/cloudflare-images';

  interface Props {
    images?: string[];
    staticHeroIndex?: number;
    title?: string;
    subtitle?: string;
    class?: string;
  }

  let {
    images = [],
    staticHeroIndex = 0,
    title = 'SPORTS PHOTOGRAPHY',
    subtitle = 'ACTION & MOMENTS',
    class: className
  }: Props = $props();

  // --- Static hero for instant LCP ---
  const STATIC_HEROES = [
    { desktop: `${base}/images/hero/hero-1-desktop.webp`, mobile: `${base}/images/hero/hero-1-mobile.webp` }
  ];
  let staticHero = $derived(STATIC_HEROES[staticHeroIndex] ?? STATIC_HEROES[0]);
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
      // Replace the last path segment (variant name)
      return imageUrl.replace(/\/[^/]+$/, `/${cfVariantMap[size]}`);
    }

    if (imageUrl.includes('smugmug.com')) {
      const sizeMap: Record<typeof size, SmugMugSize> = {
        desktop: 'X2',
        mobile: 'L',
        thumbnail: 'Th'
      };
      return replaceSmugMugSize(imageUrl, sizeMap[size]);
    }

    if (imageUrl.includes('supabase')) {
      const url = new URL(imageUrl);
      if (size === 'thumbnail') {
        url.searchParams.set('width', '100');
        url.searchParams.set('quality', '60');
      } else {
        url.searchParams.set('width', size === 'mobile' ? '800' : '1200');
        url.searchParams.set('quality', '85');
      }
      url.searchParams.set('format', 'webp');
      return url.toString();
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

<!-- Split Hero Section -->
<section
  class={cn(
    "relative min-h-[70vh] lg:min-h-[80vh] w-full bg-charcoal-950 overflow-hidden",
    className
  )}
  role="banner"
  aria-label="Hero section"
>
  <!-- Desktop: Split Layout (50/50) -->
  <div class="hidden lg:grid lg:grid-cols-2 h-full min-h-[80vh]">
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

        <Typography
          variant="h2"
          class="text-lg xl:text-xl font-light text-charcoal-300 uppercase tracking-widest mb-8"
          style="font-family: 'Montserrat', 'Helvetica Neue', sans-serif; letter-spacing: 0.12em; font-weight: 300;"
        >
          {subtitle}
        </Typography>

        <a
          href="{base}/explore"
          class="inline-flex items-center gap-2 px-6 py-3 bg-gold-500 hover:bg-gold-400 text-charcoal-950 font-semibold rounded-lg transition-all duration-200 hover:translate-y-[-2px] hover:shadow-lg"
        >
          Browse Gallery
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </a>
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
  <div class="lg:hidden flex flex-col min-h-[70vh]">
    <!-- Top: Image (constrained height for faster LCP) -->
    <div class="relative h-[45vh] overflow-hidden">
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

        <Typography
          variant="h2"
          class="text-sm sm:text-base font-light text-charcoal-300 uppercase tracking-widest mb-6"
          style="font-family: 'Montserrat', 'Helvetica Neue', sans-serif; letter-spacing: 0.12em; font-weight: 300;"
        >
          {subtitle}
        </Typography>

        <a
          href="{base}/explore"
          class="inline-flex items-center gap-2 px-5 py-2.5 bg-gold-500 hover:bg-gold-400 text-charcoal-950 font-semibold rounded-lg transition-colors text-sm"
        >
          Browse Gallery
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </a>
      </div>
    </div>
  </div>
</section>

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
