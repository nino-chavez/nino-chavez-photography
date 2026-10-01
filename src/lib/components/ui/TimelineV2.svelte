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
  import { untrack, tick } from 'svelte';
  import { base } from '$app/paths';
  import Typography from '$lib/components/ui/Typography.svelte';
  import PhotoCard from '$lib/components/gallery/PhotoCard.svelte';
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
      const yearHeight = document.getElementById(`year-${year}`)?.getBoundingClientRect().height || 0;
      const offset = getScrollOffset() + yearHeight + 8;
      const elementPosition = element.getBoundingClientRect().top + window.scrollY;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  }

  // Calculate content diversity for a period
  function getContentDiversity(photos: Photo[]) {
    const sports = new Set(photos.map(p => p.metadata?.sport_type).filter(Boolean));
    const categories = new Set(photos.map(p => p.metadata?.photo_category).filter(Boolean));

    return {
      sportCount: sports.size,
      categoryCount: categories.size,
      sports: Array.from(sports),
      categories: Array.from(categories)
    };
  }

  // Get featured photos (simple passthrough for now)
  function getFeaturedPhotos(photos: Photo[]): Photo[] {
    return photos || [];
  }

  // The date rail remains below both shared navigation bars while browsing.
  function getScrollOffset(): number {
    const timelineNav = document.querySelector('[data-timeline-nav]');
    if (!timelineNav) return 242;
    const top = parseFloat(getComputedStyle(timelineNav).top) || 114;
    return top + timelineNav.getBoundingClientRect().height + 20;
  }

  // Calculate timeline positions (0-100%) for each period
  let timelinePositions = $derived.by(() => {
    if (availablePeriods.length === 0) return [];

    // Get min and max dates
    const firstPeriod = availablePeriods[availablePeriods.length - 1]; // Oldest
    const lastPeriod = availablePeriods[0]; // Newest

    const minDate = new Date(firstPeriod.year, firstPeriod.month - 1, 1);
    const maxDate = new Date(lastPeriod.year, lastPeriod.month - 1, 1);
    const totalRange = maxDate.getTime() - minDate.getTime();

    return availablePeriods.map(period => {
      const periodDate = new Date(period.year, period.month - 1, 1);
      const position = totalRange ? ((periodDate.getTime() - minDate.getTime()) / totalRange) * 100 : 50;
      return {
        ...period,
        position: 100 - position // Reverse so newest is on the right
      };
    });
  });

  // Get unique years for milestones with proper date-based positioning
  let yearMilestones = $derived.by(() => {
    if (availablePeriods.length === 0) return [];
    
    const years = new Set(availablePeriods.map(p => p.year));
    const yearsArray = Array.from(years).sort((a, b) => b - a); // Newest first
    
    // Get min and max dates for proper positioning
    const firstPeriod = availablePeriods[availablePeriods.length - 1]; // Oldest
    const lastPeriod = availablePeriods[0]; // Newest
    const minDate = new Date(firstPeriod.year, firstPeriod.month - 1, 1);
    const maxDate = new Date(lastPeriod.year, lastPeriod.month - 1, 1);
    const totalRange = maxDate.getTime() - minDate.getTime();
    
    // Calculate position for each year (use January 1st of that year)
    return yearsArray.map(year => {
      const yearDate = new Date(year, 0, 1); // January 1st
      // Clamp to min/max range
      const clampedDate = yearDate < minDate ? minDate : yearDate > maxDate ? maxDate : yearDate;
      const position = totalRange ? ((clampedDate.getTime() - minDate.getTime()) / totalRange) * 100 : 50;
      return {
        year,
        position: 100 - position // Reverse so newest is on the right
      };
    });
  });

  // Track currently visible year and month based on scroll position
  let currentVisibleYear = $state<number | null>(null);
  let currentVisibleMonth = $state<{ year: number; month: number } | null>(null);
  let hoveredPeriod = $state<{ year: number; month: number; monthName: string } | null>(null);

  // Update visible year and month based on scroll position
  // NOTE: Year headers are position:sticky so getBoundingClientRect returns stuck position.
  // We derive the visible year from month elements which have normal document flow.
  function updateVisibleYear() {
    const monthElements = document.querySelectorAll('[id^="month-"]');

    // Find the month section closest to the top of the viewport
    let closestMonth: { year: number; month: number; distance: number } | null = null;
    monthElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      // Consider elements that are near or above viewport top (accounting for sticky nav ~200px)
      const distance = Math.abs(rect.top - 200);

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

  // Find the scroll target for a year — use first month element (year headers are sticky)
  function findYearScrollTarget(year: number): HTMLElement | null {
    // First month of the year is the reliable scroll anchor
    const firstMonth = document.querySelector(`[id^="month-${year}-"]`) as HTMLElement | null;
    if (firstMonth) return firstMonth;
    // Fallback to year heading (works when not sticky)
    return document.getElementById(`year-${year}`);
  }

  function scrollToElement(el: HTMLElement, behavior: ScrollBehavior = 'smooth') {
    const navOffset = getScrollOffset();
    // Extra offset for the sticky year header (~80px) so it appears above the month
    const yearHeaderHeight = 80;
    const elementPosition = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: elementPosition - navOffset - yearHeaderHeight, behavior });
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

  // Progress indicator position — maps current visible month to timeline date position
  let progressPosition = $derived.by(() => {
    if (!currentVisibleMonth || availablePeriods.length === 0) return 0;

    const firstPeriod = availablePeriods[availablePeriods.length - 1]; // Oldest
    const lastPeriod = availablePeriods[0]; // Newest
    const minDate = new Date(firstPeriod.year, firstPeriod.month - 1, 1);
    const maxDate = new Date(lastPeriod.year, lastPeriod.month - 1, 1);
    const totalRange = maxDate.getTime() - minDate.getTime();

    if (totalRange === 0) return 50;

    const currentDate = new Date(currentVisibleMonth.year, currentVisibleMonth.month - 1, 1);
    const position = ((currentDate.getTime() - minDate.getTime()) / totalRange) * 100;
    return 100 - position; // Reverse so newest is on the left
  });

  function handleScroll() {
    // Scroll handler is now just a trigger for updateVisibleYear
  }

  // Scroll tracking effect
  $effect(() => {
    function scrollHandler() {
      handleScroll();
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
  <!-- Visual Timeline Navigator -->
  <div class="sticky top-16 z-40 bg-charcoal-950/95 backdrop-blur-sm border-b border-charcoal-800/50 shadow-lg" data-timeline-nav role="navigation" aria-label="Photo timeline">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <!-- Timeline Label -->
      <div class="flex items-center gap-3 mb-3">
        <span class="text-charcoal-400 text-xs font-medium flex-shrink-0">Timeline</span>
        <div class="flex-1 h-px bg-charcoal-800"></div>
      </div>

      <!-- Visual Timeline Bar -->
      <div class="relative h-16">
        <!-- Horizontal timeline line -->
        <div class="absolute top-8 left-0 right-0 h-0.5 bg-charcoal-800"></div>

        <!-- Year milestones (clickable, positioned above timeline) -->
        {#each yearMilestones as milestone, index}
          {@const isActive = currentVisibleYear === milestone.year}
          <button
            onclick={() => scrollToYear(milestone.year)}
            class="absolute top-0 transform -translate-x-1/2 group cursor-pointer transition-all"
            style="left: {milestone.position}%; --phone-position: {yearMilestones.length > 1 ? index / (yearMilestones.length - 1) * 100 : 50}%"
            aria-label="Jump to {milestone.year}"
          >
            <!-- Year marker -->
            <div class="flex flex-col items-center">
              <!-- Year label -->
              <div
                class="px-2 py-1 rounded-md transition-all"
                class:bg-gold-500={isActive}
                class:text-charcoal-950={isActive}
                class:text-charcoal-300={!isActive}
                class:hover:bg-gold-400={!isActive}
                class:hover:text-charcoal-950={!isActive}
              >
                <Typography 
                  variant="caption" 
                  class={`text-sm font-semibold whitespace-nowrap ${isActive ? 'text-charcoal-950' : 'text-charcoal-300'}`}
                >
                  {milestone.year}
                </Typography>
              </div>
              <!-- Year marker line and dot -->
              <div class="w-px h-3 bg-charcoal-600 group-hover:bg-gold-500 transition-colors mt-1"
                   class:bg-gold-500={isActive}></div>
              <div class="w-2 h-2 rounded-full bg-charcoal-600 group-hover:bg-gold-500 -mt-px transition-colors"
                   class:bg-gold-500={isActive}></div>
            </div>
          </button>
        {/each}

        <!-- Month dots (desktop only — too many dots for mobile tap targets) -->
        <div class="hidden md:block">
          {#each timelinePositions as period}
            {@const isActiveMonth = currentVisibleMonth?.year === period.year && currentVisibleMonth?.month === period.month}
            {@const monthNumStr = String(period.month).padStart(2, '0')}
            {@const yearShortStr = String(period.year).slice(-2)}

            <button
              onclick={() => scrollToPeriod(period.year, period.month)}
              onmouseenter={() => hoveredPeriod = { year: period.year, month: period.month, monthName: period.monthName }}
              onmouseleave={() => hoveredPeriod = null}
              class="timeline-month-marker absolute top-7 transform -translate-x-1/2 group cursor-pointer z-20"
              style="left: {period.position}%"
              aria-label="Jump to {period.monthName} {period.year}"
            >
              <!-- Month dot with dimmed/active states -->
              <div class="relative">
                <!-- Dimmed by default, highlighted when active or hovered -->
                <div
                  class="w-2.5 h-2.5 rounded-full transition-all duration-200"
                  class:bg-charcoal-600={!isActiveMonth}
                  class:opacity-40={!isActiveMonth}
                  class:bg-gold-500={isActiveMonth}
                  class:opacity-100={isActiveMonth}
                  class:shadow-lg={isActiveMonth}
                  class:ring-1={isActiveMonth}
                  class:ring-gold-600={isActiveMonth}
                  class:group-hover:bg-gold-400={true}
                  class:group-hover:opacity-100={true}
                  class:group-hover:scale-150={true}
                  class:scale-125={isActiveMonth}
                ></div>

                <!-- Hover tooltip with MM/YY format -->
                {#if hoveredPeriod && hoveredPeriod.year === period.year && hoveredPeriod.month === period.month}
                  <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 px-3 py-1.5 bg-charcoal-900 border border-gold-500/30 rounded shadow-xl whitespace-nowrap z-50 backdrop-blur-sm">
                    <Typography variant="caption" class="text-white text-xs font-medium">
                      {monthNumStr}/{yearShortStr}
                    </Typography>
                    <Typography variant="caption" class="text-charcoal-400 text-[10px]">
                      {period.monthName} {period.year}
                    </Typography>
                    <div class="absolute top-full left-1/2 transform -translate-x-1/2 -mt-px">
                      <div class="border-4 border-transparent border-t-charcoal-900"></div>
                    </div>
                  </div>
                {/if}
              </div>
            </button>
          {/each}

          <!-- Progress indicator (current visible month position, desktop only) -->
          {#if currentVisibleMonth}
            <div
              class="absolute top-7 transform -translate-x-1/2 z-10 pointer-events-none transition-all duration-300"
              style="left: {progressPosition}%"
            >
              <div class="w-3 h-3 rounded-full bg-white border-2 border-gold-500 shadow-lg"></div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- Timeline Content -->
  <div class="timeline-content">
    {#each periodsByYear as yearGroup}
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
      {#each yearGroup.periods as entry}
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
            <!-- Diversity Indicators -->
            {#if entry.featuredPhotos && entry.featuredPhotos.length > 0}
              {@const diversity = getContentDiversity(entry.featuredPhotos)}
              {#if diversity.sportCount > 1 || diversity.categoryCount > 1}
                <div class="flex items-center gap-3 mb-4 text-xs text-charcoal-400">
                  {#if diversity.sportCount > 1}
                    <span class="flex items-center gap-1">
                      <span class="w-2 h-2 bg-gold-500 rounded-full"></span>
                      {diversity.sportCount} sports
                    </span>
                  {/if}
				  {#if diversity.categoryCount > 1}
					<span class="flex items-center gap-1">
					  <span class="w-2 h-2 bg-blue-500 rounded-full"></span>
					  {diversity.categoryCount} categories
					</span>
				  {/if}
				</div>
			  {/if}
            {/if}

            <!-- Photo Grid or Empty State -->
            {#if getFeaturedPhotos(entry.featuredPhotos).length > 0}
              {@const featuredPhotos = getFeaturedPhotos(entry.featuredPhotos)}
              <div class="timeline-photo-grid">
                {#each featuredPhotos as photo, photoIndex (photo.id)}
                  <PhotoCard
                    {photo}
                    index={photoIndex}
							favoriteSurface="timeline"
                    onclick={handlePhotoClick}
                  />
                {/each}
              </div>
            {:else}
              <!-- Empty State for periods with no featured photos -->
              <div class="timeline-empty">
                <Calendar class="w-10 h-10 text-charcoal-600 mx-auto mb-3" />
                <Typography variant="body" class="text-charcoal-400 mb-1">
                  Featured photos coming soon
                </Typography>
                <Typography variant="caption" class="text-charcoal-400">
                  {entry.photoCount} photos available • Processing in progress
                </Typography>
              </div>
            {/if}

            <!-- View All Link -->
            <a
              href="{base}/photos/{entry.year}/{entry.month}"
              class="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300 transition-colors text-sm"
            >
              <Typography variant="body" class="font-medium">
                View gallery
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
  .timeline-shell { width: min(1320px, calc(100% - 64px)); margin-inline: auto; color: var(--color-charcoal-50); }
  .timeline-shell [data-timeline-nav] { top: var(--gallery-header-height); height: 125px; background: var(--color-charcoal-950); backdrop-filter: none; box-shadow: none; border-color: var(--color-charcoal-800); }
  .timeline-shell [data-timeline-nav] > div { padding-inline: 30px; }
  .timeline-shell [data-timeline-nav] button { min-width: 44px; min-height: 44px; }
  .timeline-shell [data-timeline-nav] .timeline-month-marker { top: 20px; display: flex; align-items: center; justify-content: center; min-width: 24px; min-height: 24px; }
  .timeline-shell [data-timeline-nav] button:focus-visible { outline: 2px solid var(--color-gold-500); outline-offset: 3px; }
  .timeline-content { padding-block: 28px 80px; }
  .year-heading { position: sticky; top: calc(var(--gallery-header-height) + 125px); z-index: 30; margin-block: 18px 28px; background: var(--color-charcoal-950); }
  .year-heading__inner { padding-bottom: 16px; border-bottom: 1px solid var(--color-charcoal-800); }
  .year-heading :global(h2) { font-family: Montserrat, sans-serif; font-size: 24px; }
  .month-section { margin-bottom: 48px; }
  .month-heading { margin-bottom: 18px; }
  .month-heading :global(h3) { font-family: Montserrat, sans-serif; font-size: 20px; }
  .timeline-photo-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-bottom: 18px; }
  .timeline-photo-grid :global(.photo-card) { border: 0; border-radius: 0; transform: none; box-shadow: none; }
  .timeline-empty { margin-bottom: 18px; padding: 28px; border-block: 1px solid var(--color-charcoal-800); text-align: center; }
  @media (max-width: 900px) { .timeline-photo-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 640px) {
    .timeline-shell { width: calc(100% - 40px); }
    .timeline-shell [data-timeline-nav] > div { padding-inline: 26px; }
    .timeline-shell [data-timeline-nav] button[aria-label^="Jump to "] { left: var(--phone-position) !important; }
    .timeline-photo-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
  }
</style>
