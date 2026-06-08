<!--
  FilterSidebar Component - Faceted filter sidebar with accordion sections

  Implements best-practice filter UI for large galleries:
  - Accordion sections (progressive disclosure)
  - Radio inputs for single-select filters
  - Dynamic result counts (context-aware)
  - Visual hierarchy (Law of Proximity, Law of Common Region)
  - Desktop-optimized (mobile uses FilterSidebarDrawer)

  Features:
  - Sport, Category, Play Type
  - Smart filter counts showing compatible results
  - Disabled state for zero-result options
  - Sticky positioning with scroll
  - Clear all functionality

  Usage:
  <FilterSidebar
    {sports}
    {categories}
    {filterCounts}
    selectedSport={data.selectedSport}
    selectedCategory={data.selectedCategory}
    selectedPlayType={data.selectedPlayType}
    onSportSelect={handleSportSelect}
    onCategorySelect={handleCategorySelect}
    onPlayTypeSelect={handlePlayTypeSelect}
    onClearAll={handleClearAll}
  />
-->

<script lang="ts">
	import { slide } from 'svelte/transition';
	import { ChevronDown, X, Trophy, Award, Zap, Activity, Sparkles } from 'lucide-svelte';
	import Typography from '$lib/components/ui/Typography.svelte';
	import type { FilterCounts } from '$lib/supabase/server';

	interface Sport {
		name: string;
		count: number;
		percentage: number;
	}

	interface Category {
		name: string;
		count: number;
		percentage: number;
	}

	interface Props {
		sports: Sport[];
		categories: Category[];
		selectedSport?: string | null;
		selectedCategory?: string | null;
		selectedPlayType?: string | null;
		onSportSelect?: (sport: string | null) => void;
		onCategorySelect?: (category: string | null) => void;
		onPlayTypeSelect?: (playType: string | null) => void;
		onClearAll?: () => void;
		filterCounts?: FilterCounts;
	}

	let {
		sports,
		categories,
		selectedSport = null,
		selectedCategory = null,
		selectedPlayType = null,
		onSportSelect,
		onCategorySelect,
		onPlayTypeSelect,
		onClearAll,
		filterCounts
	}: Props = $props();

	// Accordion state - Start with primary filters expanded
	let expandedSections = $state({
		sport: true,
		category: true,
		playType: false
	});

	// Label mappings for user-friendly display
	const playTypeLabels: Record<string, string> = {
		attack: 'Attack',
		block: 'Block',
		dig: 'Dig',
		set: 'Set',
		serve: 'Serve',
	};

	// Icon mappings
	const sportIcons: Record<string, any> = {
		volleyball: Trophy,
		basketball: Trophy,
		soccer: Trophy,
		softball: Trophy,
		football: Trophy,
		baseball: Trophy,
		track: Activity,
		portrait: Activity
	};

	const categoryIcons: Record<string, any> = {
		action: Zap,
		celebration: Award,
		candid: Sparkles,
		portrait: Activity,
		warmup: Activity,
		ceremony: Award
	};

	// Merge filterCounts with data for context-aware counts
	let sportsWithCounts = $derived(
		sports.map((sport) => {
			const contextCount = filterCounts?.sports?.find((fc) => fc.name === sport.name)?.count;
			return {
				...sport,
				displayCount: contextCount !== undefined ? contextCount : sport.count,
			};
		})
	);

	let categoriesWithCounts = $derived(
		categories.map((category) => {
			const contextCount = filterCounts?.categories?.find((fc) => fc.name === category.name)?.count;
			return {
				...category,
				displayCount: contextCount !== undefined ? contextCount : category.count,
			};
		})
	);

	// Calculate active filter count
	let activeFilterCount = $derived(
		(selectedSport ? 1 : 0) +
		(selectedCategory ? 1 : 0) +
		(selectedPlayType ? 1 : 0)
	);

	// Toggle accordion section
	function toggleSection(section: keyof typeof expandedSections) {
		expandedSections[section] = !expandedSections[section];
	}

	// Filter handlers
	function handleSportClick(sportName: string | null, event: Event) {
		event.stopPropagation();
		onSportSelect?.(sportName);
	}

	function handleCategoryClick(categoryName: string | null, event: Event) {
		event.stopPropagation();
		onCategorySelect?.(categoryName);
	}

	function handlePlayTypeClick(playType: string | null, event: Event) {
		event.stopPropagation();
		onPlayTypeSelect?.(playType);
	}

	function handleClearAllClick(event: Event) {
		event.stopPropagation();
		onClearAll?.();
	}

	// Get count for filter option
	function getPlayTypeCount(playType: string): number {
		return filterCounts?.playTypes?.find(pt => pt.name === playType)?.count || 0;
	}
</script>

<aside class="w-64 flex-shrink-0 sticky top-20 h-[calc(100vh-5rem)] overflow-y-auto">
	<div class="bg-charcoal-900/50 border border-charcoal-800/50 rounded-xl p-4 space-y-1">
		<!-- Header with Clear All -->
		<div class="flex items-center justify-between mb-4 pb-3 border-b border-charcoal-800/50">
			<Typography variant="h3" class="text-base font-semibold">Filters</Typography>
			{#if activeFilterCount > 0}
				<button
					onclick={handleClearAllClick}
					class="flex items-center gap-1 px-2 py-1 text-xs text-charcoal-400 hover:text-gold-400 transition-colors"
					aria-label="Clear all filters"
				>
					<X class="w-3 h-3" />
					<span>Clear All</span>
				</button>
			{/if}
		</div>

		<!-- Sport Section -->
		<div class="border-b border-charcoal-800/30 pb-3">
			<button
				onclick={() => toggleSection('sport')}
				class="w-full flex items-center justify-between py-2 text-sm font-medium hover:text-gold-400 transition-colors"
				aria-expanded={expandedSections.sport}
				aria-controls="sport-section"
			>
				<span class="flex items-center gap-2">
					<Trophy class="w-4 h-4" />
					Sport
					{#if selectedSport}
						<span class="px-1.5 py-0.5 rounded-full bg-gold-500/20 text-gold-400 text-xs">1</span>
					{/if}
				</span>
				<ChevronDown class="w-4 h-4 transition-transform {expandedSections.sport ? 'rotate-180' : ''}" />
			</button>

			{#if expandedSections.sport}
				<div id="sport-section" class="space-y-1 mt-2" transition:slide={{ duration: 200 }}>
					<!-- All Sports -->
					<label class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-charcoal-800/50 cursor-pointer transition-colors">
						<input
							type="radio"
							name="sport"
							checked={!selectedSport}
							onchange={(e) => handleSportClick(null, e)}
							class="w-4 h-4 text-gold-500 border-charcoal-700 focus:ring-gold-500 focus:ring-offset-charcoal-900"
						/>
						<span class="flex-1 text-sm {!selectedSport ? 'text-gold-400 font-medium' : 'text-charcoal-300'}">All Sports</span>
						<span class="text-xs text-charcoal-400">{sportsWithCounts.reduce((sum, s) => sum + s.displayCount, 0).toLocaleString()}</span>
					</label>

					<!-- Individual Sports -->
					{#each sportsWithCounts as sport (sport.name)}
						{@const IconComponent = sportIcons[sport.name.toLowerCase()] || Trophy}
						{@const isDisabled = sport.displayCount === 0}
						<label class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-charcoal-800/50 cursor-pointer transition-colors {isDisabled ? 'opacity-40 cursor-not-allowed' : ''}">
							<input
								type="radio"
								name="sport"
								checked={selectedSport === sport.name}
								onchange={(e) => handleSportClick(sport.name, e)}
								disabled={isDisabled}
								class="w-4 h-4 text-gold-500 border-charcoal-700 focus:ring-gold-500 focus:ring-offset-charcoal-900"
							/>
							<IconComponent class="w-3.5 h-3.5 {selectedSport === sport.name ? 'text-gold-400' : 'text-charcoal-500'}" />
							<span class="flex-1 text-sm capitalize {selectedSport === sport.name ? 'text-gold-400 font-medium' : 'text-charcoal-300'}">
								{sport.name}
							</span>
							<span class="text-xs text-charcoal-400">{sport.displayCount.toLocaleString()}</span>
						</label>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Category Section -->
		<div class="border-b border-charcoal-800/30 pb-3">
			<button
				onclick={() => toggleSection('category')}
				class="w-full flex items-center justify-between py-2 text-sm font-medium hover:text-gold-400 transition-colors"
				aria-expanded={expandedSections.category}
				aria-controls="category-section"
			>
				<span class="flex items-center gap-2">
					<Award class="w-4 h-4" />
					Category
					{#if selectedCategory}
						<span class="px-1.5 py-0.5 rounded-full bg-gold-500/20 text-gold-400 text-xs">1</span>
					{/if}
				</span>
				<ChevronDown class="w-4 h-4 transition-transform {expandedSections.category ? 'rotate-180' : ''}" />
			</button>

			{#if expandedSections.category}
				<div id="category-section" class="space-y-1 mt-2" transition:slide={{ duration: 200 }}>
					<!-- All Categories -->
					<label class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-charcoal-800/50 cursor-pointer transition-colors">
						<input
							type="radio"
							name="category"
							checked={!selectedCategory}
							onchange={(e) => handleCategoryClick(null, e)}
							class="w-4 h-4 text-gold-500 border-charcoal-700 focus:ring-gold-500 focus:ring-offset-charcoal-900"
						/>
						<span class="flex-1 text-sm {!selectedCategory ? 'text-gold-400 font-medium' : 'text-charcoal-300'}">All Categories</span>
						<span class="text-xs text-charcoal-400">{categoriesWithCounts.reduce((sum, c) => sum + c.displayCount, 0).toLocaleString()}</span>
					</label>

					<!-- Individual Categories -->
					{#each categoriesWithCounts as category (category.name)}
						{@const IconComponent = categoryIcons[category.name.toLowerCase()] || Award}
						{@const isDisabled = category.displayCount === 0}
						<label class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-charcoal-800/50 cursor-pointer transition-colors {isDisabled ? 'opacity-40 cursor-not-allowed' : ''}">
							<input
								type="radio"
								name="category"
								checked={selectedCategory === category.name}
								onchange={(e) => handleCategoryClick(category.name, e)}
								disabled={isDisabled}
								class="w-4 h-4 text-gold-500 border-charcoal-700 focus:ring-gold-500 focus:ring-offset-charcoal-900"
							/>
							<IconComponent class="w-3.5 h-3.5 {selectedCategory === category.name ? 'text-gold-400' : 'text-charcoal-500'}" />
							<span class="flex-1 text-sm capitalize {selectedCategory === category.name ? 'text-gold-400 font-medium' : 'text-charcoal-300'}">
								{category.name}
							</span>
							<span class="text-xs text-charcoal-400">{category.displayCount.toLocaleString()}</span>
						</label>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Play Type Section -->
		<div class="pb-3">
			<button
				onclick={() => toggleSection('playType')}
				class="w-full flex items-center justify-between py-2 text-sm font-medium hover:text-gold-400 transition-colors"
				aria-expanded={expandedSections.playType}
				aria-controls="playtype-section"
			>
				<span class="flex items-center gap-2">
					<Zap class="w-4 h-4" />
					Play Type
					{#if selectedPlayType}
						<span class="px-1.5 py-0.5 rounded-full bg-gold-500/20 text-gold-400 text-xs">1</span>
					{/if}
				</span>
				<ChevronDown class="w-4 h-4 transition-transform {expandedSections.playType ? 'rotate-180' : ''}" />
			</button>

			{#if expandedSections.playType}
				<div id="playtype-section" class="space-y-1 mt-2" transition:slide={{ duration: 200 }}>
					<!-- All Play Types -->
					<label class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-charcoal-800/50 cursor-pointer transition-colors">
						<input
							type="radio"
							name="playtype"
							checked={!selectedPlayType}
							onchange={(e) => handlePlayTypeClick(null, e)}
							class="w-4 h-4 text-gold-500 border-charcoal-700 focus:ring-gold-500 focus:ring-offset-charcoal-900"
						/>
						<span class="flex-1 text-sm {!selectedPlayType ? 'text-gold-400 font-medium' : 'text-charcoal-300'}">All Types</span>
					</label>

					<!-- Individual Play Types -->
					{#each Object.entries(playTypeLabels) as [key, label] (key)}
						{@const count = getPlayTypeCount(key)}
						{@const isDisabled = count === 0}
						<label class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-charcoal-800/50 cursor-pointer transition-colors {isDisabled ? 'opacity-40 cursor-not-allowed' : ''}">
							<input
								type="radio"
								name="playtype"
								checked={selectedPlayType === key}
								onchange={(e) => handlePlayTypeClick(key, e)}
								disabled={isDisabled}
								class="w-4 h-4 text-gold-500 border-charcoal-700 focus:ring-gold-500 focus:ring-offset-charcoal-900"
							/>
							<span class="flex-1 text-sm {selectedPlayType === key ? 'text-gold-400 font-medium' : 'text-charcoal-300'}">{label}</span>
							<span class="text-xs text-charcoal-400">{count.toLocaleString()}</span>
						</label>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</aside>

<style>
	/* Custom radio styling */
	input[type="radio"] {
		accent-color: #d4a025; /* gold-500 */
	}

	/* Smooth transitions */
	button,
	label {
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* Custom scrollbar for sidebar */
	aside {
		scrollbar-width: thin;
		scrollbar-color: #374151 transparent; /* charcoal-700 */
	}

	aside::-webkit-scrollbar {
		width: 6px;
	}

	aside::-webkit-scrollbar-track {
		background: transparent;
	}

	aside::-webkit-scrollbar-thumb {
		background: #374151; /* charcoal-700 */
		border-radius: 3px;
	}

	aside::-webkit-scrollbar-thumb:hover {
		background: #4b5563; /* charcoal-600 */
	}
</style>
