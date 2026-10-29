<!--
  Timeline Page - Vertical scroll timeline with infinite loading

  Features:
  - Year/month-based photo timeline
  - Infinite scroll loading via API
  - Year navigation loads data on demand
  - Scroll-based progress animation
  - Mobile-responsive design

  Route: /timeline
-->

<script lang="ts">
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import TimelineV2 from '$lib/components/ui/TimelineV2.svelte';
  import { cfImageUrl, cfSrcSet, hasCFImage } from '$lib/utils/cloudflare-images';
  import type { Photo } from '$types/photo';

  interface TimelineEntry {
    year: number;
    month?: number;
    monthName?: string;
    photoCount: number;
    featuredPhotos: Photo[];
    description?: string;
  }

  // Server-loaded data
  interface Props {
    data: {
      periods: any[];
      allPeriods: any[];
      currentPage: number;
      hasMore: boolean;
      selectedSport?: string | null;
      selectedCategory?: string | null;
      sports?: Array<{ name: string; count: number; percentage: number }>;
      categories?: Array<{ name: string; count: number; percentage: number }>;
    };
  }

  let { data }: Props = $props();

  // State
  let timelineData = $state<TimelineEntry[]>([]);
  let isLoading = $state(true);
  let currentPage = $state(1);
  let hasMore = $state(true);

  // Transform server data for timeline
  function transformPeriods(periods: any[]): TimelineEntry[] {
    return periods.map((period: any) => ({
      year: period.year,
      month: period.month,
      monthName: period.monthName,
      photoCount: period.photoCount,
      featuredPhotos: period.featuredPhotos || [],
      description: undefined
    }));
  }

  // Load initial data from server
  function loadTimelineData() {
    try {
      isLoading = true;
      timelineData = transformPeriods(data.periods);
      currentPage = data.currentPage;
      hasMore = data.hasMore;
    } catch (error) {
      console.error('[Timeline] Failed to load data:', error);
    } finally {
      isLoading = false;
    }
  }

  // Load more periods via API
  async function handleLoadMore() {
    if (!hasMore) return;
    const nextPage = currentPage + 1;
    const params = new URLSearchParams({ page: String(nextPage), limit: '12' });
    if (data.selectedSport) params.set('sport', data.selectedSport);
    if (data.selectedCategory) params.set('category', data.selectedCategory);

    const res = await fetch(`${base}/api/timeline?${params}`);
    if (!res.ok) return;

    const result = await res.json();
    const newPeriods = transformPeriods(result.periods);

    // Deduplicate by year-month key
    const existing = new Set(timelineData.map(p => `${p.year}-${p.month}`));
    const unique = newPeriods.filter(p => !existing.has(`${p.year}-${p.month}`));

    timelineData = [...timelineData, ...unique];
    currentPage = nextPage;
    hasMore = result.hasMore;
  }

  // Initialize
  onMount(() => {
    loadTimelineData();
  });
</script>

<svelte:head>

  <!-- Preload featured photos from first periods for LCP optimization -->
  {#each data.periods.slice(0, 2) as period}
    {#each (period.featuredPhotos || []).slice(0, 2) as photo, i}
      {#if hasCFImage(photo.cf_image_id)}
        <link
          rel="preload"
          as="image"
          imagesrcset={cfSrcSet(photo.cf_image_id!)}
          imagesizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          fetchpriority={i === 0 ? "high" : "low"}
        />
      {/if}
    {/each}
  {/each}
</svelte:head>

<div class="min-h-screen bg-charcoal-950">
  <header class="timeline-opening">
    <p class="timeline-eyebrow">Browse by date</p>
    <h1>Photo timeline</h1>
    <p>Choose a year or month, then open any photograph without losing your place.</p>
  </header>

  <TimelineV2
    timelineData={timelineData}
    hasMore={hasMore}
    currentPage={currentPage}
    selectedSport={data.selectedSport}
    selectedCategory={data.selectedCategory}
    sports={data.sports}
    categories={data.categories}
    allAvailablePeriods={data.allPeriods}
    onLoadMore={handleLoadMore}
  />

  <!-- Loading State -->
  {#if isLoading && timelineData.length === 0}
    <div class="flex justify-center items-center py-20">
      <div class="animate-spin w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full"></div>
    </div>
  {/if}
</div>

<style>
  .timeline-opening { width: min(1320px, calc(100% - 64px)); margin-inline: auto; padding-block: 40px 30px; border-bottom: 1px solid var(--color-charcoal-800); }
  .timeline-eyebrow { margin-bottom: 14px; color: var(--color-gold-500); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .timeline-opening h1 { margin: 0; font-family: Montserrat, sans-serif; font-size: clamp(32px, 3.2vw, 46px); font-weight: 750; line-height: 1.08; letter-spacing: -.035em; }
  .timeline-opening > p:last-child { max-width: 650px; margin-top: 12px; color: var(--color-charcoal-300); font-size: 16px; }
  @media (max-width: 640px) { .timeline-opening { width: calc(100% - 40px); padding-block: 24px 22px; } }
</style>
