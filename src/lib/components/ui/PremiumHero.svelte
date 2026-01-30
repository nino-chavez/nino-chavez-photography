<!--
  PremiumHero - Split-layout hero section optimized for LCP performance

  PERFORMANCE OPTIMIZATION:
  - Split layout reduces LCP image area by ~50% (from 100vw to ~50vw)
  - Uses CSS animations instead of svelte-motion (saves ~30KB JS)
  - Desktop: X2 (1600px) for crisp retina display
  - Mobile: L (800px) for good quality
  - Progressive loading with blur-up placeholder

  Layout:
  - Desktop: Split 50/50 (text left, image right)
  - Mobile: Stacked (text top, image below)

  Usage:
  <PremiumHero
    backgroundImage="/path/to/image.jpg"
    title="SPORTS PHOTOGRAPHY"
    subtitle="ACTION & MOMENTS"
  />
-->

<script lang="ts">
  import Typography from './Typography.svelte';
  import { cn } from '$lib/utils';
  import { base } from '$app/paths';
  import { getProxiedImageUrl } from '$lib/photo-utils';

  interface Props {
    backgroundImage?: string;
    title?: string;
    subtitle?: string;
    class?: string;
  }

  let {
    backgroundImage = '',
    title = 'SPORTS PHOTOGRAPHY',
    subtitle = 'ACTION & MOMENTS',
    class: className
  }: Props = $props();

  // Generate optimized image URL for hero
  // Routes through Cloudflare proxy for first-party domain + WebP/AVIF conversion
  function getOptimizedUrl(imageUrl: string, size: 'mobile' | 'desktop' | 'thumbnail'): string {
    if (!imageUrl) return '';

    // SmugMug optimization
    if (imageUrl.includes('smugmug.com')) {
      // Strip ALL SmugMug size suffixes: -Th, -S, -M, -L, -XL, -X2, -X3, -X4, -X5, -O
      const baseUrl = imageUrl.replace(/-(?:Th|XL|X[2-5]|[SMLO])(?=[-.])/g, '');
      // Desktop: X2 (1600px) for crisp retina display
      // Mobile: L (800px) for good quality on mobile
      let suffix = '-X2';
      if (size === 'thumbnail') suffix = '-Th';
      else if (size === 'mobile') suffix = '-L';
      const sizedUrl = baseUrl.replace(/(\.[^.]+)$/, `${suffix}$1`);
      return getProxiedImageUrl(sizedUrl);
    }

    // Supabase storage
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

  // Responsive URLs
  let thumbnailUrl = $derived(getOptimizedUrl(backgroundImage, 'thumbnail'));
  let mobileUrl = $derived(getOptimizedUrl(backgroundImage, 'mobile'));
  let desktopUrl = $derived(getOptimizedUrl(backgroundImage, 'desktop'));
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
        <!-- Main heading -->
        <Typography
          variant="h1"
          class="text-4xl xl:text-5xl 2xl:text-6xl font-bold text-white uppercase tracking-wide leading-tight mb-4"
          style="font-family: 'Montserrat', 'Helvetica Neue', sans-serif; letter-spacing: 0.08em; font-weight: 700;"
        >
          {title}
        </Typography>

        <!-- Subtitle -->
        <Typography
          variant="h2"
          class="text-lg xl:text-xl font-light text-charcoal-300 uppercase tracking-widest mb-8"
          style="font-family: 'Montserrat', 'Helvetica Neue', sans-serif; letter-spacing: 0.12em; font-weight: 300;"
        >
          {subtitle}
        </Typography>

        <!-- CTA Button -->
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

    <!-- Right: Hero Image (LCP Element - now 50% smaller!) -->
    <div class="relative overflow-hidden">
      <!-- Blur placeholder -->
      {#if thumbnailUrl}
        <div
          class="absolute inset-0 bg-cover bg-center blur-xl scale-110"
          style="background-image: url('{thumbnailUrl}');"
          aria-hidden="true"
        ></div>
      {/if}

      <!-- Main image - NO opacity:0 to avoid delaying LCP -->
      {#if desktopUrl}
        <img
          src={desktopUrl}
          alt="Volleyball action photography"
          width="1600"
          height="1067"
          class="absolute inset-0 w-full h-full object-cover"
          fetchpriority="high"
          decoding="sync"
        />
      {/if}

      <!-- Gradient overlay for edge blending -->
      <div class="absolute inset-0 bg-gradient-to-r from-charcoal-950 via-transparent to-transparent pointer-events-none" aria-hidden="true"></div>
      <div class="absolute inset-0 bg-gradient-to-t from-charcoal-950/30 via-transparent to-charcoal-950/20 pointer-events-none" aria-hidden="true"></div>
    </div>
  </div>

  <!-- Mobile: Stacked Layout -->
  <div class="lg:hidden flex flex-col min-h-[70vh]">
    <!-- Top: Image (constrained height for faster LCP) -->
    <div class="relative h-[45vh] overflow-hidden">
      <!-- Blur placeholder -->
      {#if thumbnailUrl}
        <div
          class="absolute inset-0 bg-cover bg-center blur-xl scale-110"
          style="background-image: url('{thumbnailUrl}');"
          aria-hidden="true"
        ></div>
      {/if}

      <!-- Mobile image - NO opacity:0 to avoid delaying LCP -->
      {#if mobileUrl}
        <img
          src={mobileUrl}
          alt="Volleyball action photography"
          width="800"
          height="533"
          class="absolute inset-0 w-full h-full object-cover"
          fetchpriority="high"
          decoding="sync"
        />
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
  }
</style>
