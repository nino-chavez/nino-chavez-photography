<script lang="ts">
	import { goto } from '$app/navigation';
	import { page, navigating } from '$app/stores';
	import { untrack } from 'svelte';
	import { Camera, X, Filter, Loader2, Search, Sparkles } from 'lucide-svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import { filterNotifications } from '$lib/stores/filter-notifications.svelte';
	import Typography from '$lib/components/ui/Typography.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import PaginationHybrid from '$lib/components/ui/PaginationHybrid.svelte';
	import PhotoCard from '$lib/components/gallery/PhotoCard.svelte';
	import PhotoGridSkeleton from '$lib/components/ui/PhotoGridSkeleton.svelte';
	import Lightbox from '$lib/components/gallery/Lightbox.svelte';
	import VisualDataLegend from '$lib/components/ui/VisualDataLegend.svelte';
	import FilterChip from '$lib/components/filters/FilterChip.svelte';
	import ConsolidatedFilter from '$lib/components/filters/ConsolidatedFilter.svelte';
	// Lazy-loaded components (heavy filters only loaded when needed)
	import FilterSidebarDrawer from '$lib/components/filters/FilterSidebarDrawer.svelte';
	import FilterShareButton from '$lib/components/filters/FilterShareButton.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import { filterHistory, type FilterHistoryEntry } from '$lib/stores/filter-history.svelte';
	import { filterAnalytics } from '$lib/stores/filter-analytics.svelte';
	import type { FilterPreset } from '$lib/stores/filter-presets.svelte';
	import type { PageData } from './$types';
	import type { Photo } from '$types/photo';
	import { SIZES_PRESETS } from '$lib/photo-utils';
	import { cfSrcSet, hasCFImage } from '$lib/utils/cloudflare-images';

	// Dynamic imports for heavy components (lazy-loaded on first use)
	const FilterSidebarPromise = import('$lib/components/filters/FilterSidebar.svelte');
	const FilterPresetsPanelPromise = import('$lib/components/filters/FilterPresetsPanel.svelte');

	// Label mappings for user-friendly display
	const playTypeLabels: Record<string, string> = {
		attack: 'Attack',
		block: 'Block',
		dig: 'Dig',
		set: 'Set',
		serve: 'Serve',
	};

	let { data }: { data: PageData } = $props();

	// Handle streamed filter counts — show base counts immediately, update when filtered counts arrive
	let resolvedFilterCounts = $state(data.baseFilterCounts);

	$effect(() => {
		// Reset to base counts on navigation, then resolve streamed counts
		const baseCounts = data.baseFilterCounts;
		resolvedFilterCounts = baseCounts;

		// Promise.resolve handles both streamed promises and direct values
		let cancelled = false;
		Promise.resolve(data.filterCounts).then((counts) => {
			if (!cancelled) {
				resolvedFilterCounts = counts;
			}
		});
		return () => { cancelled = true; };
	});

	// Lightbox state
	let lightboxOpen = $state(false);
	let selectedPhotoIndex = $state(0);

	// Mobile drawer state
	let mobileFilterDrawerOpen = $state(false);

	// Loading state - derived from SvelteKit's navigating store
	let isLoading = $derived($navigating !== null);

	// Close lightbox on navigation (e.g. clicking "Similar Photos", back button, etc.)
	$effect(() => {
		if ($navigating) {
			lightboxOpen = false;
		}
	});

	// Search - sync with server data on navigation
	let searchQuery = $state('');
	$effect(() => {
		searchQuery = data.searchQuery || '';
	});

	// Photos come directly from server (search filtering is server-side)
	let displayPhotos = $derived(data.photos);

	// Active filters count
	let activeFilterCount = $derived.by(() => {
		let count = 0;
		if (data.selectedSport) count++;
		if (data.selectedCategory) count++;
		if (data.selectedPlayType) count++;
		if (data.selectedJerseyNumber) count++;
		if (data.selectedDivision) count++;
		if (data.selectedLevel) count++;
		return count;
	});

	// Zero results detection (Phase 4: Auto-Clear notification)
	$effect(() => {
		// Only show zero results warning if filters are active AND no photos
		if (activeFilterCount > 0 && displayPhotos.length === 0) {
			filterNotifications.notifyZeroResults();
		}
	});

	// Auto-clear notification (Phase 4: Show notification when server cleared filters)
	$effect(() => {
		if (data.clearedFilters && data.clearedFilters.length > 0) {
			filterNotifications.notifyAutoCleared(
				data.clearedFilters,
				'incompatible with current filters'
			);
		}
	});

	// Lightbox handlers
	function handlePhotoClick(photo: Photo) {
		// Use image_key for matching (more reliable than id)
		const index = displayPhotos.findIndex((p) => p.image_key === photo.image_key);
		if (index !== -1) {
			selectedPhotoIndex = index;
			lightboxOpen = true;
		}
	}

	function handleLightboxNavigate(newIndex: number) {
		selectedPhotoIndex = newIndex;
	}

	// Filter handlers
	// Note: All filter handlers clear 'similar_to' because vector similarity search
	// bypasses all other filters - applying a filter should start a fresh search context
	function handleSportSelect(sport: string | null) {
		const url = new URL($page.url);
		if (sport) {
			url.searchParams.set('sport', sport);
		} else {
			url.searchParams.delete('sport');
		}
		url.searchParams.delete('page');
		url.searchParams.delete('similar_to'); // Clear similarity search when filtering
		goto(url.toString());
	}

	function handleCategorySelect(category: string | null) {
		const url = new URL($page.url);
		if (category) {
			url.searchParams.set('category', category);
		} else {
			url.searchParams.delete('category');
		}
		url.searchParams.delete('page');
		url.searchParams.delete('similar_to'); // Clear similarity search when filtering
		goto(url.toString());
	}

	function handleSearch(query: string) {
		const url = new URL($page.url);
		if (query.trim()) {
			url.searchParams.set('q', query.trim());
		} else {
			url.searchParams.delete('q');
		}
		url.searchParams.delete('page');
		url.searchParams.delete('similar_to');
		goto(url.toString());
	}

	function handleClearSearch() {
		searchQuery = '';
		const url = new URL($page.url);
		url.searchParams.delete('q');
		url.searchParams.delete('page');
		goto(url.toString());
	}

	function handlePlayTypeSelect(playType: string | null) {
		const url = new URL($page.url);
		if (playType) {
			url.searchParams.set('play_type', playType);
		} else {
			url.searchParams.delete('play_type');
		}
		url.searchParams.delete('page');
		url.searchParams.delete('similar_to');
		goto(url.toString());
	}

	function handleJerseySelect(jersey: number | null) {
		const url = new URL($page.url);
		if (jersey !== null) {
			url.searchParams.set('jersey', jersey.toString());
		} else {
			url.searchParams.delete('jersey');
		}
		url.searchParams.delete('page');
		url.searchParams.delete('similar_to');
		goto(url.toString());
	}

	// Division facet (album-level): toggle ?division, preserving other params. Click active = clear.
	const DIVISIONS = [
		{ value: 'girls', label: 'Girls' },
		{ value: 'boys', label: 'Boys' },
		{ value: 'womens', label: "Women's" },
		{ value: 'mens', label: "Men's" },
		{ value: 'coed', label: 'Co-ed' }
	];
	function toggleDivision(value: string) {
		const url = new URL($page.url);
		if (data.selectedDivision === value) url.searchParams.delete('division');
		else url.searchParams.set('division', value);
		url.searchParams.delete('page');
		url.searchParams.delete('similar_to');
		goto(url.toString());
	}

	// Level facet (album-level): same toggle pattern as division.
	const LEVELS = [
		{ value: 'high_school', label: 'High School' },
		{ value: 'college', label: 'College' },
		{ value: 'club', label: 'Club' },
		{ value: 'middle_school', label: 'Middle School' }
	];
	function toggleLevel(value: string) {
		const url = new URL($page.url);
		if (data.selectedLevel === value) url.searchParams.delete('level');
		else url.searchParams.set('level', value);
		url.searchParams.delete('page');
		url.searchParams.delete('similar_to');
		goto(url.toString());
	}

	function clearAllFilters(event?: MouseEvent) {
		event?.stopPropagation();
		const url = new URL($page.url);
		// Remove all filter params
		url.searchParams.delete('sport');
		url.searchParams.delete('category');
		url.searchParams.delete('play_type');
		url.searchParams.delete('jersey'); // Clear jersey filter
		url.searchParams.delete('division'); // Clear division facet
		url.searchParams.delete('level'); // Clear level facet
		url.searchParams.delete('q'); // Clear search query too
		url.searchParams.delete('similar_to'); // Clear similarity search
		url.searchParams.delete('page');
		goto(url.toString());
	}

	// Apply filter preset
	function handleApplyPreset(filters: FilterPreset['filters']) {
		const url = new URL($page.url);

		// Clear existing filters
		url.searchParams.delete('sport');
		url.searchParams.delete('category');
		url.searchParams.delete('play_type');
		url.searchParams.delete('similar_to'); // Clear similarity search
		// Keep search query

		// Apply preset filters
		if (filters.sport) url.searchParams.set('sport', filters.sport);
		if (filters.category) url.searchParams.set('category', filters.category);
		if (filters.playType) url.searchParams.set('play_type', filters.playType);

		url.searchParams.delete('page');
		goto(url.toString());

		// Close mobile drawer if open
		mobileFilterDrawerOpen = false;
	}

	// Apply filter history entry
	function handleApplyHistory(filters: FilterHistoryEntry['filters']) {
		const url = new URL($page.url);

		// Clear existing filters
		url.searchParams.delete('sport');
		url.searchParams.delete('category');
		url.searchParams.delete('play_type');
		url.searchParams.delete('similar_to'); // Clear similarity search
		// Keep search query

		// Apply history filters
		if (filters.sport) url.searchParams.set('sport', filters.sport);
		if (filters.category) url.searchParams.set('category', filters.category);
		if (filters.playType) url.searchParams.set('play_type', filters.playType);

		url.searchParams.delete('page');
		goto(url.toString());

		// Close mobile drawer if open
		mobileFilterDrawerOpen = false;
	}

	function handlePageChange(page: number) {
		const url = new URL(window.location.href);
		url.searchParams.set('page', String(page));
		goto(url.toString());
	}

	function handleSortChange(event: Event) {
		const select = event.target as HTMLSelectElement;
		const sortBy = select.value as typeof preferences.sortBy;
		preferences.setSortBy(sortBy);

		const url = new URL(window.location.href);
		url.searchParams.set('sort', sortBy);
		goto(url.toString());
	}

	// Pagination
	const showingStart = $derived((data.currentPage - 1) * data.pageSize + 1);
	const showingEnd = $derived(Math.min(data.currentPage * data.pageSize, data.totalCount));

	// Apply stored preference if no URL sort param
	$effect(() => {
		const urlSortParam = $page.url.searchParams.get('sort');
		if (!urlSortParam && data.sortBy !== preferences.sortBy) {
			const url = new URL($page.url);
			url.searchParams.set('sort', preferences.sortBy);
			goto(url.toString(), { replaceState: true });
		}
	});

	// Track filter changes and add to history
	$effect(() => {
		// Read reactive dependencies first
		const currentFilters = {
			sport: data.selectedSport,
			category: data.selectedCategory,
			playType: data.selectedPlayType,
		};

		const filterCount = activeFilterCount;

		// Use untrack to prevent infinite loops when writing to stores
		untrack(() => {
			// Track analytics
			if (data.selectedSport) filterAnalytics.trackFilter('sports', data.selectedSport);
			if (data.selectedCategory) filterAnalytics.trackFilter('categories', data.selectedCategory);
			if (data.selectedPlayType) filterAnalytics.trackFilter('playTypes', data.selectedPlayType);

			// Track combination
			if (filterCount > 0) {
				const filterCombination: Record<string, string | string[]> = {};
				if (data.selectedSport) filterCombination.sport = data.selectedSport;
				if (data.selectedCategory) filterCombination.category = data.selectedCategory;
				if (data.selectedPlayType) filterCombination.playType = data.selectedPlayType;

				filterAnalytics.trackCombination(filterCombination);
			}

			// Add to history (debounced via store logic)
			filterHistory.addToHistory(currentFilters);
		});
	});

	// Keyboard navigation for gallery pages (arrow keys)
	function handleKeydown(event: KeyboardEvent) {
		// Only handle if not in an input field
		const target = event.target as HTMLElement;
		if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
			return;
		}

		const totalPages = Math.ceil(data.totalCount / data.pageSize);

		if (event.key === 'ArrowLeft' && data.currentPage > 1) {
			event.preventDefault();
			handlePageChange(data.currentPage - 1);
		} else if (event.key === 'ArrowRight' && data.currentPage < totalPages) {
			event.preventDefault();
			handlePageChange(data.currentPage + 1);
		}
	}
</script>

<!-- Preload first images for faster LCP -->
<svelte:head>
	<title>Explore Gallery | Nino Chavez Photography</title>
	<meta name="description" content="Browse {data.totalCount.toLocaleString()} professional volleyball action photos. Filter by sport, category, play type, and more." />

	<!-- Preload first image with responsive srcset for LCP optimization -->
	{#if data.photos[0]}
		{@const firstPhoto = data.photos[0]}
		{@const srcset = hasCFImage(firstPhoto.cf_image_id)
			? cfSrcSet(firstPhoto.cf_image_id)
			: ''}
		{#if srcset}
			<link
				rel="preload"
				as="image"
				imagesrcset={srcset}
				imagesizes={SIZES_PRESETS.galleryCard}
				fetchpriority="high"
			/>
		{/if}
	{/if}
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<!-- Minimal Sticky Header -->
<div class="sticky top-0 z-20 bg-charcoal-950/95 backdrop-blur-sm border-b border-charcoal-800/50">
	<!-- Loading progress bar -->
	{#if isLoading}
		<div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-gold-500 via-gold-400 to-gold-500 animate-shimmer-fast"></div>
	{/if}

	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
		<!-- Filters Header with Actions -->
		<div class="flex items-center justify-between gap-2 mb-2">
			<div class="flex items-center gap-2">
				<!-- Loading indicator -->
				{#if isLoading}
					<div class="flex items-center gap-2 text-gold-400 text-xs">
						<Loader2 class="w-3 h-3 animate-spin" aria-hidden="true" />
						<span>Loading...</span>
					</div>
				{/if}
			</div>

			<div class="flex items-center gap-2">
				<!-- Share Button (inline with other controls) -->
				<FilterShareButton
					sport={data.selectedSport}
					category={data.selectedCategory}
					playType={data.selectedPlayType}
				/>

				<!-- Mobile Filter Drawer Toggle (visible on small screens only) -->
				<button
					onclick={() => mobileFilterDrawerOpen = true}
					class="lg:hidden inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-full border transition-all bg-charcoal-800/50 border-charcoal-700 hover:border-gold-500/50"
					aria-label="Open filters"
				>
					<Filter class="w-3 h-3" />
					<span>Filters</span>
					{#if activeFilterCount > 0}
						<span class="px-1.5 py-0.5 rounded-full bg-gold-500/30 text-gold-200 text-xs font-medium">{activeFilterCount}</span>
					{/if}
				</button>

				{#if activeFilterCount > 0}
					<button
						onclick={clearAllFilters}
						class="inline-flex items-center gap-1 px-2 py-1 text-xs text-charcoal-400 hover:text-gold-400 transition-colors"
					>
						<X class="w-3 h-3" />
						<span class="hidden sm:inline">Clear All</span>
					</button>
				{/if}
			</div>
		</div>

		<!-- Filter Presets Panel (Collapsible) - Lazy Loaded -->
		<div class="mb-2">
			{#await FilterPresetsPanelPromise}
				<div class="h-10 bg-charcoal-900/50 rounded-lg animate-pulse"></div>
			{:then FilterPresetsPanelModule}
				<FilterPresetsPanelModule.default
					onApplyPreset={handleApplyPreset}
					onApplyHistory={handleApplyHistory}
				/>
			{/await}
		</div>

		<!-- Active Filter Chips (NEW: P0 Enhancement) -->
		{#if activeFilterCount > 0}
			<div class="flex flex-wrap items-center gap-3 mb-3 p-2 rounded-lg bg-charcoal-900/50 border border-charcoal-800/30">
				<Typography variant="caption" class="text-charcoal-400 text-xs font-medium">Active:</Typography>

				{#if data.selectedSport}
					<FilterChip
						label="Sport: {data.selectedSport}"
						onRemove={() => handleSportSelect(null)}
					/>
				{/if}

				{#if data.selectedCategory}
					<FilterChip
						label="Category: {data.selectedCategory}"
						onRemove={() => handleCategorySelect(null)}
					/>
				{/if}

				{#if data.selectedPlayType}
					<FilterChip
						label="Play: {playTypeLabels[data.selectedPlayType] || data.selectedPlayType}"
						onRemove={() => handlePlayTypeSelect(null)}
					/>
				{/if}

				{#if data.selectedJerseyNumber}
					<FilterChip
						label="Jersey: #{data.selectedJerseyNumber}"
						onRemove={() => handleJerseySelect(null)}
					/>
				{/if}
			</div>
		{/if}

		<!-- Consolidated Filters (Mobile only - dropdowns) -->
		<div class="lg:hidden">
			{#if data.sports && data.sports.length > 0 && data.categories && data.categories.length > 0}
				<ConsolidatedFilter
					sports={data.sports}
					categories={data.categories}
					selectedSport={data.selectedSport}
					selectedCategory={data.selectedCategory}
					selectedPlayType={data.selectedPlayType}
					onSportSelect={handleSportSelect}
					onCategorySelect={handleCategorySelect}
					onPlayTypeSelect={handlePlayTypeSelect}
					filterCounts={resolvedFilterCounts}
				/>
			{/if}
		</div>
	</div>
</div>

<!-- Main Content with Sidebar (Desktop) / Full Width (Mobile) -->
<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
	<div class="flex gap-6">
		<!-- Filter Sidebar (Desktop only) - Lazy Loaded -->
		<div class="hidden lg:block">
			{#if data.sports && data.sports.length > 0 && data.categories && data.categories.length > 0}
				{#await FilterSidebarPromise}
					<div class="w-64 h-96 bg-charcoal-900/50 rounded-lg animate-pulse"></div>
				{:then FilterSidebarModule}
					<FilterSidebarModule.default
						sports={data.sports}
						categories={data.categories}
						selectedSport={data.selectedSport}
						selectedCategory={data.selectedCategory}
						selectedPlayType={data.selectedPlayType}
						onSportSelect={handleSportSelect}
						onCategorySelect={handleCategorySelect}
						onPlayTypeSelect={handlePlayTypeSelect}
						onClearAll={clearAllFilters}
						filterCounts={resolvedFilterCounts}
					/>
				{/await}
			{/if}
		</div>

		<!-- Gallery Content -->
		<div class="flex-1 min-w-0">
	<!-- Sort & Count -->
	<div class="flex items-center justify-between mb-4">
		<Typography variant="caption" class="text-charcoal-400 text-xs">
			{showingStart.toLocaleString()}–{showingEnd.toLocaleString()} of {data.totalCount.toLocaleString()}
		</Typography>

		<select
			value={data.sortBy}
			onchange={handleSortChange}
			class="px-3 py-1.5 text-xs rounded-md bg-charcoal-900 border border-charcoal-800 focus:border-gold-500 focus:ring-1 focus:ring-gold-500/50 transition-colors text-white cursor-pointer"
			aria-label="Sort photos"
		>
			<option value="quality">Best Photos First</option>
			<option value="newest">Newest</option>
			<option value="oldest">Oldest</option>
		</select>
	</div>

	<!-- Division facet chips (album-level browse axis free-text can't express) -->
	<div class="flex flex-wrap items-center gap-2 mb-4">
		<span class="text-xs uppercase tracking-wide text-charcoal-500">Division</span>
		{#each DIVISIONS as d}
			<button
				type="button"
				onclick={() => toggleDivision(d.value)}
				aria-pressed={data.selectedDivision === d.value}
				class="px-3 py-1 rounded-full border text-xs transition-colors {data.selectedDivision === d.value
					? 'border-gold-500 bg-gold-500/15 text-white'
					: 'border-charcoal-700 bg-charcoal-900 text-charcoal-300 hover:border-gold-500/60 hover:text-white'}"
			>
				{d.label}
			</button>
		{/each}
	</div>

	<!-- Level facet chips -->
	<div class="flex flex-wrap items-center gap-2 mb-4">
		<span class="text-xs uppercase tracking-wide text-charcoal-500">Level</span>
		{#each LEVELS as l}
			<button
				type="button"
				onclick={() => toggleLevel(l.value)}
				aria-pressed={data.selectedLevel === l.value}
				class="px-3 py-1 rounded-full border text-xs transition-colors {data.selectedLevel === l.value
					? 'border-gold-500 bg-gold-500/15 text-white'
					: 'border-charcoal-700 bg-charcoal-900 text-charcoal-300 hover:border-gold-500/60 hover:text-white'}"
			>
				{l.label}
			</button>
		{/each}
	</div>

	<!-- Search Feedback -->
	{#if data.searchQuery && data.parsedDescription}
		<div class="flex items-center justify-between gap-2 mb-4 px-3 py-2 rounded-lg {data.searchMode === 'semantic' ? 'bg-gold-500/10 border border-gold-500/20' : 'bg-charcoal-900/50 border border-charcoal-800/30'}">
			<div class="flex items-center gap-2 text-sm">
				{#if data.searchMode === 'semantic'}
					<Sparkles class="w-4 h-4 text-gold-400 flex-shrink-0" />
					<span class="text-charcoal-200">{data.parsedDescription}</span>
				{:else}
					<Search class="w-4 h-4 text-charcoal-400 flex-shrink-0" />
					<span class="text-charcoal-200">Showing <span class="text-white font-medium">{data.totalCount.toLocaleString()}</span> results for: <span class="text-gold-400">{data.parsedDescription}</span></span>
				{/if}
			</div>
			<button
				onclick={handleClearSearch}
				class="text-charcoal-400 hover:text-white transition-colors flex-shrink-0"
				aria-label="Clear search"
			>
				<X class="w-4 h-4" />
			</button>
		</div>
	{/if}

	<!-- Photo Grid with Loading State -->
	{#if isLoading}
		<!-- Show skeleton while navigating -->
		<PhotoGridSkeleton count={data.pageSize} />
	{:else if displayPhotos.length > 0}
		<div class="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-4 lg:gap-6">
			{#each displayPhotos as photo, index (photo.image_key)}
				<PhotoCard {photo} {index} onclick={handlePhotoClick} priority={index < 4} />
			{/each}
		</div>
	{:else}
		<!-- Enhanced Empty State with Filter Context -->
		<div class="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
			{#if activeFilterCount > 0}
				<Filter class="w-16 h-16 text-charcoal-600 mb-4" aria-hidden="true" />
				<Typography variant="h3" class="mb-2">No photos match your filters</Typography>
				<Typography variant="body" class="text-charcoal-400 mb-4">
					No photos found with {activeFilterCount}
					{activeFilterCount === 1 ? 'active filter' : 'active filters'}. Try removing some filters to see
					more results.
				</Typography>
				<Button onclick={clearAllFilters} size="md" variant="outline">
					<X class="w-4 h-4 mr-2" />
					Clear All Filters
				</Button>
			{:else}
				<Camera class="w-16 h-16 text-charcoal-600 mb-4" aria-hidden="true" />
				<Typography variant="h3" class="mb-2">No photos found</Typography>
				<Typography variant="body" class="text-charcoal-400">
					{#if searchQuery.trim()}
						No photos match your search "{searchQuery}". Try a different search term.
					{:else}
						The gallery is empty. Check back later for new photos.
					{/if}
				</Typography>
			{/if}
		</div>
	{/if}

	<!-- Pagination -->
	{#if displayPhotos.length > 0}
		<PaginationHybrid
			currentPage={data.currentPage}
			totalCount={data.totalCount}
			pageSize={data.pageSize}
			onPageChange={handlePageChange}
			class="mt-6"
		/>
	{/if}
		</div><!-- End Gallery Content -->
	</div><!-- End flex container -->
</div><!-- End max-w-7xl container -->

<!-- Lightbox -->
<Lightbox
	bind:open={lightboxOpen}
	photo={displayPhotos[selectedPhotoIndex] || null}
	photos={displayPhotos}
	currentIndex={selectedPhotoIndex}
	onNavigate={handleLightboxNavigate}
/>

<!-- Visual Data Legend (explains hover badge system) -->
<VisualDataLegend />

<!-- Toast Notifications Container (Phase 4: Auto-Clear Notifications) -->
<div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2" role="status" aria-live="polite" aria-atomic="true">
	{#each filterNotifications.all as notification (notification.id)}
		<Toast
			variant={notification.variant}
			duration={notification.duration}
			onClose={() => filterNotifications.remove(notification.id)}
		>
			{notification.message}
		</Toast>
	{/each}
</div>

<style>
	/* Performance: Use CSS transitions instead of JS animations */
	:global(.photo-card-link) {
		transition: transform 0.2s ease, box-shadow 0.2s ease;
	}

	:global(.photo-card-link:hover) {
		transform: translateY(-4px) scale(1.02);
	}

	/* Loading progress bar animation */
	@keyframes shimmer-fast {
		0% {
			background-position: -200% 0;
		}
		100% {
			background-position: 200% 0;
		}
	}

	.animate-shimmer-fast {
		background-size: 200% 100%;
		animation: shimmer-fast 1.5s ease-in-out infinite;
	}
</style>
