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
      description: getPeriodDescription(period.year, period.month)
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

  // Generate descriptions for periods
  function getPeriodDescription(year: number, month?: number): string {
    const descriptions: Record<number, string> = {
      2024: "High school and college championships, pushing technical boundaries in challenging lighting conditions.",
      2023: "Building momentum with local tournaments and expanding into multi-sport coverage.",
      2022: "Finding my voice in sports photography, focusing on emotional storytelling.",
      2021: "Starting with youth sports, learning to anticipate the decisive moment.",
      2020: "Adapting to new challenges during unprecedented times, focusing on indoor sports.",
    };

    return descriptions[year] ||
           `Capturing the intensity and emotion of ${month ? 'monthly' : 'yearly'} sports action.`;
  }

  // Initialize
  onMount(() => {
    loadTimelineData();
  });
</script>

<svelte:head>
  <title>Photo Timeline | Nino Chavez</title>
  <meta name="description" content="Explore Nino Chavez's photography journey through the years - from youth sports to professional championships." />

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
