<!--
  Month Detail Page - View all photos from a specific month

  Route: /photos/[year]/[month]
  Example: /photos/2025/10 → All photos from October 2025

  Features:
  - Full photo grid for the month
  - Prev/Next month navigation
  - Breadcrumb back to timeline
  - Sorting options
  - Maintains chronological context
-->

<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { Calendar, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-svelte';
  import PhotoGrid from '$lib/components/gallery/PhotoGrid.svelte';
  import Lightbox from '$lib/components/gallery/Lightbox.svelte';
  import Pagination from '$lib/components/ui/Pagination.svelte';
  import Typography from '$lib/components/ui/Typography.svelte';
  import type { Photo } from '$types/photo';

  interface Props {
    data: {
      photos: Photo[];
      year: number;
      month: number;
      monthName: string;
      prevMonth: { year: number; month: number; monthName: string; photoCount: number } | null;
      nextMonth: { year: number; month: number; monthName: string; photoCount: number } | null;
      sortBy: 'newest' | 'oldest' | 'quality';
      photoCount: number;
      currentPage: number;
      totalPages: number;
      pageSize: number;
    };
  }

  let { data }: Props = $props();

  // Lightbox state - consistent with other pages
  let lightboxOpen = $state(false);
  let selectedPhotoIndex = $state(0);

  // The grid + Pagination stay bound to exactly one server page (`data.photos`) — same
  // reasoning as the share/collections pages: a numbered pager and a growing grid don't mix.
  // Only the lightbox gets its own growing list, seeded from this page.
  //
  // Unlike album/share/collections (seeded ONCE via `untrack`), this page reacts to `data`
  // itself: Prev/Next month and the sort dropdown navigate client-side (`goto`, no full
  // reload) while staying on the SAME `+page.svelte` instance, so a one-time seed would keep
  // showing the previous month's (or previous sort's) photos in the lightbox after navigating.
  let loadedPhotos = $state<Photo[]>([]);
  let nextPage = $state(1);
  let loadingMore = $state(false);
  // Plain variable, not $state — read/written only inside loadMore's own async flow. Bumped
  // every reseed so a page-N fetch still in flight when the visitor navigates away (Prev/Next
  // month, a sort change, or the pager, all before the fetch returns) can tell it's stale and
  // drop its result instead of appending October's photos onto November's freshly-seeded list.
  let loadGeneration = 0;
  $effect(() => {
    loadedPhotos = data.photos;
    nextPage = data.currentPage + 1;
    loadingMore = false;
    loadGeneration++;
  });

  const precedingCount = $derived((data.currentPage - 1) * data.pageSize);
  const hasMore = $derived(precedingCount + loadedPhotos.length < data.photoCount);

  // Handle photo click - open lightbox instead of navigating
  // `id`, not `image_key` — a month spans every album, and image_key values repeat across
  // different albums' camera rolls (confirmed: 120 values collide table-wide).
  function handlePhotoClick(photo: Photo) {
    const index = loadedPhotos.findIndex((p) => p.id === photo.id);
    if (index !== -1) {
      selectedPhotoIndex = index;
      lightboxOpen = true;
    }
  }

  // Handle lightbox navigation
  function handleLightboxNavigate(newIndex: number) {
    selectedPhotoIndex = newIndex;
  }

  async function fetchPage(pageNum: number): Promise<Photo[]> {
    const res = await fetch(
      `${base}/api/month-photos?year=${data.year}&month=${data.month}&sort=${data.sortBy}&page=${pageNum}`
    );
    if (!res.ok) return [];
    const { photos } = (await res.json()) as { photos: Photo[] };
    return photos ?? [];
  }

  async function loadMore(): Promise<void> {
    if (loadingMore || !hasMore) return;
    loadingMore = true;
    const gen = loadGeneration;
    const pageToFetch = nextPage;
    try {
      const photos = await fetchPage(pageToFetch);
      if (gen !== loadGeneration) return; // reseeded (month/sort/page changed) — drop it
      if (photos.length > 0) {
        loadedPhotos = [...loadedPhotos, ...photos];
        nextPage = pageToFetch + 1;
      }
    } catch (err) {
      console.error('[month] loadMore failed', err);
    } finally {
      if (gen === loadGeneration) loadingMore = false;
    }
  }

  // Handle month navigation
  function navigateToMonth(year: number, month: number) {
    goto(`${base}/photos/${year}/${month}`);
  }

  // Handle sort change (resets to page 1)
  function handleSortChange(newSort: 'newest' | 'oldest' | 'quality') {
    const url = new URL($page.url);
    url.searchParams.set('sort', newSort);
    url.searchParams.delete('page');
    goto(url.toString());
  }

  // Handle pagination
  function handlePageChange(newPage: number) {
    const url = new URL($page.url);
    if (newPage === 1) {
      url.searchParams.delete('page');
    } else {
      url.searchParams.set('page', String(newPage));
    }
    goto(url.toString());
  }
</script>


<div class="min-h-screen bg-charcoal-950">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Breadcrumb -->
    <div class="flex items-center gap-2 text-sm text-charcoal-400 mb-6">
      <a
        href="{base}/timeline"
        class="flex items-center gap-1 hover:text-gold-400 transition-colors"
      >
        <ArrowLeft class="w-4 h-4" />
        Timeline
      </a>
      <span>/</span>
      <span class="text-charcoal-300">{data.year}</span>
      <span>/</span>
      <span class="text-white">{data.monthName}</span>
    </div>

    <!-- Month Header -->
    <div class="flex flex-wrap items-center justify-between gap-3 mb-6 md:mb-8 pb-4 md:pb-6 border-b border-charcoal-800">
      <div class="flex items-center gap-3 md:gap-4">
        <!-- Calendar Icon -->
        <div class="h-10 w-10 md:h-16 md:w-16 rounded-full bg-gold-500 flex items-center justify-center shadow-lg">
          <Calendar class="w-5 h-5 md:w-8 md:h-8 text-charcoal-950" />
        </div>

        <!-- Title -->
        <div>
          <Typography variant="h1" class="text-white mb-0.5 md:mb-1 text-xl md:text-3xl">
            {data.monthName} {data.year}
          </Typography>
          <Typography variant="body" class="text-charcoal-400 text-sm">
            {data.photoCount.toLocaleString()} {data.photoCount === 1 ? 'photo' : 'photos'}
          </Typography>
        </div>
      </div>

      <!-- Sort Dropdown -->
      <div class="flex items-center gap-2">
        <select
          value={data.sortBy}
          onchange={(e) => handleSortChange(e.currentTarget.value as any)}
          class="px-3 py-2 bg-charcoal-800 text-charcoal-200 border border-charcoal-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="quality">Best Quality</option>
        </select>
      </div>
    </div>

    <!-- Month Navigation -->
    <div class="flex items-center justify-between mb-6 md:mb-8">
      {#if data.prevMonth}
        <button
          onclick={() => navigateToMonth(data.prevMonth!.year, data.prevMonth!.month)}
          class="flex items-center gap-2 px-4 py-2.5 bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-200 rounded-lg transition-colors"
        >
          <ChevronLeft class="w-4 h-4" />
          <div class="text-left">
            <div class="text-xs text-charcoal-400">Previous</div>
            <div class="text-sm font-medium">{data.prevMonth.monthName} {data.prevMonth.year}</div>
          </div>
        </button>
      {:else}
        <div></div>
      {/if}

      {#if data.nextMonth}
        <button
          onclick={() => navigateToMonth(data.nextMonth!.year, data.nextMonth!.month)}
          class="flex items-center gap-2 px-4 py-2.5 bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-200 rounded-lg transition-colors"
        >
          <div class="text-right">
            <div class="text-xs text-charcoal-400">Next</div>
            <div class="text-sm font-medium">{data.nextMonth.monthName} {data.nextMonth.year}</div>
          </div>
          <ChevronRight class="w-4 h-4" />
        </button>
      {:else}
        <div></div>
      {/if}
    </div>

    <!-- Photo Grid -->
    <PhotoGrid photos={data.photos} loading={false} onclick={handlePhotoClick} />

    <!-- Pagination -->
    <div class="mt-8">
      <Pagination
        currentPage={data.currentPage}
        totalCount={data.photoCount}
        pageSize={data.pageSize}
        onPageChange={handlePageChange}
      />
    </div>

    <!-- Lightbox - consistent with other pages. Its own growing list past the SSR page;
         the grid/pager above are untouched. -->
    <Lightbox
      bind:open={lightboxOpen}
      photo={loadedPhotos[selectedPhotoIndex] || null}
      photos={loadedPhotos}
      currentIndex={selectedPhotoIndex}
      onNavigate={handleLightboxNavigate}
      hasMore={hasMore}
      onLoadMore={loadMore}
      loadingMore={loadingMore}
      totalCount={data.photoCount}
      indexOffset={precedingCount}
      viewSource="timeline"
    />

    <!-- Bottom Navigation -->
    <div class="flex items-center justify-center mt-12 pt-8 border-t border-charcoal-800">
      <a
        href="{base}/timeline"
        class="inline-flex items-center gap-2 px-6 py-3 bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-200 rounded-lg transition-colors"
      >
        <ArrowLeft class="w-4 h-4" />
        Back to Timeline
      </a>
    </div>
  </div>
</div>
