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
		publishedAt: string | null;
	};
	interface Props {
		rows: AlbumRow[];
		selectedKey: string | null;
		measureLabel: string;
		risingAvailable: boolean;
		onselect: (row: AlbumRow) => void;
		reportHref: (albumKey: string) => string;
	}
	let { rows, selectedKey, measureLabel, risingAvailable, onselect, reportHref }: Props = $props();

	function metric(total: number | null): string { return total === null ? '—' : total.toLocaleString(); }
</script>

<div class="table-region" tabindex="0" role="region" aria-label="Album comparison table">
	<table>
		<thead>
			<tr><th scope="col">Album</th><th scope="col" class="number">{measureLabel}</th><th scope="col" class="number">Album opens</th><th scope="col" class="number">Photo opens</th><th scope="col" class="number">Downloads</th><th scope="col" class="number">Favorites</th><th scope="col" class="number">Shares</th><th scope="col">Last recorded activity</th><th scope="col"><span class="sr-only">Report</span></th></tr>
		</thead>
		<tbody>
			{#each rows as row}
				<tr class:selected={row.key === selectedKey} aria-selected={row.key === selectedKey}>
					<td><button type="button" onclick={() => onselect(row)} aria-pressed={row.key === selectedKey}><strong>{row.name}</strong><small>{row.photoCount.toLocaleString()} photos</small></button></td>
					<td class="number">{metric(row.count)}{#if risingAvailable && row.risingValue !== null}<small>{row.risingValue >= 0 ? '+' : ''}{row.risingValue.toLocaleString(undefined, { maximumFractionDigits: 1 })} rising</small>{/if}</td>
					<td class="number">{metric(row.measures.album_opens)}</td><td class="number">{metric(row.measures.photo_opens)}</td><td class="number">{metric(row.measures.downloads)}</td><td class="number">{metric(row.measures.favorites)}</td><td class="number">{metric(row.measures.shares)}</td>
					<td>{row.lastActivity ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }).format(new Date(row.lastActivity)) : '—'}</td>
					<td><a href={reportHref(row.key)} data-sveltekit-preload="hover">Open report</a></td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.table-region { border: 1px solid #d8e0ea; border-radius: 14px; overflow: auto; background: #fff; }
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
	.number { font-variant-numeric: tabular-nums; text-align: right; }
	a { color: #174ea6; font-weight: 700; white-space: nowrap; }
	.sr-only { clip: rect(0 0 0 0); clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
</style>
