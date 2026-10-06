<script lang="ts">
	import type { MeasureTotals } from '$lib/analytics/report-contract';
	import type { AlbumRow } from './AlbumComparisonTable.svelte';
	interface Props { row: AlbumRow | null; measure: keyof MeasureTotals; measureLabel?: string; comparisonLabel?: string; risingAvailable?: boolean; risingBasis?: string; albumCount?: number; reportHref: (albumKey: string, section: 'albums' | 'photos') => string; }
	let { row, measure, reportHref, measureLabel = 'Recorded actions', comparisonLabel = '', risingAvailable = false, risingBasis = 'absolute', albumCount = 0 }: Props = $props();
	const measures = $derived(row ? ([
		['album_opens', 'Album opens'], ['photo_opens', 'Photo opens'], ['downloads', 'Download actions'], ['favorites', 'Favorite additions'], ['shares', 'Share actions']
	] as const).filter(([key]) => key !== measure).map(([key, label]) => [label, row.measures[key]] as const) : []);
</script>

<aside class="inspector" aria-labelledby="inspector-title" aria-live="polite">
	{#if row}
		<p class="label">Selected album</p><h2 id="inspector-title">{row.name}</h2><p class="context">{row.photoCount.toLocaleString()} photos{row.publishedLabel ? ` · published ${row.publishedLabel}` : ''}</p>
		<p class="context">{comparisonLabel}</p>
		{#if row.rank !== null && albumCount > 1}<p class="rank">Ranked <strong>{row.rank.toLocaleString()} of {albumCount.toLocaleString()}</strong> albums by {measureLabel.toLowerCase()} in these dates.</p>{/if}
		<dl class="comparison"><div><dt>{measureLabel}</dt><dd>{row.count?.toLocaleString() ?? 'Unavailable'}</dd></div><div><dt>Previous</dt><dd>{row.publishedAfterComparison ? 'Not published' : row.previousCount?.toLocaleString() ?? 'Unavailable'}</dd></div><div><dt>Change{risingBasis==='daily_rate' && !row.publishedAfterComparison ? ' per day' : ''}</dt><dd>{row.publishedAfterComparison ? 'New album' : risingAvailable && row.risingValue!==null ? `${row.risingValue>=0?'+':''}${row.risingValue.toLocaleString(undefined,{maximumFractionDigits:1})}` : 'Unavailable'}</dd></div></dl>
		{#if row.publishedAfterComparison}<p class="note">This album was published after the previous period ended, so there was nothing to compare. Its whole total is new activity, not growth.</p>{/if}
		<dl>{#each measures as [label, value]}<div><dt>{label}</dt><dd>{value === null ? 'Unavailable' : value.toLocaleString()}</dd></div>{/each}</dl>
		<p class="note">Download actions are requests or handoffs, not confirmed file saves. Shares are handoffs, not confirmed posts.</p>
		<a class="open" href={reportHref(row.key, 'albums')+'#albums'} data-sveltekit-preload="tap">Open album report</a>
		<a class="open photos" href={reportHref(row.key, 'photos')+'#photos'}>View album photos</a>
	{:else}
		<p class="label">Album inspector</p><h2 id="inspector-title">Select an album</h2><p class="note">Selecting a row only changes this inspector. Open album report changes the report scope.</p>
	{/if}
</aside>

<style>
	.inspector { background: #f4f7fb; border: 1px solid #d8e0ea; border-radius: 14px; color: #172033; min-width: 0; padding: 1rem; }
	.label { color: #174ea6; font-size: .7rem; font-weight: 800; letter-spacing: .08em; margin: 0; text-transform: uppercase; }
	h2 { font-size: 1.05rem; line-height: 1.25; margin: .4rem 0; }
	.context, .note { color: #526176; font-size: .78rem; line-height: 1.5; }
	dl { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #d8e0ea; margin: 1rem 0; }
	.comparison { grid-template-columns: repeat(3, minmax(0, 1fr)); }
	.rank { font-size: .82rem; line-height: 1.45; margin: .6rem 0 0; }
	dl div { background: #fff; padding: .55rem; } dt { color: #65748a; font-size: .68rem; } dd { font-size: .95rem; font-variant-numeric: tabular-nums; font-weight: 700; margin: .2rem 0 0; }
	.open { background: #1769e0; border-radius: 8px; color: #fff; display: inline-block; font-size: .8rem; font-weight: 800; margin-top: .4rem; padding: .6rem .75rem; text-decoration: none; }
	.photos { background:#fff; border:1px solid #aab7c8; color:#174ea6; }
	.open:focus-visible { outline: 2px solid #174ea6; outline-offset: 3px; }
</style>
