<script lang="ts">
	import AlbumReport from '$lib/components/analytics/AlbumReport.svelte';
	import RecapView from '$lib/components/analytics/RecapView.svelte';
	import type { ActionData, PageData } from './$types';

	/**
	 * `?recap=3` and `?recap=7` open one recap on its own page. Everything else is the album report.
	 * The address is what a stored recap and an email link to, so it keeps working.
	 */
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

{#if data.mode === 'recap'}
	<RecapView view={data.recapView} albumKey={data.albumKey} />
{:else}
	<AlbumReport {data} {form} />
{/if}
