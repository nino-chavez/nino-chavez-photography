<!--
  FilterChip Component - Active filter display chip

  Features:
  - Shows label and value of active filter
  - Remove button with X icon
  - Hover effects and transitions
  - Compact design for horizontal layout

  Usage:
  <FilterChip label="Sport: volleyball" onRemove={handleRemove} />
-->

<script lang="ts">
	import { X } from 'lucide-svelte';

	interface Props {
		label: string;
		onRemove?: () => void;
	}

	let { label, onRemove }: Props = $props();

	function handleClick(event: MouseEvent) {
		event.stopPropagation();
		onRemove?.();
	}
</script>

{#if onRemove}
	<button
		onclick={handleClick}
		class="inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-full border border-gold-500/30 bg-gold-500/20 px-3 py-2 text-xs text-gold-300 transition-colors hover:bg-gold-500/30"
		aria-label="Remove filter: {label}"
	>
		<span class="min-w-0 break-words font-medium">{label}</span>
		<X class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
	</button>
{:else}
	<span class="inline-flex min-h-[44px] items-center rounded-full border border-gold-500/30 bg-gold-500/20 px-3 py-2 text-xs text-gold-300">{label}</span>
{/if}

<style>
	button {
		-webkit-tap-highlight-color: transparent;
	}
</style>
