<script lang="ts">
	import { figureText, rankText, type IndexLaunchRow } from '$lib/analytics/album-index';
	import { nameWithoutDate } from '$lib/analytics/launch-report-view';
	import RemProbe from '$lib/components/analytics/RemProbe.svelte';

	/** The launches the reader chose, in the order they chose them. Two to four. */
	interface Props { rows: IndexLaunchRow[] }
	let { rows }: Props = $props();

	// Colour is never the only difference between two lines: each also has its own dash and its own end marker.
	const looks = [
		{ color: '#1458c4', dash: '', marker: 'circle', name: 'solid line, circle' },
		{ color: '#b3470a', dash: '9 4', marker: 'square', name: 'dashed line, square' },
		{ color: '#1b7a43', dash: '2 4', marker: 'triangle', name: 'dotted line, triangle' },
		{ color: '#7a3b9e', dash: '11 3 2 3', marker: 'diamond', name: 'dash-dot line, diamond' }
	] as const;

	// The chart is drawn in pixels, so its size and its text follow the page's text size (`rem`, one rem in pixels).
	let rem = $state(16);
	const u = $derived(rem / 16);
	const height = $derived(260 * u);
	const pad = $derived({ top: 22 * u, right: 16 * u, bottom: 38 * u, left: 48 * u });
	let width = $state(560);
	const lines = $derived(rows.map((row, i) => ({ row, look: looks[i % looks.length], end: row.curve.points.at(-1) ?? null })));
	const days = $derived(Math.max(8, ...lines.map((line) => (line.end?.day ?? 0) + 1)));
	const max = $derived(Math.max(1, ...lines.flatMap((line) => line.row.curve.points.map((point) => point.total))));
	const inner = $derived(Math.max(120, width - pad.left - pad.right));
	const plotHeight = $derived(height - pad.top - pad.bottom);
	const x = (day: number) => pad.left + (day / (days - 1)) * inner;
	const y = (total: number) => pad.top + plotHeight - (total / max) * plotHeight;
	const path = (points: Array<{ day: number; total: number }>) => points.map((point) => `${x(point.day).toFixed(1)},${y(point.total).toFixed(1)}`).join(' ');
	const ticks = $derived([0, 3, 7, 13].filter((day) => day < days));
	const summary = $derived(lines.map((line) => `${nameWithoutDate(line.row.name)}: ${line.end ? `${line.end.total.toLocaleString()} photo opens by day ${line.end.day}` : 'no complete day yet'} (${line.look.name})`).join('. '));
</script>

{#snippet sample(look: (typeof looks)[number])}
	<svg class="sample" width="34" height="14" viewBox="0 0 34 14" aria-hidden="true" focusable="false">
		<line x1="1" x2="33" y1="7" y2="7" stroke={look.color} stroke-width="2.6" stroke-dasharray={look.dash || undefined} stroke-linecap="butt" />
		{@render marker(look, 17, 7, 4.5)}
	</svg>
{/snippet}

{#snippet marker(look: (typeof looks)[number], cx: number, cy: number, r: number)}
	{#if look.marker === 'circle'}<circle {cx} {cy} {r} fill={look.color} />
	{:else if look.marker === 'square'}<rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill={look.color} />
	{:else if look.marker === 'triangle'}<polygon points={`${cx},${cy - r - 1} ${cx + r + 1},${cy + r} ${cx - r - 1},${cy + r}`} fill={look.color} />
	{:else}<polygon points={`${cx},${cy - r - 1} ${cx + r + 1},${cy} ${cx},${cy + r + 1} ${cx - r - 1},${cy}`} fill={look.color} />{/if}
{/snippet}

{#snippet numbers()}
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -- a sideways-scrolling table must take keyboard focus so it can be scrolled without a mouse (WCAG 2.1.1) -->
	<div class="scroll" role="region" aria-label="The chosen launches, in numbers" tabindex="0">
		<table>
			<caption class="sr-only">The chosen launches: photo opens in the first 3 days and first week, rank at day 7, and the total on the last complete day shown</caption>
			<thead><tr><th scope="col">Launch</th><th scope="col" class="num">First 3 days</th><th scope="col" class="num">Week 1</th><th scope="col" class="num">Rank at day 7</th><th scope="col" class="num">Total, last day shown</th></tr></thead>
			<tbody>
				{#each lines as line}
					<tr>
						<th scope="row">{@render sample(line.look)}{line.row.name}</th>
						<td class="num">{figureText(line.row.day3)}</td>
						<td class="num">{figureText(line.row.week1)}</td>
						<td class="num">{rankText(line.row.rank)}</td>
						<td class="num">{line.end ? `${line.end.total.toLocaleString()} (day ${line.end.day})` : 'Not yet'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/snippet}

<RemProbe bind:rem />

<div class="overlay">
	<div class="chart-only" bind:clientWidth={width}>
		<svg {width} {height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Photo opens added up by day since publication, for ${lines.length} launches. ${summary}`}>
			{#each ticks as tick}
				<line class="grid" x1={x(tick)} x2={x(tick)} y1={pad.top} y2={y(0)} />
				<text class="tick" x={x(tick)} y={height - 20 * u} text-anchor={x(tick) > width - 36 * u ? 'end' : 'middle'}>day {tick}</text>
			{/each}
			<line class="axis" x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} />
			<text class="tick" x={pad.left - 6 * u} y={y(max) + 4 * u} text-anchor="end">{max.toLocaleString()}</text>
			<text class="tick" x={pad.left - 6 * u} y={y(0) + 4 * u} text-anchor="end">0</text>
			{#each lines as line}
				{#if line.row.curve.points.length}
					<polyline points={path(line.row.curve.points)} fill="none" stroke={line.look.color} stroke-width="2.6" stroke-dasharray={line.look.dash || undefined} stroke-linejoin="round" />
					{#if line.end}{@render marker(line.look, x(line.end.day), y(line.end.total), 4.5 * u)}{/if}
				{/if}
			{/each}
			<text class="tick" x={pad.left + inner / 2} y={height - 3 * u} text-anchor="middle">Days since publication</text>
		</svg>
		<ul class="legend" aria-label="Which line is which launch">
			{#each lines as line}
				<li>{@render sample(line.look)}<span><strong>{nameWithoutDate(line.row.name)}</strong>{#if line.end}: {line.end.total.toLocaleString()} by day {line.end.day}{#if line.row.curve.cutByGap}, records incomplete after that{/if}{/if}</span></li>
			{/each}
		</ul>
		<details class="numbers-wide">
			<summary>Show the numbers</summary>
			{@render numbers()}
		</details>
	</div>
	<ul class="numbers-phone" aria-label="The chosen launches, in numbers">
		{#each lines as line}
			<li>
				<strong>{line.row.name}</strong>
				<dl>
					<div><dt>First 3 days</dt><dd>{figureText(line.row.day3)}</dd></div>
					<div><dt>Week 1</dt><dd>{figureText(line.row.week1)}</dd></div>
					<div><dt>Rank at day 7</dt><dd>{rankText(line.row.rank)}</dd></div>
					<div><dt>Total, last day shown</dt><dd>{line.end ? `${line.end.total.toLocaleString()} (day ${line.end.day})` : 'Not yet'}</dd></div>
				</dl>
			</li>
		{/each}
	</ul>
</div>

<style>
	.overlay { min-width: 0; }
	.chart-only { min-width: 0; overflow: hidden; }
	svg { display: block; max-width: 100%; }
	.sample { display: inline-block; flex: none; vertical-align: middle; margin-right: .45rem; }
	.axis { stroke: #6f7f95; }
	.grid { stroke: #e1e8f0; stroke-dasharray: 3 3; }
	.tick { fill: #526176; font-size: .75rem; font-variant-numeric: tabular-nums; }
	.legend { display: grid; gap: .3rem .9rem; grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr)); list-style: none; margin: .5rem 0 .2rem; padding: 0; color: #172033; font-size: .85rem; line-height: 1.4; }
	.legend li { align-items: center; display: flex; min-width: 0; }
	.legend span { min-width: 0; overflow-wrap: break-word; }
	.numbers-wide { border-top: 1px solid #e1e8f0; margin-top: .5rem; padding-top: .3rem; }
	summary { align-items: center; color: #174ea6; cursor: pointer; display: flex; font-size: .85rem; font-weight: 650; min-height: 2.75rem; }
	summary:focus-visible, .scroll:focus-visible { outline: 3px solid #174ea6; outline-offset: 2px; }
	.scroll { overflow-x: auto; }
	table { border-collapse: collapse; font-size: .85rem; width: 100%; }
	th, td { border-bottom: 1px solid #e1e8f0; color: #172033; padding: .45rem .4rem; text-align: left; vertical-align: middle; }
	thead th { color: #526176; font-size: .76rem; font-weight: 650; }
	tbody th { font-size: .82rem; font-weight: 600; overflow-wrap: break-word; }
	.num { font-variant-numeric: tabular-nums; text-align: right; }
	.sr-only { clip: rect(0 0 0 0); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
	.numbers-phone { display: none; list-style: none; margin: 0; padding: 0; }
	.numbers-phone li { border: 1px solid #d8e0ea; border-radius: .7rem; color: #172033; padding: .6rem .75rem; }
	.numbers-phone li + li { margin-top: .6rem; }
	.numbers-phone strong { font-size: .95rem; overflow-wrap: break-word; }
	.numbers-phone dl { display: grid; gap: .25rem .75rem; grid-template-columns: repeat(auto-fit, minmax(min(7.5rem, 100%), 1fr)); margin: .4rem 0 0; }
	.numbers-phone dt { color: #526176; font-size: .74rem; }
	.numbers-phone dd { font-size: .92rem; font-variant-numeric: tabular-nums; margin: 0; overflow-wrap: break-word; }
	@media (max-width: 639px) {
		.chart-only { display: none; }
		.numbers-phone { display: block; }
	}
	@media (forced-colors: active) { .sample line, .sample circle, .sample rect, .sample polygon { forced-color-adjust: none; } }
	@media (prefers-contrast: more) { .tick, .numbers-phone dt { color: #2b3748; fill: #2b3748; } .numbers-phone li { border-color: #5c6b80; } .grid { stroke: #6f7f95; } }
</style>
