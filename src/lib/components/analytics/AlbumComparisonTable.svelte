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
		measure: keyof MeasureTotals;
		measureLabel: string;
		risingAvailable: boolean;
		onselect: (row: AlbumRow) => void;
		reportHref: (albumKey: string) => string;
	}
	let { rows, selectedKey, measure, measureLabel, risingAvailable, onselect, reportHref }: Props = $props();

	function metric(total: number | null): string { return total === null ? '—' : total.toLocaleString(); }
	const measures = $derived([
		{ key: 'album_opens' as const, label: 'Album opens' },
		{ key: 'photo_opens' as const, label: 'Photo opens' },
		{ key: 'downloads' as const, label: 'Downloads' },
		{ key: 'favorites' as const, label: 'Favorites' },
		{ key: 'shares' as const, label: 'Shares' }
	].filter((item) => item.key !== measure));
</script>

<div class="table-region" role="region" aria-label="Album comparison table">
	<table>
		<thead>
			<tr><th scope="col">Album</th><th scope="col" class="number">{measureLabel}</th>{#each measures as measure}<th scope="col" class="number">{measure.label}</th>{/each}<th scope="col">Last recorded activity</th><th scope="col"><span class="sr-only">Actions</span></th></tr>
		</thead>
		<tbody>
			{#each rows as row}
				<tr class:selected={row.key === selectedKey} aria-selected={row.key === selectedKey}>
					<td><button type="button" onclick={() => onselect(row)} aria-pressed={row.key === selectedKey}><strong>{row.name}</strong><small>{row.photoCount.toLocaleString()} photos</small></button></td>
					<td class="number">{metric(row.count)}{#if risingAvailable && row.risingValue !== null}<small>{row.risingValue >= 0 ? '+' : ''}{row.risingValue.toLocaleString(undefined, { maximumFractionDigits: 1 })} rising</small>{/if}</td>
					{#each measures as measure}<td class="number">{metric(row.measures[measure.key])}</td>{/each}
					<td>{row.lastActivity ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }).format(new Date(row.lastActivity)) : '—'}</td>
					<td><a href={reportHref(row.key)} data-sveltekit-preload="hover">Compare</a></td>
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
