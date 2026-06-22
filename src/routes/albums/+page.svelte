<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import { FolderOpen, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-svelte';
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
	<title>Albums | Nino Chavez Photography</title>
	<meta name="description" content="Browse {data.totalAlbums} volleyball photography albums. View complete event coverage from tournaments and matches." />

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

<!-- Minimal Header - Content First Design (Browse Mode: Traditionalist) -->
<!-- PERFORMANCE: Removed Motion wrapper - using CSS animations instead for better render performance -->
<div class="animate-fade-in">
	<div class="sticky top-0 z-20 bg-charcoal-950/95 backdrop-blur-sm border-b border-charcoal-800/50">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
			<!-- Single Row: Title + Count + Search (Explore Page Pattern) -->
			<div class="flex items-center justify-between gap-4">
				<div class="flex items-center gap-2">
					<Typography variant="h1" class="text-xl lg:text-2xl">Albums</Typography>
					<Typography variant="caption" class="text-charcoal-400 text-xs">
						{data.totalAlbums.toLocaleString()}
					</Typography>
				</div>

				<!-- Sort Dropdown -->
				<div class="hidden sm:flex items-center gap-2">
					<ArrowUpDown class="w-4 h-4 text-charcoal-400" />
					<select
						value={data.sortBy}
						onchange={(e) => changeSortOrder(e.currentTarget.value as any)}
						class="px-3 py-1.5 text-sm rounded-lg bg-charcoal-900 border border-charcoal-800 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/50 transition-colors text-white"
						aria-label="Sort albums"
					>
						<option value="count">Most Photos</option>
						<option value="name">Name (A-Z)</option>
						<option value="date">Latest Photos</option>
					</select>
				</div>

				<!-- Event discovery: search (all albums) + sport + year -->
				<div class="flex flex-1 max-w-2xl items-center gap-2 justify-end">
					<select
						value={data.selectedSport}
						onchange={(e) => applyParam('sport', e.currentTarget.value)}
						class="hidden md:block px-3 py-2 text-sm rounded-lg bg-charcoal-900 border border-charcoal-800 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/50 transition-colors text-white capitalize"
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
						class="hidden md:block px-3 py-2 text-sm rounded-lg bg-charcoal-900 border border-charcoal-800 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/50 transition-colors text-white"
						aria-label="Filter by year"
					>
						<option value="">All years</option>
						{#each data.availableYears as y}
							<option value={y}>{y}</option>
						{/each}
					</select>
					<form class="flex-1 max-w-md" onsubmit={handleSearch}>
						<input
							type="search"
							placeholder="Search team or event…"
							bind:value={searchInput}
							class="w-full px-4 py-2 text-sm rounded-lg bg-charcoal-900 border border-charcoal-800 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/50 transition-colors text-white placeholder-charcoal-400"
							aria-label="Search albums by team or event name"
						/>
					</form>
					{#if hasActiveFilters}
						<button type="button" onclick={clearFilters} class="px-3 py-2 text-sm rounded-lg bg-charcoal-900 border border-charcoal-800 hover:border-gold-500 text-charcoal-300 transition-colors whitespace-nowrap">Clear</button>
					{/if}
				</div>
			</div>

			<!-- Mobile Sort + discovery facets -->
			<div class="md:hidden mt-3 grid grid-cols-3 gap-2">
				<select
					value={data.sortBy}
					onchange={(e) => changeSortOrder(e.currentTarget.value as any)}
					class="px-2 py-1.5 text-sm rounded-lg bg-charcoal-900 border border-charcoal-800 focus:border-gold-500 transition-colors text-white"
					aria-label="Sort albums"
				>
					<option value="count">Most Photos</option>
					<option value="name">Name (A-Z)</option>
					<option value="date">Latest</option>
				</select>
				<select
					value={data.selectedSport}
					onchange={(e) => applyParam('sport', e.currentTarget.value)}
					class="px-2 py-1.5 text-sm rounded-lg bg-charcoal-900 border border-charcoal-800 focus:border-gold-500 transition-colors text-white capitalize"
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
					class="px-2 py-1.5 text-sm rounded-lg bg-charcoal-900 border border-charcoal-800 focus:border-gold-500 transition-colors text-white"
					aria-label="Filter by year"
				>
					<option value="">All years</option>
					{#each data.availableYears as y}
						<option value={y}>{y}</option>
					{/each}
				</select>
			</div>
		</div>
	</div>

	<!-- Album Grid Content -->
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

		<!-- Discovery results indicator -->
		{#if hasActiveFilters}
			<div class="mb-4">
				<Typography variant="caption" class="text-charcoal-400 text-xs">
					{data.totalAlbums.toLocaleString()} {data.totalAlbums === 1 ? 'album' : 'albums'}{data.query ? ` matching “${data.query}”` : ''}{data.selectedSport ? ` · ${data.selectedSport}` : ''}{data.selectedYear ? ` · ${data.selectedYear}` : ''}
				</Typography>
			</div>
		{/if}

		<!-- Album Grid -->
		{#if displayAlbums.length > 0}
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
				{#each displayAlbums as album, index}
					<div>
						<AlbumCard {album} {index} onclick={handleAlbumClick} priority={index < 4} />
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
						Page {data.currentPage} of {data.totalPages} • {data.totalAlbums.toLocaleString()} total albums
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

	/* Reduce motion for accessibility */
	@media (prefers-reduced-motion: reduce) {
		.animate-fade-in {
			animation: none;
		}
	}
</style>
