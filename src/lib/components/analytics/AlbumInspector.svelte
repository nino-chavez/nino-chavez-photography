<script lang="ts">
	import type { AlbumRow } from './AlbumComparisonTable.svelte';
	interface Props { row: AlbumRow | null; reportHref: (albumKey: string) => string; }
	let { row, reportHref }: Props = $props();
	const measures = $derived(row ? [
		['Album opens', row.measures.album_opens], ['Photo opens', row.measures.photo_opens], ['Download actions', row.measures.downloads], ['Favorite additions', row.measures.favorites], ['Share actions', row.measures.shares]
	] : []);
</script>

<aside class="inspector" aria-labelledby="inspector-title" aria-live="polite">
	{#if row}
		<p class="label">Selected album</p><h2 id="inspector-title">{row.name}</h2><p class="context">{row.photoCount.toLocaleString()} photos{row.publishedAt ? ` · published ${row.publishedAt.slice(0, 10)}` : ''}</p>
		<dl>{#each measures as [label, value]}<div><dt>{label}</dt><dd>{value === null ? 'Unavailable' : value.toLocaleString()}</dd></div>{/each}</dl>
		<p class="note">Download actions are requests or handoffs, not confirmed file saves. Shares are handoffs, not confirmed posts.</p>
		<a class="open" href={reportHref(row.key)} data-sveltekit-preload="tap">Open album report</a>
	{:else}
		<p class="label">Album inspector</p><h2 id="inspector-title">Select an album</h2><p class="note">Selecting a row only changes this inspector. Open album report changes the report scope.</p>
	{/if}
</aside>

<style>
	.inspector { background: #172033; border-radius: 14px; color: #f8fbff; min-width: 0; padding: 1rem; }
	.label { color: #9bbce9; font-size: .7rem; font-weight: 800; letter-spacing: .08em; margin: 0; text-transform: uppercase; }
	h2 { font-size: 1.05rem; line-height: 1.25; margin: .4rem 0; }
	.context, .note { color: #c1d0e3; font-size: .78rem; line-height: 1.5; }
	dl { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #40516a; margin: 1rem 0; }
	dl div { background: #223049; padding: .55rem; } dt { color: #b9c7d8; font-size: .68rem; } dd { font-size: .95rem; font-variant-numeric: tabular-nums; font-weight: 700; margin: .2rem 0 0; }
	.open { background: #fff; border-radius: 8px; color: #123f84; display: inline-block; font-size: .8rem; font-weight: 800; margin-top: .4rem; padding: .6rem .75rem; text-decoration: none; }
	.open:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
</style>
