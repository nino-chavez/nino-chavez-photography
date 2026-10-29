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
  import { ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-svelte';
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


<div class="month-page">
  <header class="month-opening">
    <!-- Breadcrumb -->
    <div class="month-back">
      <a
        href="{base}/timeline"
        class="month-back__link"
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
    <div class="month-title-row">
		<div>
		  <p class="month-eyebrow">By date</p>
		  <Typography variant="h1" class="month-title">
			{data.monthName} {data.year}
		  </Typography>
		  <Typography variant="body" class="month-count">
			{data.photoCount.toLocaleString()} {data.photoCount === 1 ? 'photo' : 'photos'}
		  </Typography>
		</div>

	  <!-- Sort Dropdown -->
	  <div class="month-sort">
		<label for="month-sort">Sort photographs</label>
		<select
		  id="month-sort"
		  value={data.sortBy}
		  onchange={(e) => handleSortChange(e.currentTarget.value as any)}
		>
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="quality">Best Quality</option>
        </select>
      </div>
	</div>
  </header>

  <main class="month-results">
    <nav class="month-navigation" aria-label="Adjacent months">
      {#if data.prevMonth}
        <button
          onclick={() => navigateToMonth(data.prevMonth!.year, data.prevMonth!.month)}
		  class="month-navigation__button"
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
		  class="month-navigation__button"
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
    </nav>

    <!-- Photo Grid -->
    <PhotoGrid photos={data.photos} loading={false} favoriteSurface="archive_month" onclick={handlePhotoClick} />

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
    <div class="month-return">
      <a
        href="{base}/timeline"
		class="month-return__link"
      >
        <ArrowLeft class="w-4 h-4" />
        Back to Timeline
      </a>
    </div>
  </main>
</div>

<style>
  .month-page { min-height: 100vh; background: var(--color-charcoal-950); color: var(--color-charcoal-50); }
  .month-opening, .month-results { width: min(1320px, calc(100% - 64px)); margin-inline: auto; }
  .month-opening { padding-block: 20px 28px; }
  .month-back { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; color: var(--color-charcoal-400); font-size: 14px; }
  .month-back__link { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; }
  .month-back__link:hover { color: var(--color-gold-400); }
  .month-title-row { display: flex; align-items: end; justify-content: space-between; gap: 24px; }
  .month-eyebrow { margin-bottom: 12px; color: var(--color-gold-500); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .month-title-row :global(.month-title) { color: white; font-family: Montserrat, sans-serif; font-size: clamp(32px, 3.2vw, 46px); font-weight: 750; line-height: 1.08; letter-spacing: -.035em; }
  .month-title-row :global(.month-count) { margin-top: 12px; color: var(--color-charcoal-300); font-size: 14px; }
  .month-sort label { display: block; margin-bottom: 7px; color: var(--color-charcoal-300); font-size: 12px; }
  .month-sort select { min-height: 44px; padding: 9px 12px; border: 1px solid var(--color-charcoal-700); border-radius: 0; background: var(--color-charcoal-950); color: var(--color-charcoal-50); }
  .month-sort select:focus-visible { outline: 2px solid var(--color-gold-500); outline-offset: 3px; }
  .month-results { padding-block: 20px 72px; border-top: 1px solid var(--color-charcoal-800); }
  .month-navigation { display: flex; align-items: stretch; justify-content: space-between; gap: 12px; margin-bottom: 24px; }
  .month-navigation__button { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 8px 12px; border: 1px solid var(--color-charcoal-700); border-radius: 0; color: var(--color-charcoal-200); text-align: left; }
  .month-navigation__button:hover { border-color: var(--color-gold-500); }
  .month-return { display: flex; justify-content: center; margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--color-charcoal-800); }
  .month-return__link { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; color: var(--color-charcoal-200); }
  .month-return__link:hover { color: var(--color-gold-400); }
  @media (max-width: 640px) {
    .month-opening, .month-results { width: calc(100% - 40px); }
    .month-title-row { align-items: stretch; flex-direction: column; }
    .month-sort select { width: 100%; }
    .month-navigation__button { max-width: 48%; padding: 8px; }
  }
</style>
