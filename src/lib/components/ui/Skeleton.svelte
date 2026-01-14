<!--
  Skeleton Component - Loading placeholder with pulse animation

  Features:
  - Generic placeholder for any loading content
  - Animated pulse effect
  - Accessible with proper ARIA labels
  - Flexible sizing via class prop

  Usage:
  <Skeleton class="h-4 w-32" />
  <Skeleton class="h-40 w-full rounded-lg" />
  <Skeleton class="h-8 w-8 rounded-full" />
-->

<script lang="ts">
	interface Props {
		class?: string;
	}

	let { class: className = '' }: Props = $props();
</script>

<div
	class="animate-pulse bg-charcoal-800 rounded {className}"
	role="status"
	aria-label="Loading"
>
	<span class="sr-only">Loading...</span>
</div>

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}
</style>
