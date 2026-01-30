<!--
  Timeline V2 Page - A/B testing version with vertical scroll timeline

  Features:
  - Year/month-based photo timeline
  - Lazy loading for performance
  - Scroll-based progress animation
  - Mobile-responsive design

  Route: /timeline-v2
-->

<script lang="ts">
  import { onMount } from 'svelte';
  import TimelineV2 from '$lib/components/ui/TimelineV2.svelte';
  import { getProxiedImageUrl } from '$lib/photo-utils';
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

  // Load data from server
  function loadTimelineData() {
    try {
      isLoading = true;
      timelineData = transformPeriods(data.periods);
    } catch (error) {
      console.error('[Timeline V2] Failed to load data:', error);
    } finally {
      isLoading = false;
    }
  }

  // Generate descriptions for periods
  function getPeriodDescription(year: number, month?: number): string {
    const descriptions = {
      2024: "High school and college championships, pushing technical boundaries in challenging lighting conditions.",
      2023: "Building momentum with local tournaments and expanding into multi-sport coverage.",
      2022: "Finding my voice in sports photography, focusing on emotional storytelling.",
      2021: "Starting with youth sports, learning to anticipate the decisive moment.",
      2020: "Adapting to new challenges during unprecedented times, focusing on indoor sports.",
    };

    return descriptions[year as keyof typeof descriptions] ||
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
  <!-- Use -M size to match what OptimizedImage renders with quality="low" -->
  {#each data.periods.slice(0, 2) as period}
    {#each (period.featuredPhotos || []).slice(0, 2) as photo, i}
      {@const sizedUrl = photo.image_url?.includes('smugmug.com')
        ? photo.image_url.replace(/-(?:Th|XL|X[2-5]|[SMLO])(?=[-.])/g, '').replace(/(\.[^.]+)$/, '-M$1')
        : photo.image_url}
      {@const preloadUrl = sizedUrl?.includes('smugmug.com') ? getProxiedImageUrl(sizedUrl) : sizedUrl}
      {#if preloadUrl}
        <link
          rel="preload"
          as="image"
          href={preloadUrl}
          fetchpriority={i === 0 ? "high" : "low"}
        />
      {/if}
    {/each}
  {/each}
</svelte:head>

<div class="min-h-screen bg-charcoal-950">
  <TimelineV2
    timelineData={timelineData}
    hasMore={data.hasMore}
    currentPage={data.currentPage}
    selectedSport={data.selectedSport}
    selectedCategory={data.selectedCategory}
    sports={data.sports}
    categories={data.categories}
    allAvailablePeriods={data.allPeriods}
  />

  <!-- Loading State -->
  {#if isLoading && timelineData.length === 0}
    <div class="flex justify-center items-center py-20">
      <div class="animate-spin w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full"></div>
    </div>
  {/if}
</div>