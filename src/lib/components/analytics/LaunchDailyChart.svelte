<script lang="ts">
	import type { DailyChart } from '$lib/analytics/launch-report-view';

	interface Props { chart: DailyChart; undated?: boolean }
	let { chart, undated = false }: Props = $props();

	const height = 190;
	const pad = { top: 22, right: 12, bottom: 44, left: 40 };
	let width = $state(640);
	const inner = $derived(Math.max(120, width - pad.left - pad.right));
	const band = $derived(inner / Math.max(1, chart.bars.length));
	const barWidth = $derived(Math.max(6, Math.min(44, band - 6)));
	const plotHeight = height - pad.top - pad.bottom;
	const y = (value: number) => pad.top + plotHeight - (value / chart.max) * plotHeight;
	const x = (index: number) => pad.left + band * index + band / 2;
	const peak = $derived(chart.bars.reduce((best, bar, index) => ((bar.opens ?? -1) > (chart.bars[best]?.opens ?? -1) ? index : best), 0));
	const line = $derived(chart.bars.flatMap((bar, index) => (bar.median === null ? [] : [`${x(index).toFixed(1)},${y(bar.median).toFixed(1)}`])).join(' '));
	const hasMedian = $derived(chart.bars.some((bar) => bar.median !== null));
	const labelEvery = $derived(Math.max(1, Math.ceil((undated ? 56 : 28) / band)));
	const medianOf = $derived(Math.max(0, ...chart.bars.map((bar) => bar.medianOf)));
	const title = $derived(chart.title);
	const gaps = $derived(chart.bars.filter((bar) => bar.opens === null).length);
	const description = $derived(
		`${chart.bars.length} full days. Most photo opens: ${chart.bars[peak]?.opens?.toLocaleString() ?? 'unknown'} on ${chart.bars[peak]?.date ?? 'no day'}.${gaps ? ` ${gaps} ${gaps === 1 ? 'day has' : 'days have'} incomplete records and no bar.` : ''} The full numbers follow in a table.`
	);
</script>

<figure class="daily">
	<figcaption>
		<strong>{title}</strong>
		<span>{chart.summary}</span>
	</figcaption>
	<div class="plot" bind:clientWidth={width}>
		{#if chart.bars.length}
			<svg {width} {height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}. ${description}`}>
				<line class="axis" x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} />
				<line class="grid" x1={pad.left} x2={width - pad.right} y1={y(chart.max)} y2={y(chart.max)} />
				<text class="tick" x={pad.left - 6} y={y(chart.max) + 4} text-anchor="end">{chart.max.toLocaleString()}</text>
				<text class="tick" x={pad.left - 6} y={y(0) + 4} text-anchor="end">0</text>
				{#each chart.bars as bar, index}
					{#if bar.opens === null}
						<g>
							<title>{bar.date}: records incomplete, no count</title>
							<rect class="gap" x={x(index) - barWidth / 2} y={y(0) - 14} width={barWidth} height="14" rx="2" />
						</g>
					{:else}
						<g>
							<title>{bar.date}: {bar.opens.toLocaleString()} photo opens{bar.median !== null ? `; median of earlier launches ${bar.median.toLocaleString()}` : ''}</title>
							<rect class="bar" class:peak={index === peak} x={x(index) - barWidth / 2} y={y(bar.opens)} width={barWidth} height={Math.max(bar.opens > 0 ? 2 : 0, y(0) - y(bar.opens))} rx="2" />
						</g>
					{/if}
					{#if index % labelEvery === 0}
						<text class="tick" x={x(index)} y={height - 24} text-anchor="middle">{bar.label}</text>
					{/if}
				{/each}
				{#if chart.bars[peak]?.opens}
					<text class="value" x={Math.min(Math.max(x(peak), pad.left + 14), width - pad.right - 14)} y={Math.max(12, y(chart.bars[peak].opens ?? 0) - 6)} text-anchor="middle">{chart.bars[peak].opens?.toLocaleString()}</text>
				{/if}
				{#if hasMedian}<polyline class="median" points={line} fill="none" />{/if}
				<text class="tick axis-name" x={pad.left + inner / 2} y={height - 4} text-anchor="middle">{undated ? 'Day' : 'Day since publication'}</text>
			</svg>
		{:else}
			<p class="none">No full day to chart yet.</p>
		{/if}
	</div>
	<p class="legend">
		<span class="swatch bar-swatch" aria-hidden="true"></span> This album
		{#if hasMedian}<span class="swatch line-swatch" aria-hidden="true"></span> Median of {medianOf === 1 ? '1 earlier launch' : `${medianOf} earlier launches`} on the same day{/if}
		{#if gaps}<span class="swatch gap-swatch" aria-hidden="true"></span> Records incomplete{/if}
	</p>
	{#if chart.bars.length}
		<details class="table-alt">
			<summary>Show these numbers as a table</summary>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -- a sideways-scrolling table must take keyboard focus so it can be scrolled without a mouse (WCAG 2.1.1) -->
			<div class="scroll" role="region" aria-label="Daily photo opens table" tabindex="0">
				<table>
					<caption class="sr-only">Photo opens by day</caption>
					<thead><tr>{#if !undated}<th scope="col">Day</th>{/if}<th scope="col">Date</th><th scope="col" class="num">Photo opens</th>{#if hasMedian}<th scope="col" class="num">Median of earlier launches</th>{/if}</tr></thead>
					<tbody>
						{#each chart.bars as bar}
							<tr>{#if !undated}<th scope="row">{bar.label}</th>{/if}<td>{bar.date}</td><td class="num">{bar.opens === null ? 'Incomplete' : bar.opens.toLocaleString()}</td>{#if hasMedian}<td class="num">{bar.median === null ? 'None' : bar.median.toLocaleString()}</td>{/if}</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</details>
	{/if}
</figure>

<style>
	.daily { margin: 0; min-width: 0; }
	figcaption { display: grid; gap: .15rem; margin-bottom: .5rem; }
	figcaption strong { color: #172033; font-size: .95rem; }
	figcaption span, .legend { color: #526176; font-size: .8rem; line-height: 1.45; }
	.plot { min-width: 0; overflow: hidden; }
	svg { display: block; max-width: 100%; }
	.axis { stroke: #6f7f95; stroke-width: 1; }
	.grid { stroke: #e1e8f0; stroke-width: 1; stroke-dasharray: 3 3; }
	.tick { fill: #526176; font-size: 12px; font-variant-numeric: tabular-nums; }
	.value { fill: #172033; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
	.bar { fill: #5b8fe0; }
	.bar.peak { fill: #1458c4; }
	.gap { fill: none; stroke: #6f7f95; stroke-width: 1.5; stroke-dasharray: 3 2; }
	.median { stroke: #b4541a; stroke-width: 2; stroke-dasharray: 5 3; stroke-linejoin: round; }
	.none { color: #526176; padding: 1.5rem 0; margin: 0; }
	.legend { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem .9rem; margin: .4rem 0 0; }
	.swatch { display: inline-block; width: .9rem; height: .6rem; margin-right: .3rem; vertical-align: middle; }
	.bar-swatch { background: #1458c4; border-radius: 2px; }
	.line-swatch { border-top: 2px dashed #b4541a; height: 0; }
	.gap-swatch { border: 1.5px dashed #6f7f95; border-radius: 2px; }
	.table-alt { margin-top: .6rem; border-top: 1px solid #e1e8f0; padding-top: .5rem; }
	summary { cursor: pointer; color: #174ea6; font-size: .85rem; font-weight: 650; min-height: 2.75rem; display: flex; align-items: center; }
	summary:focus-visible, .scroll:focus-visible { outline: 3px solid #174ea6; outline-offset: 2px; }
	.scroll { overflow-x: auto; }
	table { border-collapse: collapse; font-size: .85rem; min-width: 100%; }
	th, td { border-bottom: 1px solid #e1e8f0; padding: .4rem .6rem; text-align: left; white-space: nowrap; color: #172033; }
	thead th { color: #526176; font-weight: 650; font-size: .78rem; }
	.num { text-align: right; font-variant-numeric: tabular-nums; }
	.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
	@media (forced-colors: active) { .bar, .bar.peak { fill: CanvasText; } .median { stroke: Highlight; } .bar-swatch { background: CanvasText; forced-color-adjust: none; } .line-swatch { border-top-color: Highlight; forced-color-adjust: none; } }
	@media (prefers-contrast: more) { .tick, figcaption span, .legend { color: #2b3748; fill: #2b3748; } .grid { stroke: #6f7f95; } .bar { fill: #1f5fcc; } .bar.peak { fill: #0d3a85; } }
</style>
