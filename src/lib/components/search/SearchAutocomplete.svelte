<script lang="ts">
	import { Motion, AnimatePresence } from 'svelte-motion';
	import { Search, X } from 'lucide-svelte';
	import { MOTION } from '$lib/motion-tokens';

	interface SearchSuggestion {
		text: string;
		type: 'sport' | 'category' | 'keyword';
		count?: number;
	}

	interface Props {
		value?: string;
		placeholder?: string;
		sports?: Array<{ name: string; count: number }>;
		categories?: Array<{ name: string; count: number }>;
		onSearch?: (query: string) => void;
		onClear?: () => void;
	}

	let {
		value = $bindable(''),
		placeholder = 'Search photos...',
		sports = [],
		categories = [],
		onSearch,
		onClear
	}: Props = $props();

	let inputElement: HTMLInputElement | undefined = $state();
	let showSuggestions = $state(false);
	let focusedIndex = $state(-1);

	// General keyword suggestions (terms the parser understands)
	const keywords = [
		'golden hour', 'spike', 'block', 'dig', 'serve', 'celebration',
		'dramatic', 'backlit', 'intense', 'peak', 'warm', 'cool',
	];

	// Generate suggestions from server data + keywords
	const suggestions = $derived.by(() => {
		if (!value || value.length < 2) return [];

		const query = value.toLowerCase();
		const results: SearchSuggestion[] = [];

		// Match sports (with counts)
		for (const sport of sports) {
			if (sport.name.toLowerCase().includes(query)) {
				results.push({ text: sport.name, type: 'sport', count: sport.count });
			}
		}

		// Match categories (with counts)
		for (const cat of categories) {
			if (cat.name.toLowerCase().includes(query)) {
				results.push({ text: cat.name, type: 'category', count: cat.count });
			}
		}

		// Match keyword suggestions
		for (const kw of keywords) {
			if (kw.includes(query) && !results.some(r => r.text.toLowerCase() === kw)) {
				results.push({ text: kw, type: 'keyword' });
			}
		}

		return results.slice(0, 8);
	});

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		value = target.value;
		showSuggestions = value.length >= 2;
		focusedIndex = -1;
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (!showSuggestions || suggestions.length === 0) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				focusedIndex = Math.min(focusedIndex + 1, suggestions.length - 1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				focusedIndex = Math.max(focusedIndex - 1, -1);
				break;
			case 'Enter':
				event.preventDefault();
				if (focusedIndex >= 0) {
					selectSuggestion(suggestions[focusedIndex]);
				} else {
					handleSearch();
				}
				break;
			case 'Escape':
				showSuggestions = false;
				focusedIndex = -1;
				break;
		}
	}

	function selectSuggestion(suggestion: SearchSuggestion, event?: MouseEvent) {
		event?.stopPropagation();
		value = suggestion.text;
		showSuggestions = false;
		focusedIndex = -1;
		handleSearch();
	}

	function handleSearch() {
		showSuggestions = false;
		onSearch?.(value);
	}

	function handleClear(event?: MouseEvent) {
		event?.stopPropagation();
		value = '';
		showSuggestions = false;
		focusedIndex = -1;
		onClear?.();
		inputElement?.focus();
	}

	function handleBlur() {
		setTimeout(() => {
			showSuggestions = false;
			focusedIndex = -1;
		}, 200);
	}
</script>

<div class="relative">
	<!-- Search Input -->
	<div class="relative">
		<div class="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-400">
			<Search class="w-4 h-4" />
		</div>
		<input
			bind:this={inputElement}
			type="search"
			{placeholder}
			{value}
			oninput={handleInput}
			onkeydown={handleKeyDown}
			onblur={handleBlur}
			onfocus={() => (showSuggestions = value.length >= 2)}
			class="w-full pl-12 pr-12 py-2 rounded-lg bg-charcoal-900 border border-charcoal-800 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/50 transition-colors text-white placeholder-charcoal-400"
			autocomplete="off"
		/>
		{#if value}
			<button
				onclick={handleClear}
				class="absolute right-4 top-1/2 -translate-y-1/2 text-charcoal-400 hover:text-white transition-colors"
				aria-label="Clear search"
			>
				<X class="w-4 h-4" />
			</button>
		{/if}
	</div>

	<!-- Autocomplete Suggestions -->
	<AnimatePresence>
		{#if showSuggestions && suggestions.length > 0}
			<Motion
				let:motion
				initial={{ opacity: 0, y: -10 }}
				animate={{ opacity: 1, y: 0 }}
				exit={{ opacity: 0, y: -10 }}
				transition={MOTION.spring.gentle}
			>
				<div
					use:motion
					class="absolute z-50 w-full mt-2 bg-charcoal-900 border border-charcoal-800 rounded-lg shadow-2xl overflow-hidden"
				>
					<ul class="py-1">
						{#each suggestions as suggestion, index}
							<li>
								<button
									onclick={(e) => selectSuggestion(suggestion, e)}
									class="w-full px-4 py-3 flex items-center gap-3 transition-colors {focusedIndex ===
									index
										? 'bg-gold-500/10 text-gold-500'
										: 'text-charcoal-200 hover:bg-charcoal-800'}"
								>
									<span class="flex-1 text-left text-sm capitalize">{suggestion.text}</span>
									{#if suggestion.count}
										<span class="text-xs text-charcoal-500">{suggestion.count.toLocaleString()}</span>
									{/if}
									<span class="text-xs text-charcoal-400 capitalize">{suggestion.type}</span>
								</button>
							</li>
						{/each}
					</ul>

					<div class="px-4 py-2 bg-charcoal-800 border-t border-charcoal-700">
						<span class="text-xs text-charcoal-400">
							Press <kbd class="px-1 bg-charcoal-700 rounded">Enter</kbd> to search
						</span>
					</div>
				</div>
			</Motion>
		{/if}
	</AnimatePresence>
</div>

<style>
	kbd {
		font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
	}
</style>
