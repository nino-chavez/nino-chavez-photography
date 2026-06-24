<!--
  ConsolidatedFilter Component - Unified filter dropdown

  Reduces component count from individual filters to consolidated dropdowns.
  Implements progressive disclosure and maintains all filter functionality.

  Features:
  - Primary Filters: Sport + Category (most used)
  - Advanced Filters: Play Type
  - Progressive disclosure (advanced filters hidden by default)
  - Context-aware counts showing filtered results
  - Design system integration with FilterPill components
  - Full accessibility and keyboard navigation

  Usage:
  <ConsolidatedFilter
    {sports}
    {categories}
    selectedSport={data.selectedSport}
    selectedCategory={data.selectedCategory}
    selectedPlayType={data.selectedPlayType}
    onSportSelect={handleSportSelect}
    onCategorySelect={handleCategorySelect}
    onPlayTypeSelect={handlePlayTypeSelect}
    filterCounts={data.filterCounts}
  />
-->

<script lang="ts">
	import { slide } from 'svelte/transition';
	import { ChevronDown, Trophy, Award, Zap, Activity, Filter } from 'lucide-svelte';
	import Typography from '$lib/components/ui/Typography.svelte';
	import FilterPill from '$lib/components/ui/FilterPill.svelte';

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
		filterCounts?: {
			sports?: Array<{ name: string; count: number }>;
			categories?: Array<{ name: string; count: number }>;
		};
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
		filterCounts
	}: Props = $props();

	// Dropdown states
	let primaryExpanded = $state(false);
	let advancedExpanded = $state(false);
	let primaryRef: HTMLDivElement | undefined = $state();
	let advancedRef: HTMLDivElement | undefined = $state();

	// Label mappings for user-friendly display
	const playTypeLabels: Record<string, string> = {
		attack: 'Attack',
		block: 'Block',
		dig: 'Dig',
		set: 'Set',
		serve: 'Serve',
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

	// Progressive disclosure for primary filters
	let showAllSports = $state(false);
	let showAllCategories = $state(false);

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
		candid: Filter,
		portrait: Activity,
		warmup: Activity,
		ceremony: Award
	};

	// Calculate totals and active counts
	const totalSports = $derived(sportsWithCounts.reduce((sum, s) => sum + s.displayCount, 0));
	const totalCategories = $derived(categoriesWithCounts.reduce((sum, c) => sum + c.displayCount, 0));

	const primaryActiveCount = $derived(
		(selectedSport ? 1 : 0) + (selectedCategory ? 1 : 0)
	);

	const advancedActiveCount = $derived(
		(selectedPlayType ? 1 : 0)
	);

	// Click-outside detection
	function handleClickOutside(event: MouseEvent, dropdownType: 'primary' | 'advanced') {
		const ref = dropdownType === 'primary' ? primaryRef : advancedRef;
		if (ref && !ref.contains(event.target as Node)) {
			if (dropdownType === 'primary') {
				primaryExpanded = false;
			} else {
				advancedExpanded = false;
			}
		}
	}

	// Stable handler references — inline arrows would create a new function each call, so
	// removeEventListener (a different reference) never unregistered them → listener leak.
	const onPrimaryClickOutside = (e: MouseEvent) => handleClickOutside(e, 'primary');
	const onAdvancedClickOutside = (e: MouseEvent) => handleClickOutside(e, 'advanced');

	$effect(() => {
		if (primaryExpanded) {
			document.addEventListener('click', onPrimaryClickOutside);
		} else {
			document.removeEventListener('click', onPrimaryClickOutside);
		}

		if (advancedExpanded) {
			document.addEventListener('click', onAdvancedClickOutside);
		} else {
			document.removeEventListener('click', onAdvancedClickOutside);
		}

		return () => {
			document.removeEventListener('click', onPrimaryClickOutside);
			document.removeEventListener('click', onAdvancedClickOutside);
		};
	});

	// Filter selection handlers
	function handleSportClick(sportName: string | null) {
		onSportSelect?.(sportName);
		primaryExpanded = false;
	}

	function handleCategoryClick(categoryName: string | null) {
		onCategorySelect?.(categoryName);
		primaryExpanded = false;
	}

	function handlePlayTypeClick(playType: string | null) {
		onPlayTypeSelect?.(playType);
		advancedExpanded = false;
	}

	// Display helpers
	const displayedSports = $derived(showAllSports ? sportsWithCounts : sportsWithCounts.slice(0, 5));
	const displayedCategories = $derived(showAllCategories ? categoriesWithCounts : categoriesWithCounts.slice(0, 4));
	const hasMoreSports = $derived(sportsWithCounts.length > 5);
	const hasMoreCategories = $derived(categoriesWithCounts.length > 4);
</script>

<div class="flex flex-wrap items-center gap-2">
	<!-- Primary Filters Dropdown (Sport + Category) -->
	<div class="relative inline-block" bind:this={primaryRef}>
		<button
			onclick={(e) => {
				e.stopPropagation();
				primaryExpanded = !primaryExpanded;
				advancedExpanded = false; // Close other dropdown
			}}
			class="px-3 py-1.5 text-xs rounded-full border transition-all flex items-center gap-1.5 {primaryActiveCount > 0
				? 'bg-gold-500/20 border-gold-500/50 text-gold-300'
				: 'bg-charcoal-800/50 border-charcoal-700 hover:border-gold-500/30'}"
			aria-expanded={primaryExpanded}
			aria-label={primaryExpanded ? 'Collapse primary filters' : 'Expand primary filters'}
		>
			<Trophy class="w-3 h-3" />
			<span>Primary</span>
			{#if primaryActiveCount > 0}
				<span class="px-1.5 py-0.5 rounded-full bg-gold-500/30 text-gold-200 text-xs font-medium">{primaryActiveCount}</span>
			{/if}
			<ChevronDown class="w-3 h-3 transition-transform {primaryExpanded ? 'rotate-180' : ''}" />
		</button>

		{#if primaryExpanded}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				transition:slide
				class="absolute top-full left-0 mt-2 p-4 bg-charcoal-900 border border-charcoal-800 rounded-lg shadow-xl z-50 min-w-[280px]"
				onclick={(e) => e.stopPropagation()}
			>
				<!-- Sports Section -->
				<div class="mb-4">
					<Typography variant="label" class="text-charcoal-300 text-xs font-medium mb-2 block">Sports</Typography>
					<div class="flex flex-wrap gap-2">
						<FilterPill
							label="All"
							count={totalSports}
							state={!selectedSport ? 'active' : 'available'}
							description="Show all sports"
							size="sm"
							onclick={() => handleSportClick(null)}
						/>

						{#each displayedSports as sport (sport.name)}
							{@const pillIcon = sportIcons[sport.name] || Trophy}
							{@const pillState = selectedSport === sport.name ? 'active' : sport.displayCount === 0 ? 'disabled' : 'available'}

							<FilterPill
								label={sport.name.charAt(0).toUpperCase() + sport.name.slice(1)}
								count={sport.displayCount}
								state={pillState}
								description="{sport.name.charAt(0).toUpperCase() + sport.name.slice(1)} photos"
								icon={pillIcon}
								size="sm"
								onclick={() => handleSportClick(sport.name)}
							/>
						{/each}

						{#if hasMoreSports}
							<button
								onclick={() => showAllSports = !showAllSports}
								class="px-3 py-1.5 text-xs rounded-full border border-dashed border-charcoal-700 text-charcoal-400 hover:text-gold-400"
							>
								{showAllSports ? '−' : `+${sports.length - 5}`}
							</button>
						{/if}
					</div>
				</div>

				<!-- Categories Section -->
				<div>
					<Typography variant="label" class="text-charcoal-300 text-xs font-medium mb-2 block">Categories</Typography>
					<div class="flex flex-wrap gap-2">
						<FilterPill
							label="All"
							count={totalCategories}
							state={!selectedCategory ? 'active' : 'available'}
							description="Show all categories"
							size="sm"
							onclick={() => handleCategoryClick(null)}
						/>

						{#each displayedCategories as category (category.name)}
							{@const pillIcon = categoryIcons[category.name] || Award}
							{@const pillState = selectedCategory === category.name ? 'active' : category.displayCount === 0 ? 'disabled' : 'available'}

							<FilterPill
								label={category.name.charAt(0).toUpperCase() + category.name.slice(1)}
								count={category.displayCount}
								state={pillState}
								description="{category.name.charAt(0).toUpperCase() + category.name.slice(1)} photos"
								icon={pillIcon}
								size="sm"
								onclick={() => handleCategoryClick(category.name)}
							/>
						{/each}

						{#if hasMoreCategories}
							<button
								onclick={() => showAllCategories = !showAllCategories}
								class="px-3 py-1.5 text-xs rounded-full border border-dashed border-charcoal-700 text-charcoal-400 hover:text-gold-400"
							>
								{showAllCategories ? '−' : `+${categories.length - 4}`}
							</button>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Advanced Filters Dropdown -->
	<div class="relative inline-block" bind:this={advancedRef}>
		<button
			onclick={(e) => {
				e.stopPropagation();
				advancedExpanded = !advancedExpanded;
				primaryExpanded = false; // Close other dropdown
			}}
			class="px-3 py-1.5 text-xs rounded-full border transition-all flex items-center gap-1.5 {advancedActiveCount > 0
				? 'bg-gold-500/20 border-gold-500/50 text-gold-300'
				: 'bg-charcoal-800/50 border-charcoal-700 hover:border-gold-500/30'}"
			aria-expanded={advancedExpanded}
			aria-label={advancedExpanded ? 'Collapse advanced filters' : 'Expand advanced filters'}
		>
			<Filter class="w-3 h-3" />
			<span>Advanced</span>
			{#if advancedActiveCount > 0}
				<span class="px-1.5 py-0.5 rounded-full bg-gold-500/30 text-gold-200 text-xs font-medium">{advancedActiveCount}</span>
			{/if}
			<ChevronDown class="w-3 h-3 transition-transform {advancedExpanded ? 'rotate-180' : ''}" />
		</button>

		{#if advancedExpanded}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				transition:slide
				class="absolute top-full left-0 mt-2 p-4 bg-charcoal-900 border border-charcoal-800 rounded-lg shadow-xl z-50 min-w-[320px] max-w-[400px]"
				onclick={(e) => e.stopPropagation()}
			>
				<!-- Play Type Section -->
				<div>
					<Typography variant="label" class="text-charcoal-300 text-xs font-medium mb-2 block">Play Type</Typography>
					<div class="flex flex-wrap gap-2">
						<FilterPill
							label="All"
							state={!selectedPlayType ? 'active' : 'available'}
							description="Show all play types"
							size="sm"
							onclick={() => handlePlayTypeClick(null)}
						/>

						{#each Object.entries(playTypeLabels) as [key, label] (key)}
							<FilterPill
								label={label}
								state={selectedPlayType === key ? 'active' : 'available'}
								description="{label} plays"
								size="sm"
								onclick={() => handlePlayTypeClick(key)}
							/>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	button {
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}
</style>
