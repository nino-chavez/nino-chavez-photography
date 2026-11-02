<!--
  FilterSidebarDrawer Component - Mobile slide-in drawer for filters

  A mobile-optimized version of FilterSidebar that slides in from the right.
  Uses the same internal structure as FilterSidebar for consistency.

  Features:
  - Slides in from right with backdrop overlay
  - Full-height drawer with scroll
  - Close button and backdrop click to dismiss
  - Escape key to close
  - Same accordion sections as desktop sidebar
  - Touch-friendly spacing and targets

  Usage:
  <FilterSidebarDrawer
    bind:open={drawerOpen}
    {sports}
    {categories}
    selectedSport={data.selectedSport}
    onSportSelect={handleSportSelect}
    onClose={() => drawerOpen = false}
  />
-->

<script lang="ts">
	import { X } from 'lucide-svelte';
	import FilterSidebar from './FilterSidebar.svelte';
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
		open: boolean;
		sports: Sport[];
		categories: Category[];
		selectedSport?: string | null;
		selectedCategory?: string | null;
		selectedPlayType?: string | null;
		selectedDivision?: string | null;
		selectedLevel?: string | null;
		selectedQuery?: string | null;
		onSportSelect?: (sport: string | null) => void;
		onCategorySelect?: (category: string | null) => void;
		onPlayTypeSelect?: (playType: string | null) => void;
		onDivisionSelect?: (division: string | null) => void;
		onLevelSelect?: (level: string | null) => void;
		onClearAll?: () => void;
		onClose?: () => void;
		filterCounts?: FilterCounts;
	}

	let {
		open = $bindable(false),
		sports,
		categories,
		selectedSport = null,
		selectedCategory = null,
		selectedPlayType = null,
		selectedDivision = null,
		selectedLevel = null,
		selectedQuery = null,
		onSportSelect,
		onCategorySelect,
		onPlayTypeSelect,
		onDivisionSelect,
		onLevelSelect,
		onClearAll,
		onClose,
		filterCounts
	}: Props = $props();

	// Native modal behavior keeps the background inert and restores keyboard focus.
	$effect(() => {
		if (!open) return;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => { document.body.style.overflow = previousOverflow; };
	});

	function close() {
		if (!open) return;
		open = false;
		onClose?.();
	}

	function showDrawer(node: HTMLDialogElement) {
		const previous = document.activeElement as HTMLElement | null;
		node.showModal();
		return () => {
			node.close();
			// Svelte removes the dialog after its outro, so restore focus after removal.
			queueMicrotask(() => { if (previous?.isConnected) previous.focus(); });
		};
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target !== event.currentTarget) return;
		const bounds = (event.currentTarget as HTMLDialogElement).getBoundingClientRect();
		if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
	}
</script>

{#if open}
	<dialog
		{@attach showDrawer}
		class="filter-sidebar-drawer-panel fixed inset-y-0 left-auto right-0 m-0 ml-auto p-0 h-full max-h-none w-full max-w-sm bg-charcoal-950 text-inherit border-l border-charcoal-800 shadow-2xl overflow-y-auto"
		aria-label="Filter options"
		onclick={handleBackdropClick}
		oncancel={(event) => { event.preventDefault(); close(); }}
		onclose={close}
	>
			<!-- Header with close button -->
			<div class="sticky top-0 z-10 bg-charcoal-950/95 backdrop-blur-sm border-b border-charcoal-800 px-4 py-3 flex items-center justify-between">
				<h2 class="text-lg font-semibold">Filters</h2>
				<button
					onclick={close}
					class="p-2 -mr-2 rounded-lg hover:bg-charcoal-800 transition-colors"
					aria-label="Close filters"
				>
					<X class="w-5 h-5" />
				</button>
			</div>

			<!-- Filter content (reuse FilterSidebar structure) -->
			<div class="p-4">
				<FilterSidebar
					{sports}
					{categories}
					{selectedSport}
					{selectedCategory}
					{selectedPlayType}
					{selectedDivision}
					{selectedLevel}
					{selectedQuery}
					{onSportSelect}
					{onCategorySelect}
					{onPlayTypeSelect}
					{onDivisionSelect}
					{onLevelSelect}
					{onClearAll}
					{filterCounts}
				/>
			</div>
	</dialog>
{/if}

<style>
	.filter-sidebar-drawer-panel::backdrop {
		background: color-mix(in srgb, var(--color-charcoal-950) 80%, transparent);
		backdrop-filter: blur(4px);
	}
	/* Override sidebar's sticky positioning for drawer context */
	:global(.filter-sidebar-drawer) {
		position: static !important;
		height: auto !important;
		width: 100% !important;
	}
</style>
