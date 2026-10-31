<!--
  TimelineV2 Component - Vertical timeline for photo browsing

  Features:
  - Year/month grouping for large datasets
  - Date-based timeline navigation (year/month dots aligned to actual dates)
  - Clickable year labels with active state tracking
  - Visual hierarchy: Years above timeline, months on timeline
  - Scroll position tracking for active year highlighting
  - Photo grids with lazy loading
  - Mobile-responsive design

  Navigation IA:
  - Top level: Year labels (clickable, show active state)
  - Second level: Month dots (clickable, positioned by actual date)
  - Visual feedback: Active year highlighted, hover states on all elements
  - Progress indicator shows current scroll position

  Usage:
  <TimelineV2 {timelineData} />
-->

<script lang="ts">
  import { untrack, tick, onMount } from 'svelte';
  import { base } from '$app/paths';
  import Typography from '$lib/components/ui/Typography.svelte';
  import PhotoCard from '$lib/components/gallery/PhotoCard.svelte';
  import FittedPhotoGrid from '$lib/components/gallery/FittedPhotoGrid.svelte';
  import Lightbox from '$lib/components/gallery/Lightbox.svelte';
  import { Calendar, ChevronDown } from 'lucide-svelte';
  import type { Photo } from '$types/photo';

  interface TimelineEntry {
    year: number;
    month?: number;
    monthName?: string;
    photoCount: number;
    featuredPhotos: Photo[];
    description?: string;
  }

  interface Props {
    timelineData: TimelineEntry[];
    hasMore?: boolean;
    currentPage?: number;
    selectedSport?: string | null;
    selectedCategory?: string | null;
    sports?: Array<{ name: string; count: number; percentage: number }>;
    categories?: Array<{ name: string; count: number; percentage: number }>;
    allAvailablePeriods?: TimelineEntry[];
    onLoadMore?: () => Promise<void>;
  }

  let {
    timelineData,
    hasMore = false,
    allAvailablePeriods = [],
    onLoadMore
  }: Props = $props();

  let ready = $state(false);
  onMount(() => { ready = true; });

  // Lazy loading state
  let isLoadingMore = $state(false);
  let hasMorePeriods = $derived(hasMore);
  // Group periods by year for sticky year headers
  let periodsByYear = $derived.by(() => {
    const grouped: Record<number, TimelineEntry[]> = {};
    timelineData.forEach(entry => {
      if (!grouped[entry.year]) {
        grouped[entry.year] = [];
      }
      grouped[entry.year].push(entry);
    });

    // Sort years descending, and within each year sort months descending
    return Object.keys(grouped)
      .map(year => parseInt(year))
      .sort((a, b) => b - a)
      .map(year => ({
        year,
        periods: grouped[year].sort((a, b) => (b.month || 0) - (a.month || 0))
      }));
  });

  // Combined periods for single dropdown
  let availablePeriods = $derived.by(() => {
    return allAvailablePeriods
      .filter(entry => entry.month) // Only include entries with months
      .map(entry => ({
        year: entry.year,
        month: entry.month!,
        monthName: entry.monthName!,
        label: `${entry.monthName} ${entry.year}`,
        id: `${entry.year}-${entry.month}`
      }))
      .sort((a, b) => {
        // Sort by year descending, then by month descending
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      });
  });

  // Lightbox state - collect all photos from timeline for full navigation
  let lightboxOpen = $state(false);
  let selectedPhotoIndex = $state(0);
  
  // Collect all featured photos from all periods for lightbox navigation
  let allTimelinePhotos = $derived.by(() => {
    const photos: Photo[] = [];
    timelineData.forEach(entry => {
      if (entry.featuredPhotos && entry.featuredPhotos.length > 0) {
        photos.push(...entry.featuredPhotos);
      }
    });
    return photos;
  });

  // Photo click handler - find photo in full timeline collection
  // Consistent with other pages: opens full lightbox with all timeline photos
  // PhotoCard's onclick handler already prevents default navigation
  //
  // Keyed by `id`, not `image_key` — the timeline spans every album, and 120 image_key
  // values repeat across different albums' camera rolls (DSC numbers reset per card), so a
  // by-image_key lookup here could open a different album's photo with the same filename.
  function handlePhotoClick(photo: Photo) {
    const index = allTimelinePhotos.findIndex((p) => p.id === photo.id);

    if (index !== -1) {
      selectedPhotoIndex = index;
      lightboxOpen = true;
    } else if (allTimelinePhotos.length > 0) {
      // Fallback: the clicked photo isn't in the collected set (shouldn't happen —
      // it's rendered FROM that set) — open on the first photo rather than do nothing.
      console.warn('[Timeline] Photo not found in allTimelinePhotos:', photo.id);
      selectedPhotoIndex = 0;
      lightboxOpen = true;
    }
  }

  function handleLightboxNavigate(newIndex: number) {
    selectedPhotoIndex = newIndex;
  }

  // The lightbox reuses the SAME "load more" mechanism the infinite-scroll sentinel already
  // uses (loadMorePeriods → the page's onLoadMore prop, which appends to timelineData) — so
  // crossing past the last photo of the currently-loaded periods loads more periods instead
  // of dead-ending. This was previously unwired: hasMore/onLoadMore were never passed to the
  // Lightbox below, so Next silently did nothing once every loaded period's photos were shown.
  //
  // A period can load with zero featuredPhotos (or dedupe to nothing — see handleLoadMore's
  // own dedup in the parent route), which would grow `timelineData` without growing
  // `allTimelinePhotos` — the Lightbox would then read that as a failed load and show its
  // retry banner even though hasMorePeriods is still true. Loop the same way scrollToYear
  // already does: keep pulling periods until a new photo actually appears or there really is
  // nothing left, capped so an unlucky run of empty periods can't spin forever.
  async function lightboxLoadMore(): Promise<void> {
    const startCount = allTimelinePhotos.length;
    const maxAttempts = 10;
    for (let i = 0; i < maxAttempts; i++) {
      await loadMorePeriods();
      await tick();
      if (allTimelinePhotos.length > startCount || !hasMorePeriods) return;
    }
  }

  // Scroll to period function
  async function scrollToPeriod(year: number, month?: number) {
    const periodId = month ? `month-${year}-${month}` : `year-${year}`;
    let element = document.getElementById(periodId);
    if (!element && onLoadMore && hasMorePeriods && !isLoadingMore) {
      isLoadingMore = true;
      try {
        for (let attempt = 0; attempt < 10 && hasMorePeriods; attempt++) {
          await onLoadMore();
          await tick();
          await new Promise(resolve => requestAnimationFrame(resolve));
          element = document.getElementById(periodId);
          if (element) break;
        }
      } finally {
        isLoadingMore = false;
      }
    }
    if (element) {
      const offset = getScrollOffset();
      const elementPosition = element.getBoundingClientRect().top + window.scrollY;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
      });
    }
  }

  // Get featured photos (simple passthrough for now)
  function getFeaturedPhotos(photos: Photo[]): Photo[] {
    return photos || [];
  }

  // Align the requested date below the sticky date rail.
  function getScrollOffset(): number {
    const timelineNav = document.querySelector('[data-timeline-nav]');
    if (!timelineNav) return 20;
    const top = parseFloat(getComputedStyle(timelineNav).top) || 0;
    return top + timelineNav.getBoundingClientRect().height + 20;
  }

  const years = $derived([...new Set(availablePeriods.map(period => period.year))].sort((a,b) => b-a));

  // Track currently visible year and month based on scroll position
  let currentVisibleYear = $state<number | null>(null);
  let currentVisibleMonth = $state<{ year: number; month: number } | null>(null);

  const activeYear = $derived(currentVisibleYear ?? years[0]);
  const visibleMonths = $derived(availablePeriods.filter(period => period.year === activeYear));

  // Update visible year and month based on scroll position
  // Derive the active date from month sections in normal document flow.
  function updateVisibleYear() {
    const monthElements = document.querySelectorAll('[id^="month-"]');

    // Find the month section closest to the top of the viewport
    let closestMonth: { year: number; month: number; distance: number } | null = null;
    monthElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      // Match the same reading position used by the date jump.
      const distance = Math.abs(rect.top - getScrollOffset());

      if (rect.top < window.innerHeight && rect.bottom > 0) {
        const monthId = el.id.replace('month-', '');
        const [year, month] = monthId.split('-').map(Number);

        if (!closestMonth || distance < closestMonth.distance) {
          closestMonth = { year, month, distance };
        }
      }
    });

    if (closestMonth) {
      const closest = closestMonth as { year: number; month: number; distance: number };
      currentVisibleYear = closest.year;
      currentVisibleMonth = { year: closest.year, month: closest.month };
    }
  }

  function findYearScrollTarget(year: number): HTMLElement | null {
    return document.getElementById(`year-${year}`);
  }

  function scrollToElement(el: HTMLElement, behavior: ScrollBehavior = 'smooth') {
    const elementPosition = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: elementPosition - getScrollOffset(), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : behavior });
  }

  // Scroll to year function — loads more data if year isn't in DOM yet
  async function scrollToYear(year: number) {
    const target = findYearScrollTarget(year);
    if (target) {
      scrollToElement(target);
      return;
    }

    // Year not in DOM — load more data until it appears
    if (!onLoadMore || !hasMorePeriods) return;

    // Keep loading batches until the year section appears or no more data
    isLoadingMore = true;
    const maxAttempts = 10;
    for (let i = 0; i < maxAttempts; i++) {
      await onLoadMore();

      // Wait for Svelte to flush DOM updates
      await tick();
      await new Promise(r => requestAnimationFrame(r));

      const el = findYearScrollTarget(year);
      if (el) {
        scrollToElement(el, 'instant');
        isLoadingMore = false;
        return;
      }

      if (!hasMorePeriods) break;
    }
    isLoadingMore = false;
  }

  // Scroll tracking effect
  $effect(() => {
    function scrollHandler() {
      updateVisibleYear();
    }
    window.addEventListener('scroll', scrollHandler, { passive: true });
    updateVisibleYear(); // Initial check
    return () => {
      window.removeEventListener('scroll', scrollHandler);
    };
  });

  // Intersection observer for infinite scroll
  let sentinelElement: HTMLElement | null = $state(null);
  let sentinelObserver: IntersectionObserver | null = $state(null);

  // Load more periods — delegates to parent via callback
  async function loadMorePeriods() {
    if (!onLoadMore || isLoadingMore) return;
    isLoadingMore = true;
    try {
      await onLoadMore();
    } finally {
      isLoadingMore = false;
    }
  }

  // Initialize intersection observer for infinite scroll
  function initIntersectionObserver() {
    if (sentinelObserver) {
      sentinelObserver.disconnect();
    }

    sentinelObserver = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMorePeriods && !isLoadingMore) {
          // Use untrack to prevent reactive updates from triggering the effect
          untrack(() => loadMorePeriods());
        }
      },
      {
        rootMargin: '100px', // Start loading 100px before the sentinel comes into view
        threshold: 0.1
      }
    );

    if (sentinelElement) {
      sentinelObserver.observe(sentinelElement);
    }
  }

  // Set up observer when sentinel element is available
  $effect(() => {
    // Only track sentinelElement changes, not sentinelObserver
    const element = sentinelElement;

    // Use untrack to prevent infinite loop from reading/writing sentinelObserver
    untrack(() => {
      if (element && !sentinelObserver) {
        initIntersectionObserver();
      }
    });

    return () => {
      untrack(() => {
        if (sentinelObserver) {
          sentinelObserver.disconnect();
          sentinelObserver = null;
        }
      });
    };
  });
</script>

<div class="timeline-shell">
  <nav class="timeline-bar" data-timeline-nav aria-label="Photo timeline" aria-busy={isLoadingMore}>
    <div class="timeline-years">{#each years as year (year)}<button disabled={!ready || isLoadingMore} onclick={() => scrollToYear(year)} aria-label={`Jump to ${year}`} aria-current={activeYear === year ? 'date' : undefined}>{year}</button>{/each}</div>
    <div class="timeline-months">{#each visibleMonths as period (`${period.year}-${period.month}`)}<button disabled={!ready || isLoadingMore} onclick={() => scrollToPeriod(period.year, period.month)} aria-label={`Jump to ${period.monthName} ${period.year}`} aria-current={currentVisibleMonth?.year === period.year && currentVisibleMonth?.month === period.month ? 'date' : undefined}><span class="date-dot"></span>{period.monthName?.slice(0,3)}</button>{/each}</div>
  </nav>

  <!-- Timeline Content -->
  <div class="timeline-content">
    {#each periodsByYear as yearGroup (yearGroup.year)}
      <!-- Sticky Year Header -->
      <div
        id="year-{yearGroup.year}"
        class="year-heading"
      >
        <div class="year-heading__inner">
          <div>
            <div>
              <Typography variant="h2" class="text-white">
                {yearGroup.year}
              </Typography>
              <Typography variant="caption" class="text-charcoal-400">
                {yearGroup.periods.reduce((total, period) => total + period.photoCount, 0)} photos this year
              </Typography>
            </div>
          </div>
        </div>
      </div>

      <!-- Months within this year -->
      {#each yearGroup.periods as entry (`${entry.year}-${entry.month}`)}
        <div
          id="month-{entry.year}-{entry.month}"
          class="month-section"
        >
          <!-- Month Header -->
          <div class="month-heading">
            <div>
              <Typography variant="h3" class="text-white">
                {entry.monthName}
              </Typography>
              <Typography variant="caption" class="text-charcoal-400">
                {entry.photoCount} photos
              </Typography>
            </div>
          </div>

          <!-- Month Content -->
          <div>
            <!-- Photo Grid or Empty State -->
            {#if getFeaturedPhotos(entry.featuredPhotos).length > 0}
              {@const featuredPhotos = getFeaturedPhotos(entry.featuredPhotos)}
              <div class="timeline-photo-grid">
                <FittedPhotoGrid photos={featuredPhotos}>
                  {#snippet children(photo, photoIndex, sizes)}
                    <PhotoCard
                      {sizes}
                      preserveAspectRatio
                      {photo}
                      index={photoIndex}
                      favoriteSurface="timeline"
                      onclick={handlePhotoClick}
                    />
                  {/snippet}
                </FittedPhotoGrid>
              </div>
            {:else}
              <!-- Empty State for periods with no featured photos -->
              <div class="timeline-empty">
                <Calendar class="w-10 h-10 text-charcoal-600 mx-auto mb-3" />
                <Typography variant="body" class="text-charcoal-400 mb-1">
                  Featured photos coming soon
                </Typography>
                <Typography variant="caption" class="text-charcoal-400">
                  {entry.photoCount} photos available • Open the month to browse
                </Typography>
              </div>
            {/if}

            <!-- View All Link -->
            <a
              href="{base}/photos/{entry.year}/{entry.month}"
              class="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300 transition-colors text-sm"
            >
              <Typography variant="body" class="font-medium">
                View month
              </Typography>
              <ChevronDown class="w-4 h-4 rotate-[-90deg]" />
            </a>
          </div>
        </div>
      {/each}

      <!-- Infinite scroll sentinel - only show for the last year group -->
      {#if yearGroup === periodsByYear[periodsByYear.length - 1] && hasMorePeriods}
        <div
          bind:this={sentinelElement}
          class="flex justify-center py-12"
        >
          {#if isLoadingMore}
            <div class="flex items-center gap-3 text-charcoal-400">
              <div class="w-6 h-6 border-2 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
              <Typography variant="body" class="text-sm">
                Loading more periods...
              </Typography>
            </div>
          {:else}
            <div class="h-4"></div>
          {/if}
        </div>
      {/if}
    {/each}

  </div>

  <!-- Lightbox - consistent with other pages, shows all timeline photos. hasMore/onLoadMore
       reuse the same period-loading machinery as the infinite-scroll sentinel above, so
       reaching the end of what's loaded fetches more periods instead of dead-ending. -->
  <Lightbox
    bind:open={lightboxOpen}
    photo={allTimelinePhotos[selectedPhotoIndex] || null}
    photos={allTimelinePhotos}
    currentIndex={selectedPhotoIndex}
    onNavigate={handleLightboxNavigate}
    hasMore={hasMorePeriods}
    onLoadMore={lightboxLoadMore}
    loadingMore={isLoadingMore}
    viewSource="timeline"
  />

</div>

<style>
  .timeline-bar{position:sticky;top:0;z-index:40;background:#181818f8;border-block:1px solid #5c5c58;padding:10px 0;isolation:isolate}.timeline-years{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #484844}.timeline-years button{min-width:44px;min-height:44px;padding:8px;color:#c1c1bb;font-size:17px;font-weight:600;background:transparent;border:0;cursor:pointer}.timeline-years button[aria-current]{color:white;box-shadow:inset 0 -2px white}.timeline-months{display:flex;justify-content:space-between;gap:4px;overflow-x:auto;padding-top:6px}.timeline-months button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-width:48px;min-height:52px;background:transparent;border:0;color:#c1c1bb;font-size:12px;cursor:pointer}.date-dot{width:9px;height:9px;border:1px solid #b9b9b3;border-radius:50%;background:#181818}.timeline-months button[aria-current]{color:white;font-weight:700}.timeline-months button[aria-current] .date-dot{background:white;outline:3px solid #ffffff30}.timeline-bar button:focus-visible{outline:2px solid white;outline-offset:-2px}@media(max-width:700px){.timeline-years{gap:4px}.timeline-years button{font-size:15px}.timeline-months{justify-content:flex-start}.timeline-months button{min-width:44px}}

  .timeline-shell { width: min(1320px, calc(100% - 64px)); margin-inline: auto; color: var(--color-charcoal-50); }
  .timeline-content { padding-block: 28px 80px; }
  .year-heading { position: static; margin-block: 18px 28px; background: var(--color-charcoal-950); }
  .year-heading__inner { padding-bottom: 16px; border-bottom: 1px solid var(--color-charcoal-800); }
  .year-heading :global(h2) { font-family: Montserrat, sans-serif; font-size: 24px; }
  .month-section { margin-bottom: 48px; }
  .month-heading { margin-bottom: 18px; }
  .month-heading :global(h3) { font-family: Montserrat, sans-serif; font-size: 20px; }
  .timeline-photo-grid { margin-bottom: 18px; }
  .timeline-photo-grid :global(.photo-card) { border: 0; border-radius: 0; transform: none; box-shadow: none; }
  .timeline-empty { margin-bottom: 18px; padding: 28px; border-block: 1px solid var(--color-charcoal-800); text-align: center; }
  @media (max-width: 640px) {
    .timeline-shell { width: calc(100% - 40px); }
  }
</style>
