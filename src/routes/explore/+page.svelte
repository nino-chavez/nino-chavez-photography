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
	import FittedPhotoGrid from '$lib/components/gallery/FittedPhotoGrid.svelte';
	import Lightbox from '$lib/components/gallery/Lightbox.svelte';
	import VisualDataLegend from '$lib/components/ui/VisualDataLegend.svelte';
	import FilterChip from '$lib/components/filters/FilterChip.svelte';
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
	import { trackAnalyticsEventV2, recordSearchSubmission, searchDuration } from '$lib/analytics/client';
	import type { FilterCounts } from '$lib/supabase/server';

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
	const divisionLabels: Record<string, string> = {
		girls: 'Girls',
		boys: 'Boys',
		womens: "Women's",
		mens: "Men's",
		coed: 'Co-ed'
	};
	const levelLabels: Record<string, string> = {
		high_school: 'High School',
		college: 'College',
		club: 'Club',
		middle_school: 'Middle School'
	};

	let { data }: { data: PageData } = $props();

	// Handle streamed filter counts — show base counts immediately, update when filtered counts arrive
	let resolvedFilterCounts = $state<FilterCounts | undefined>();

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
	let resultSetId = $state(crypto.randomUUID());
		$effect(() => {
		searchQuery = data.searchQuery || '';
		resultSetId = crypto.randomUUID();
	});

	// Photos come directly from server (search filtering is server-side)
	let displayPhotos = $derived(data.photos);
	let reportedSearchFailureId = $state<string | null>(null);
	function reportVisibleSearchFailure() {
		if (!data.searchError?.searchId || reportedSearchFailureId === data.searchError.searchId || document.visibilityState !== 'visible') return;
		reportedSearchFailureId = data.searchError.searchId;
		trackAnalyticsEventV2({ eventName: 'search_failed', properties: { search_id: data.searchError.searchId, error_code: data.searchError.errorCode } });
	}
	$effect(() => {
		if (!data.searchError && data.searchId && data.searchQuery) trackAnalyticsEventV2({ eventName: 'search_results_shown', properties: { search_id: data.searchId, result_set_id: resultSetId, result_count: data.totalCount, duration_ms: searchDuration(data.searchId) } });
		reportVisibleSearchFailure();
		if (activeFilterCount > 0) trackAnalyticsEventV2({ eventName: 'filters_applied', properties: { result_set_id: resultSetId, result_count: data.totalCount, sport: data.selectedSport ?? undefined, category: data.selectedCategory ?? undefined, play_type: data.selectedPlayType ?? undefined, division: data.selectedDivision ?? undefined, level: data.selectedLevel ?? undefined, sort: data.sortBy } });
	});
	$effect(() => {
		const onVisibilityChange = () => reportVisibleSearchFailure();
		document.addEventListener('visibilitychange', onVisibilityChange);
		return () => document.removeEventListener('visibilitychange', onVisibilityChange);
	});

	// Active filters count
	let activeFilterCount = $derived.by(() => {
		let count = 0;
		if (data.selectedSport) count++;
		if (data.selectedCategory) count++;
		if (data.selectedPlayType) count++;
		if (data.selectedJerseyNumber) count++;
		if (data.selectedDivision) count++;
		if (data.selectedLevel) count++;
		if (data.searchQuery) count++;
		return count;
	});
	let hasFacetedFilters = $derived(Boolean(
		data.selectedSport || data.selectedCategory || data.selectedPlayType || data.selectedJerseyNumber || data.selectedDivision || data.selectedLevel
	));

	// Zero results detection (Phase 4: Auto-Clear notification)
	$effect(() => {
		// Only show zero results warning if filters are active AND no photos
		if (hasFacetedFilters && displayPhotos.length === 0) {
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
		// Camera filenames repeat across albums; the clicked photo's ID is globally unique.
		const index = displayPhotos.findIndex((p) => p.id === photo.id);
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
		const searchId = recordSearchSubmission();
		url.searchParams.set('search_id', searchId);
		void goto(url.toString()).catch(() => trackAnalyticsEventV2({ eventName: 'search_failed', properties: { search_id: searchId, error_code: 'navigation_failed' } }));
	}

	function handleSearchSubmit(event: SubmitEvent) {
		event.preventDefault();
		handleSearch(searchQuery);
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

	function handleDivisionSelect(value: string | null) {
		const url = new URL($page.url);
		if (!value || data.selectedDivision === value) url.searchParams.delete('division');
		else url.searchParams.set('division', value);
		url.searchParams.delete('page');
		url.searchParams.delete('similar_to');
		goto(url.toString());
	}

	function handleLevelSelect(value: string | null) {
		const url = new URL($page.url);
		if (!value || data.selectedLevel === value) url.searchParams.delete('level');
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
		// The lightbox has its own ArrowLeft/ArrowRight handler (photo-to-photo) and never calls
		// stopPropagation, so with no guard here BOTH handlers fired on every press while the
		// lightbox was open — this one paging the underlying server-rendered grid to the next/
		// previous page via `goto()`, which then closed the lightbox (the `$navigating` effect
		// above). Confirmed live: pressing ArrowRight inside the lightbox navigated the URL to
		// `?page=2` and dropped back to the grid mid-browse. Page-level pagination is not this
		// keydown's job while a photo is open full-screen.
		if (lightboxOpen) return;

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

<header class="explore-opening">
	<p class="explore-eyebrow">Photography archive</p>
	<div class="explore-title-row">
		<div>
			<h1>Find your photograph</h1>
			<p>Search what is visible, narrow by event details, then open the image to save, share, or download.</p>
		</div>
		<p class="explore-count">{data.totalCount.toLocaleString()} {data.totalCount === 1 ? 'photograph' : 'photographs'}</p>
	</div>
</header>

<!-- Finding tools -->
<div class="explore-tools">
	<!-- Loading progress bar -->
	{#if isLoading}
		<div class="explore-tools__progress" aria-hidden="true"></div>
	{/if}

	<div class="explore-tools__inner">
		<div class="explore-tools__search-row">
			<form class="explore-search" onsubmit={handleSearchSubmit}>
				<label for="explore-photo-search">Search photos</label>
				<div class="explore-search__control">
					<Search class="w-4 h-4" aria-hidden="true" />
					<input
						id="explore-photo-search"
						bind:value={searchQuery}
						type="search"
						placeholder="Number, color, action, or scene"
						autocomplete="off"
					/>
					{#if searchQuery}
						<button type="button" class="explore-search__clear" onclick={handleClearSearch} aria-label="Clear photo search">
							<X class="w-4 h-4" />
						</button>
					{/if}
					<button type="submit" class="explore-search__submit">Search</button>
				</div>
			</form>

			<div class="explore-tools__actions">
				<!-- Share Button (inline with other controls) -->
				<FilterShareButton
					sport={data.selectedSport}
					category={data.selectedCategory}
					playType={data.selectedPlayType}
					jersey={data.selectedJerseyNumber}
					division={data.selectedDivision}
					level={data.selectedLevel}
					query={data.searchQuery}
					shareUrl={$page.url.toString()}
				/>

				<!-- Mobile Filter Drawer Toggle (visible on small screens only) -->
				<button
					onclick={() => mobileFilterDrawerOpen = true}
					class="lg:hidden inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-full border transition-all bg-charcoal-800/50 border-charcoal-700 hover:border-gold-500/50"
					aria-label="Open filters"
					aria-expanded={mobileFilterDrawerOpen}
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
						aria-label="Clear all filters and search"
					>
						<X class="w-3 h-3" />
						<span>Clear all</span>
					</button>
				{/if}
			</div>
		</div>

		{#if isLoading}
			<div class="explore-tools__loading" role="status" aria-live="polite">
				<Loader2 class="w-3.5 h-3.5" aria-hidden="true" />
				<span>Loading matching photos</span>
			</div>
		{/if}

		<!-- Filter Presets Panel (Collapsible) - Lazy Loaded -->
		<div class="explore-tools__quick-filters mb-2">
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
			<div class="explore-tools__active-filters flex flex-wrap items-center gap-3 mb-3 p-2 rounded-lg bg-charcoal-900/50 border border-charcoal-800/30">
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

				{#if data.selectedDivision}
					<FilterChip
						label={`Division: ${divisionLabels[data.selectedDivision] || data.selectedDivision}`}
						onRemove={() => handleDivisionSelect(null)}
					/>
				{/if}

				{#if data.selectedLevel}
					<FilterChip
						label={`Level: ${levelLabels[data.selectedLevel] || data.selectedLevel}`}
						onRemove={() => handleLevelSelect(null)}
					/>
				{/if}

				{#if data.searchQuery}
					<FilterChip label={`Search: ${data.searchQuery}`} onRemove={handleClearSearch} />
				{/if}
			</div>
		{/if}
	</div>
</div>

<!-- Main Content with Sidebar (Desktop) / Full Width (Mobile) -->
<!-- The mobile trigger opens the same filter controls as the desktop sidebar. -->
<FilterSidebarDrawer
	bind:open={mobileFilterDrawerOpen}
	sports={data.sports ?? []}
	categories={data.categories ?? []}
	selectedSport={data.selectedSport}
	selectedCategory={data.selectedCategory}
	selectedPlayType={data.selectedPlayType}
	selectedDivision={data.selectedDivision}
	selectedLevel={data.selectedLevel}
	selectedQuery={data.searchQuery}
	onSportSelect={handleSportSelect}
	onCategorySelect={handleCategorySelect}
	onPlayTypeSelect={handlePlayTypeSelect}
	onDivisionSelect={handleDivisionSelect}
	onLevelSelect={handleLevelSelect}
	onClearAll={clearAllFilters}
	filterCounts={resolvedFilterCounts ?? data.baseFilterCounts}
/>

<div class="explore-results" aria-busy={isLoading}>
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
						selectedDivision={data.selectedDivision}
						selectedLevel={data.selectedLevel}
						selectedQuery={data.searchQuery}
						onSportSelect={handleSportSelect}
						onCategorySelect={handleCategorySelect}
						onPlayTypeSelect={handlePlayTypeSelect}
						onDivisionSelect={handleDivisionSelect}
						onLevelSelect={handleLevelSelect}
						onClearAll={clearAllFilters}
						filterCounts={resolvedFilterCounts ?? data.baseFilterCounts}
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

	<!-- Keep the current rows in place while navigation loads the next result set. -->
	{#if data.searchError}
		<div class="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto" role="alert">
			<Camera class="w-16 h-16 text-charcoal-600 mb-4" aria-hidden="true" />
			<Typography variant="h3" class="mb-2">Search is temporarily unavailable</Typography>
			<Typography variant="body" class="text-charcoal-400">No results were recorded. Please try your search again.</Typography>
		</div>
	{:else if displayPhotos.length > 0}
		<div class="explore-photo-grid">
			<FittedPhotoGrid photos={displayPhotos}>
				{#snippet children(photo, index, sizes)}
					<PhotoCard {sizes} preserveAspectRatio {photo} {index} {resultSetId} searchId={data.searchId ?? undefined} favoriteSurface="explore" onclick={handlePhotoClick} priority={index < 4} />
				{/snippet}
			</FittedPhotoGrid>
		</div>
	{:else}
		<!-- Enhanced Empty State with Filter Context -->
		<div class="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
		{#if hasFacetedFilters}
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
	viewSource="explore"
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
	.explore-opening, .explore-tools__inner, .explore-results { width: min(1320px, calc(100% - 64px)); margin-inline: auto; }
	.explore-opening { padding-block: 28px 20px; }
	.explore-eyebrow { margin-bottom: 14px; color: var(--color-gold-500); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
	.explore-title-row { display: flex; align-items: end; justify-content: space-between; gap: 24px; }
	.explore-title-row h1 { margin: 0; font-family: Montserrat, sans-serif; font-size: clamp(32px, 3.2vw, 46px); font-weight: 750; line-height: 1.08; letter-spacing: -.035em; }
	.explore-title-row > div > p { max-width: 680px; margin-top: 12px; color: var(--color-charcoal-300); font-size: 16px; line-height: 1.55; }
	.explore-count { color: var(--color-charcoal-300); font-size: 14px; white-space: nowrap; }
	.explore-tools { position: sticky; top: var(--gallery-header-height); z-index: 30; background: var(--color-charcoal-950); border-block: 1px solid var(--color-charcoal-800); }
	.explore-tools__inner { display: grid; gap: 10px; padding-block: 10px; }
	.explore-tools__search-row { display: flex; align-items: end; gap: 10px; }
	.explore-search { flex: 1; min-width: 0; }
	.explore-search label { display: block; margin-bottom: 4px; color: var(--gallery-ink, var(--color-charcoal-200)); font-size: 12px; font-weight: 700; }
	.explore-search__control { display: flex; align-items: center; min-height: 44px; gap: 8px; padding-left: 12px; border: 1px solid var(--gallery-rule, var(--color-charcoal-700)); border-radius: 8px; background: var(--gallery-control-bg, var(--color-charcoal-900)); }
	.explore-search__control:focus-within { border-color: var(--gallery-accent, var(--color-gold-500)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--gallery-accent, var(--color-gold-500)) 30%, transparent); }
	.explore-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--gallery-ink, var(--color-charcoal-100)); font-size: 14px; }
	.explore-search input::placeholder { color: var(--gallery-muted, var(--color-charcoal-400)); }
	.explore-search__clear { display: inline-grid; place-items: center; width: 36px; height: 36px; border-radius: 999px; color: var(--gallery-muted, var(--color-charcoal-400)); }
	.explore-search__clear:hover { background: var(--gallery-rule, var(--color-charcoal-800)); color: var(--gallery-ink, var(--color-charcoal-100)); }
	.explore-search__submit { align-self: stretch; min-height: 42px; padding-inline: 16px; border-radius: 0 7px 7px 0; background: var(--gallery-accent, var(--color-gold-500)); color: var(--gallery-bg, var(--color-charcoal-950)); font-size: 13px; font-weight: 700; }
	.explore-search__submit:hover { background: var(--gallery-accent-hover, var(--gallery-accent, var(--color-gold-400))); }
	.explore-search__submit:active { background: var(--gallery-accent-pressed, var(--gallery-accent, var(--color-gold-600))); }
	.explore-tools__actions { display: flex; align-items: center; gap: 8px; min-height: 44px; }
	.explore-tools__loading { display: flex; align-items: center; gap: 6px; color: var(--gallery-muted, var(--color-charcoal-400)); font-size: 12px; }
	.explore-tools__progress { position: absolute; top: 0; right: 0; left: 0; height: 2px; background: var(--gallery-accent, var(--color-gold-500)); }
	.explore-tools__quick-filters { width: 100%; }
	.explore-results { padding-block: 20px 72px; }
	.explore-tools :global(button[aria-controls="presets-panel"]),
	.explore-tools :global(button[aria-label="Open filters"]),
	.explore-tools :global(button[aria-label^="Expand "]) { min-height: 44px; }
	.explore-tools :global(button:disabled) { opacity: .45; }
	.explore-tools :global(:focus-visible) { outline: 2px solid var(--gallery-accent); outline-offset: 3px; }
	.explore-photo-grid :global(.photo-card) { border: 0; border-radius: 0; transform: none; box-shadow: none; }
	@media (max-width: 640px) {
		.explore-opening, .explore-tools__inner, .explore-results { width: calc(100% - 40px); }
		.explore-opening { padding-block: 20px 16px; }
		.explore-opening h1 { font-size: 32px; line-height: 1.1; letter-spacing: -.7px; }
		.explore-eyebrow { margin-bottom: 10px; }
		.explore-title-row { align-items: start; flex-direction: column; gap: 10px; }
		.explore-title-row > div > p { margin-top: 10px; font-size: 14px; line-height: 1.5; }
		.explore-count { font-size: 12px; white-space: normal; }
		.explore-tools__search-row { align-items: end; }
		.explore-tools__actions { flex-shrink: 0; }
		.explore-tools :global(button[aria-controls="presets-panel"]) { padding: 10px; }
		.explore-tools :global(button[aria-controls="presets-panel"] label) { font-size: 12px; }
		.explore-results { padding-block: 16px 56px; }
	}
	@media (max-width: 359px) {
		.explore-tools__search-row { align-items: stretch; flex-direction: column; }
		.explore-tools__actions { justify-content: space-between; }
	}

</style>
