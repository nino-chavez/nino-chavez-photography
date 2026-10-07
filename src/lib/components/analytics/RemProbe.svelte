<script lang="ts">
	/**
	 * The size of one rem in pixels, kept current. A chart is drawn in pixels, so its text and its margins have to be told how big
	 * the page's text is; this element is exactly 1rem wide, so its width is that number, and it changes when the reader's text size does.
	 */
	let { rem = $bindable(16) }: { rem?: number } = $props();
</script>

<span class="probe" bind:clientWidth={rem} aria-hidden="true"></span>

<style>
	.probe { display: block; height: 0; pointer-events: none; position: absolute; visibility: hidden; width: 1rem; }
</style>
