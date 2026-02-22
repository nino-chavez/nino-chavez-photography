<!--
  GlobalSearch - Expandable search bar for header navigation

  Features:
  - Collapsed state with search icon
  - Expands on click or hotkey (Cmd+K / Ctrl+K)
  - Redirects to explore page with search query
  - Global search that works from any page

  Usage:
  <GlobalSearch />
-->

<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { Search, X } from 'lucide-svelte';

	let isExpanded = $state(false);
	let searchQuery = $state('');
	let inputElement = $state<HTMLInputElement | undefined>();

	// Handle global hotkey (Cmd+K on Mac, Ctrl+K on other platforms)
	function handleKeyDown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
			event.preventDefault();
			toggleSearch();
		}

		// Close on Escape
		if (event.key === 'Escape' && isExpanded) {
			event.preventDefault();
			closeSearch();
		}
	}

	// Listen for global keyboard events
	$effect(() => {
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	});

	function toggleSearch() {
		isExpanded = !isExpanded;
		if (isExpanded) {
			// Focus input when expanding
			setTimeout(() => inputElement?.focus(), 100);
		} else {
			// Clear search when collapsing
			searchQuery = '';
		}
	}

	function closeSearch() {
		isExpanded = false;
		searchQuery = '';
	}

	function handleSearch(event?: Event) {
		event?.preventDefault();

		if (!searchQuery.trim()) return;

		// Navigate to explore page with search query — server handles filtering
		const url = new URL(`${base}/explore`, window.location.origin);
		url.searchParams.set('q', searchQuery.trim());

		// Close search and navigate
		closeSearch();
		goto(url.toString());
	}

	function handleInputKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			handleSearch(event);
		} else if (event.key === 'Escape') {
			closeSearch();
		}
	}
</script>

<div class="relative">
	<!-- Collapsed State -->
	{#if !isExpanded}
		<button
			onclick={toggleSearch}
			class="flex items-center gap-2 px-3 py-2 rounded-lg bg-charcoal-900/50 border border-charcoal-800 hover:border-gold-500/50 transition-all hover:scale-105 group"
			aria-label="Search photos (⌘K)"
			title="Search photos (⌘K)"
		>
			<Search class="w-4 h-4 text-charcoal-400 group-hover:text-gold-500 transition-colors" />
			<span class="hidden sm:inline text-sm text-charcoal-400 group-hover:text-gold-500 transition-colors">
				Search
			</span>
			<kbd class="hidden md:inline-flex items-center px-1.5 py-0.5 text-xs bg-charcoal-700 text-charcoal-300 rounded border border-charcoal-600">
				⌘K
			</kbd>
		</button>
	{/if}

	<!-- Expanded State -->
	{#if isExpanded}
		<form
			onsubmit={handleSearch}
			class="flex items-center gap-2 px-3 py-2 rounded-lg bg-charcoal-900 border border-gold-500/50 shadow-lg min-w-[300px] max-w-md animate-search-expand"
		>
			<Search class="w-4 h-4 text-gold-500 flex-shrink-0" />
			<input
				bind:this={inputElement}
				bind:value={searchQuery}
				type="search"
				placeholder="Search photos..."
				onkeydown={handleInputKeyDown}
				class="flex-1 bg-transparent border-none outline-none text-white placeholder-charcoal-400 text-sm"
				autocomplete="off"
				spellcheck="false"
			/>
			{#if searchQuery}
				<button
					type="button"
					onclick={() => searchQuery = ''}
					class="text-charcoal-400 hover:text-white transition-colors flex-shrink-0"
					aria-label="Clear search"
				>
					<X class="w-4 h-4" />
				</button>
			{/if}
			<button
				type="button"
				onclick={closeSearch}
				class="text-charcoal-400 hover:text-white transition-colors flex-shrink-0 ml-2"
				aria-label="Close search"
			>
				<X class="w-4 h-4" />
			</button>
		</form>
	{/if}
</div>

<style>
	/* Ensure search form appears above other content */
	form {
		z-index: 60;
	}

	@keyframes search-expand {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	.animate-search-expand {
		animation: search-expand 0.2s ease-out;
	}
</style>
