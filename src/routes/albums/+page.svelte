<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import { FolderOpen, ChevronLeft, ChevronRight } from 'lucide-svelte';
	import { SIZES_PRESETS } from '$lib/photo-utils';
	import { cfImageUrl, cfSrcSet, hasCFImage } from '$lib/utils/cloudflare-images';
	import { createAlbumSlug } from '$lib/utils';
	import Typography from '$lib/components/ui/Typography.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import AlbumCard from '$lib/components/gallery/AlbumCard.svelte';
	import type { PageData } from './$types';

	interface Album {
		albumKey: string;
		albumName: string;
		photoCount: number;
		primarySport?: string;
		primaryCategory?: string;
		dateRange?: {
			earliest: string | null;
			latest: string | null;
		};
	}

	// Svelte 5 Runes: $props to receive server data
	let { data }: { data: PageData } = $props();
	let resultSetId = $state(crypto.randomUUID());
	$effect(() => { data.currentPage; data.query; data.selectedSport; data.selectedYear; resultSetId = crypto.randomUUID(); });

	// Server-driven event discovery: search runs across ALL albums (not just the loaded page),
	// plus sport + year facets. data.albums is already filtered server-side.
	let searchInput = $state(data.query ?? '');
	const displayAlbums = $derived(data.albums);
	const hasActiveFilters = $derived(!!(data.query || data.selectedSport || data.selectedYear));

	function applyParam(key: string, value: string) {
		const url = new URL($page.url);
		if (value) url.searchParams.set(key, value);
		else url.searchParams.delete(key);
		url.searchParams.delete('page'); // any filter change resets to page 1
		goto(url.toString());
	}
	function handleSearch(e: SubmitEvent) {
		e.preventDefault();
		applyParam('q', searchInput.trim());
	}
	function clearFilters() {
		searchInput = '';
		const url = new URL($page.url);
		['q', 'sport', 'year', 'page'].forEach((k) => url.searchParams.delete(k));
		goto(url.toString());
	}

	function handleAlbumClick(album: Album) {
		const slug = createAlbumSlug(album.albumName, album.albumKey);
		goto(`${base}/albums/${slug}`);
	}

	// Pagination helpers
	function goToPage(pageNum: number) {
		const url = new URL($page.url);
		url.searchParams.set('page', pageNum.toString());
		goto(url.toString());
	}

	function changeSortOrder(sort: 'name' | 'date' | 'count') {
		const url = new URL($page.url);
		url.searchParams.set('sort', sort);
		url.searchParams.set('page', '1'); // Reset to page 1 when changing sort
		goto(url.toString());
	}

	// Keyboard shortcuts for pagination
	function handleKeyDown(event: KeyboardEvent) {
		// Only handle if not typing in search box
		if (event.target instanceof HTMLInputElement) return;

		if (event.key === 'ArrowLeft' && data.currentPage > 1) {
			event.preventDefault();
			goToPage(data.currentPage - 1);
		} else if (event.key === 'ArrowRight' && data.currentPage < data.totalPages) {
			event.preventDefault();
			goToPage(data.currentPage + 1);
		}
	}

	// Format date range for display
	function formatDateRange(dateRange?: { earliest: string | null; latest: string | null }) {
		if (!dateRange || (!dateRange.earliest && !dateRange.latest)) return null;

		const earliest = dateRange.earliest ? new Date(dateRange.earliest).getFullYear() : null;
		const latest = dateRange.latest ? new Date(dateRange.latest).getFullYear() : null;

		if (earliest && latest) {
			return earliest === latest ? `${earliest}` : `${earliest} - ${latest}`;
		}
		return earliest || latest || null;
	}
</script>

<!-- Preload album cover images for faster LCP -->
<svelte:head>

	<!-- Preload first album cover for LCP — must match what AlbumCard actually loads:
	     cfImageUrl(id, 'medium') for CF covers, else the raw cover URL. The old block emitted
	     no href and only set imagesrcset for CF covers, so it preloaded nothing. -->
	{#if data.albums[0] && (hasCFImage(data.albums[0].coverCfImageId) || data.albums[0].coverImageUrl)}
		{@const firstAlbum = data.albums[0]}
		<link
			rel="preload"
			as="image"
			href={hasCFImage(firstAlbum.coverCfImageId)
				? cfImageUrl(firstAlbum.coverCfImageId, 'medium')
				: firstAlbum.coverImageUrl}
			imagesrcset={hasCFImage(firstAlbum.coverCfImageId) ? cfSrcSet(firstAlbum.coverCfImageId) : undefined}
			imagesizes={hasCFImage(firstAlbum.coverCfImageId) ? SIZES_PRESETS.albumCard : undefined}
			fetchpriority="high"
		/>
	{/if}
</svelte:head>

<svelte:window onkeydown={handleKeyDown} />


<div class="events-page animate-fade-in">
	<header class="events-opening">
		<p class="events-eyebrow">Browse the archive</p>
		<div class="events-title-row">
			<div>
				<h1>Events</h1>
				<p class="events-deck">Find a match, team, or date, then open the full gallery.</p>
			</div>
			<p class="events-count">{data.totalAlbums.toLocaleString()} {data.totalAlbums === 1 ? 'event' : 'events'}</p>
		</div>
	</header>

	<section class="events-tools" aria-label="Find an event">
		<form class="events-search" onsubmit={handleSearch}>
			<label for="event-search">Find an event</label>
			<input
				id="event-search"
				type="search"
				placeholder="Team or event name"
				bind:value={searchInput}
				aria-label="Search albums by team or event name"
			/>
		</form>
		<div class="events-filters">
					<select
						value={data.selectedSport}
						onchange={(e) => applyParam('sport', e.currentTarget.value)}
						class="capitalize"
						aria-label="Filter by sport"
					>
						<option value="">All sports</option>
						{#each data.availableSports as s}
							<option value={s}>{s}</option>
						{/each}
					</select>
					<select
						value={data.selectedYear}
						onchange={(e) => applyParam('year', e.currentTarget.value)}
						aria-label="Filter by year"
					>
						<option value="">All years</option>
						{#each data.availableYears as y}
							<option value={y}>{y}</option>
						{/each}
					</select>
					<select value={data.sortBy} onchange={(e) => changeSortOrder(e.currentTarget.value as any)} aria-label="Sort events">
						<option value="count">Most photos</option>
						<option value="name">Name A–Z</option>
						<option value="date">Latest photos</option>
					</select>
					{#if hasActiveFilters}
						<button type="button" onclick={clearFilters}>Clear filters</button>
					{/if}
		</div>
	</section>

	<!-- Album Grid Content -->
	<div class="events-results">

		<!-- Discovery results indicator -->
		{#if hasActiveFilters}
			<div class="mb-4">
				<Typography variant="caption" class="text-charcoal-400 text-xs">
					{data.totalAlbums.toLocaleString()} event {data.totalAlbums === 1 ? 'gallery' : 'galleries'}{data.query ? ` matching “${data.query}”` : ''}{data.selectedSport ? ` · ${data.selectedSport}` : ''}{data.selectedYear ? ` · ${data.selectedYear}` : ''}
				</Typography>
			</div>
		{/if}

		<!-- Album Grid -->
		{#if displayAlbums.length > 0}
			<div class="events-grid">
				{#each displayAlbums as album, index}
					<div>
						<AlbumCard {album} {index} {resultSetId} onclick={handleAlbumClick} priority={index < 4} experiment={index === 0 ? data.experiment : null} />
						<!-- Date Range Display -->
						{#if album.dateRange}
							{@const dateRange = formatDateRange(album.dateRange)}
							{#if dateRange}
								<Typography variant="caption" class="text-charcoal-400 text-xs mt-1 block">
									{dateRange}
								</Typography>
							{/if}
						{/if}
					</div>
				{/each}
			</div>

			<!-- Pagination Controls (server-side; works with active filters) -->
			{#if data.totalPages > 1}
				<div class="mt-8 flex items-center justify-center gap-2">
					<!-- Previous Button -->
					<button
						onclick={() => goToPage(data.currentPage - 1)}
						disabled={data.currentPage === 1}
						class="px-4 py-2 rounded-lg bg-charcoal-900 border border-charcoal-800 hover:border-gold-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
						aria-label="Previous page"
					>
						<ChevronLeft class="w-4 h-4" />
						<span class="hidden sm:inline">Previous</span>
					</button>

					<!-- Page Numbers -->
					<div class="flex items-center gap-2">
						{#each Array.from({ length: Math.min(5, data.totalPages) }, (_, i) => {
							const pageNum = Math.max(1, Math.min(data.totalPages - 4, data.currentPage - 2)) + i;
							return pageNum;
						}) as pageNum}
							{#if pageNum <= data.totalPages}
								<button
									onclick={() => goToPage(pageNum)}
									class="w-10 h-10 rounded-lg {pageNum === data.currentPage
										? 'bg-gold-500 text-charcoal-950 font-semibold'
										: 'bg-charcoal-900 border border-charcoal-800 hover:border-gold-500'} transition-colors"
									aria-label="Go to page {pageNum}"
									aria-current={pageNum === data.currentPage ? 'page' : undefined}
								>
									{pageNum}
								</button>
							{/if}
						{/each}
					</div>

					<!-- Next Button -->
					<button
						onclick={() => goToPage(data.currentPage + 1)}
						disabled={data.currentPage === data.totalPages}
						class="px-4 py-2 rounded-lg bg-charcoal-900 border border-charcoal-800 hover:border-gold-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
						aria-label="Next page"
					>
						<span class="hidden sm:inline">Next</span>
						<ChevronRight class="w-4 h-4" />
					</button>
				</div>

				<!-- Page Info & Keyboard Hint -->
				<div class="mt-4 text-center">
					<Typography variant="caption" class="text-charcoal-400 text-xs">
						Page {data.currentPage} of {data.totalPages} • {data.totalAlbums.toLocaleString()} total events
					</Typography>
					<Typography variant="caption" class="text-charcoal-400 text-xs mt-1 block">
						Use ← → arrow keys to navigate
					</Typography>
				</div>
			{/if}
		{:else}
			<!-- Simple Empty State (Browse Mode) -->
				<div style="animation: fade-in 0.3s ease-out forwards">
					<Card padding="lg" class="text-center">
						<FolderOpen class="w-16 h-16 text-charcoal-600 mx-auto mb-4" aria-hidden="true" />
						<Typography variant="h3" class="mb-2">No albums found</Typography>
						<Typography variant="body" class="text-charcoal-400 text-sm">
							{hasActiveFilters ? 'Try adjusting your search or filters' : 'No albums available'}
						</Typography>
					</Card>
				</div>
		{/if}
	</div>
</div>

<style>
	/* PERFORMANCE: CSS animation instead of JS Motion for better render performance */
	@keyframes fade-in {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-fade-in {
		animation: fade-in 0.3s ease-out forwards;
	}
	.events-page { color: var(--color-charcoal-50); }
	.events-opening, .events-tools, .events-results { width: min(1320px, calc(100% - 64px)); margin-inline: auto; }
	.events-opening { padding-block: 40px 28px; }
	.events-eyebrow { margin-bottom: 14px; color: var(--color-gold-500); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
	.events-title-row { display: flex; align-items: end; justify-content: space-between; gap: 24px; }
	.events-title-row h1 { margin: 0; font-family: Montserrat, sans-serif; font-size: clamp(32px, 3.2vw, 46px); font-weight: 750; letter-spacing: -.035em; line-height: 1.08; }
	.events-deck { max-width: 560px; margin-top: 12px; color: var(--color-charcoal-300); font-size: 16px; }
	.events-count { color: var(--color-charcoal-300); font-size: 14px; white-space: nowrap; }
	.events-tools { position: sticky; top: var(--gallery-header-height); z-index: 30; background: var(--color-charcoal-950); display: grid; grid-template-columns: minmax(260px, 1fr) auto; align-items: end; gap: 16px; padding-block: 18px; border-block: 1px solid var(--color-charcoal-800); }
	.events-search label { display: block; margin-bottom: 8px; font-size: 14px; font-weight: 650; }
	.events-search input, .events-filters select, .events-filters button { min-height: 44px; border: 1px solid var(--color-charcoal-700); border-radius: 0; background: var(--color-charcoal-950); color: var(--color-charcoal-50); font-size: 14px; }
	.events-search input { width: 100%; padding: 10px 14px; font-size: 16px; }
	.events-filters { display: flex; flex-wrap: wrap; gap: 8px; }
	.events-filters select, .events-filters button { padding: 9px 12px; }
	.events-filters button { color: var(--color-charcoal-300); cursor: pointer; }
	.events-search input:focus-visible, .events-filters select:focus-visible, .events-filters button:focus-visible { outline: 2px solid var(--color-gold-500); outline-offset: 3px; }
	.events-results { padding-block: 24px 72px; }
	.events-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
	@media (max-width: 980px) { .events-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	@media (max-width: 720px) {
		.events-opening, .events-tools, .events-results { width: calc(100% - 40px); }
		.events-opening { padding-block: 24px 22px; }
		.events-title-row { align-items: start; flex-direction: column; gap: 12px; }
		.events-tools { grid-template-columns: 1fr; gap: 8px; padding-block: 8px; }
		.events-filters { display: flex; flex-wrap: nowrap; overflow-x: auto; padding: 3px; }
		.events-filters select, .events-filters button { flex: 0 0 auto; width: auto; min-width: 0; }
		.events-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
	}
	@media (max-width: 480px) { .events-grid { grid-template-columns: minmax(0, 1fr); gap: 14px; } }

	/* Reduce motion for accessibility */
	@media (prefers-reduced-motion: reduce) {
		.animate-fade-in {
			animation: none;
		}
	}
</style>
