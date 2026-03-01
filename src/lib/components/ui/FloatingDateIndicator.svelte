<!--
  FloatingDateIndicator Component - Shows current timeline position during scroll

  Features:
  - Appears during active scrolling
  - Fades after 1 second of no scroll
  - Shows current month/year + photo count
  - Minimal, non-intrusive design
  - Center of screen overlay

  Usage:
  <FloatingDateIndicator
    visible={isScrolling}
    year={2024}
    month="October"
    photoCount={147}
  />
-->

<script lang="ts">
	import { fly } from 'svelte/transition';

	interface Props {
		visible: boolean;
		year: number;
		month: string;
		photoCount: number;
	}

	let { visible = false, year, month, photoCount }: Props = $props();
</script>

{#if visible}
	<div
		transition:fly={{ y: -20, duration: 200 }}
		class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
		role="status"
		aria-live="polite"
	>
		<div
			class="px-6 py-3 bg-charcoal-900/95 backdrop-blur-md rounded-xl border border-gold-500/30 shadow-2xl"
		>
			<div class="text-center">
				<div class="text-2xl font-bold text-white">{month} {year}</div>
				<div class="text-sm text-charcoal-400 mt-1">{photoCount} photos</div>
			</div>
		</div>
	</div>
{/if}
