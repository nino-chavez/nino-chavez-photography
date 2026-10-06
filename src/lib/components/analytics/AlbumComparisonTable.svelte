<script lang="ts">
	import type { MeasureTotals } from '$lib/analytics/report-contract';

	export type AlbumRow = {
		key: string;
		name: string;
		photoCount: number;
		count: number | null;
		previousCount: number | null;
		difference: number | null;
		risingValue: number | null;
		measures: MeasureTotals;
		lastActivity: string | null;
		/** First-publication date in the reporting timezone, marked "(inferred)" when recovered from a log; null when none is recorded. */
		publishedLabel: string | null;
		/** Published after the comparison window ended, so "previous" is not a measured zero. */
		publishedAfterComparison: boolean;
		/** Position among every album in these dates by the chosen measure; null when only some albums are in the report. */
		rank: number | null;
	};
	interface Props {
		rows: AlbumRow[];
		selectedKey: string | null;
		measure: keyof MeasureTotals;
		measureLabel: string;
		risingAvailable: boolean;
		comparisonLabel?: string;
		risingBasis?: string;
		onselect: (row: AlbumRow) => void;
		reportHref: (albumKey: string) => string;
		/** Hide the per-row report link when the report is already scoped to that one album. */
		scopedToOneAlbum?: boolean;
	}
	let { rows, selectedKey, measure, measureLabel, risingAvailable, comparisonLabel = '', risingBasis = 'absolute', onselect, reportHref, scopedToOneAlbum = false }: Props = $props();
	let regionWidth = $state(0);
	let tableWidth = $state(0);
	const overflowing = $derived(tableWidth > regionWidth + 1);

	function metric(total: number | null): string { return total === null ? '—' : total.toLocaleString(); }
	const measures = $derived([
		{ key: 'album_opens' as const, label: 'Album opens' },
		{ key: 'photo_opens' as const, label: 'Photo opens' },
		{ key: 'downloads' as const, label: 'Downloads' },
		{ key: 'favorites' as const, label: 'Favorites' },
		{ key: 'shares' as const, label: 'Shares' }
	].filter((item) => item.key !== measure));
</script>

<div class="comparison">{#if comparisonLabel}<p class="scroll-help">{comparisonLabel}</p>{/if}{#if overflowing}<p class="scroll-help">Scroll sideways to compare every measure. Album names stay visible.</p>{/if}
<!-- svelte-ignore a11y_no_noninteractive_tabindex -- a sideways-scrolling table must take keyboard focus so it can be scrolled without a mouse (WCAG 2.1.1) -->
<div class="table-region" role="region" aria-label="Album comparison table" tabindex="0" bind:clientWidth={regionWidth}>
	<table bind:clientWidth={tableWidth}>
		<thead>
			<tr><th scope="col">Album</th><th scope="col" class="number">Current · {measureLabel}</th><th scope="col" class="number">Previous</th><th scope="col" class="number">Change{risingBasis==='daily_rate' ? ' per day' : ''}</th>{#each measures as measure}<th scope="col" class="number">{measure.label}</th>{/each}<th scope="col">Last recorded activity</th>{#if !scopedToOneAlbum}<th scope="col"><span class="sr-only">Actions</span></th>{/if}</tr>
		</thead>
		<tbody>
			{#each rows as row}
				<tr class:selected={row.key === selectedKey} aria-selected={row.key === selectedKey}>
					<td><button type="button" onclick={() => onselect(row)} aria-pressed={row.key === selectedKey}><strong>{row.name}</strong><small>{row.photoCount.toLocaleString()} photos</small></button></td>
					<td class="number">{metric(row.count)}</td><td class="number">{#if row.publishedAfterComparison}<span class="state">Not published</span>{:else}{metric(row.previousCount)}{/if}</td><td class="number">{#if row.publishedAfterComparison}<span class="state">New album</span>{:else if risingAvailable && row.risingValue !== null}{row.risingValue >= 0 ? '+' : ''}{row.risingValue.toLocaleString(undefined, {maximumFractionDigits:1})}{:else}Unavailable{/if}</td>
					{#each measures as measure}<td class="number">{metric(row.measures[measure.key])}</td>{/each}
					<td>{row.lastActivity ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }).format(new Date(row.lastActivity)) : '—'}</td>
					{#if !scopedToOneAlbum}<td><a href={reportHref(row.key)} data-sveltekit-preload="hover" aria-label={`Open the report for ${row.name}`}>Open report</a></td>{/if}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
</div>

<style>
	.comparison { min-width:0; }
	.scroll-help { color:#526176; font-size:.75rem; margin:0 0 .6rem; }
	.table-region { position: relative; border: 1px solid #d8e0ea; border-radius: 14px; overflow: auto; background: #fff; }
	.table-region:focus-visible { outline: 3px solid #1769e0; outline-offset: 2px; }
	table { border-collapse: collapse; min-width: 62rem; width: 100%; font-size: .8rem; }
	th { background: #f4f7fb; color: #526176; font-size: .7rem; font-weight: 700; letter-spacing: .03em; text-align: left; text-transform: uppercase; }
	th, td { border-bottom: 1px solid #e8edf3; padding: .65rem .75rem; vertical-align: middle; }
	tr:last-child td { border-bottom: 0; }
	tr.selected { background: #e9f2ff; box-shadow: inset 3px 0 #1769e0; }
	button { background: transparent; border: 0; color: #172033; cursor: pointer; display: grid; font: inherit; gap: .15rem; padding: 0; text-align: left; }
	button:hover strong, a:hover { color: #174ea6; text-decoration: underline; text-underline-offset: .18em; }
	button:focus-visible, a:focus-visible { outline: 2px solid #1769e0; outline-offset: 3px; }
	strong { font-weight: 700; }
	small { color: #65748a; display: block; font-size: .7rem; margin-top: .12rem; }
	.state { color: #526176; font-weight: 600; white-space: nowrap; }
	.number { font-variant-numeric: tabular-nums; text-align: right; }
	a { color: #174ea6; font-weight: 700; white-space: nowrap; }
	.sr-only { clip: rect(0 0 0 0); clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
	@media (max-width: 639px) {
		th:first-child, td:first-child { position: sticky; left: 0; z-index: 1; background: #fff; min-width: 8rem; max-width: 10rem; overflow-wrap: anywhere; box-shadow: 1px 0 #d8e0ea; }
		th:first-child { background: #f4f7fb; }
	}
</style>
