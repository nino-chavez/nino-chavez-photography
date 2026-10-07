<script lang="ts">
	import type { CumulativeCurve, LaunchTableRow } from '$lib/analytics/launch-report-view';
	import { ordinal, recoveredTag } from '$lib/analytics/launch-recap';
	import { nameWithoutDate } from '$lib/analytics/launch-report-view';
	import { COMPARISON_DAYS } from '$lib/analytics/launch-report-view';
	import RemProbe from '$lib/components/analytics/RemProbe.svelte';
	import ResponsiveTable from '$lib/components/analytics/ResponsiveTable.svelte';

	/** `uid` keeps the ids apart when the report draws this twice (once under the chart on a phone, once beside the photos on a desktop). */
	interface Props { curves: CumulativeCurve[]; rows: LaunchTableRow[]; hasLaunch: boolean; uid?: string; /** Mark a recovered publication date with `*`; the page says what it means once. False when the page says every date was recovered instead. */ markRecovered?: boolean }
	let { curves, rows, hasLaunch, uid = 'compare', markRecovered = true }: Props = $props();

	// The chart is drawn in pixels, so its size and its text follow the page's text size (`rem`, one rem in pixels).
	let rem = $state(16);
	const u = $derived(rem / 16);
	const height = $derived(250 * u);
	const pad = $derived({ top: 22 * u, right: 14 * u, bottom: 36 * u, left: 46 * u });
	let width = $state(520);
	// The first week, days 0 to 6: the same window as the table, the rank and the headline.
	const days = COMPARISON_DAYS;
	const max = $derived(Math.max(1, ...curves.flatMap((curve) => curve.points.map((point) => point.total))));
	const inner = $derived(Math.max(120, width - pad.left - pad.right));
	const plotHeight = $derived(height - pad.top - pad.bottom);
	const x = (day: number) => pad.left + (day / (days - 1)) * inner;
	const y = (total: number) => pad.top + plotHeight - (total / max) * plotHeight;
	const path = (curve: CumulativeCurve) => curve.points.map((point) => `${x(point.day).toFixed(1)},${y(point.total).toFixed(1)}`).join(' ');
	const current = $derived(curves.find((curve) => curve.current) ?? null);
	const others = $derived(curves.filter((curve) => !curve.current));
	const leader = $derived(others.reduce<CumulativeCurve | null>((best, curve) => ((curve.points.at(-1)?.total ?? -1) > (best?.points.at(-1)?.total ?? -1) ? curve : best), null));
	const ticks = [0, 3, 6];
	// Lines are named where they end, not only in the legend. If the two ends sit close, the album's label moves below its point.
	const mineEnd = $derived(current?.points.at(-1) ?? null);
	const leaderEnd = $derived(leader?.points.at(-1) ?? null);
	const crowded = $derived(mineEnd !== null && leaderEnd !== null && Math.abs(y(mineEnd.total) - y(leaderEnd.total)) < 16 * u && Math.abs(x(mineEnd.day) - x(leaderEnd.day)) < 120 * u);
	/** A line that reaches day 6 is the week-1 total, said as that. One that stops sooner says where, because its week is not over. */
	const upTo = (curve: CumulativeCurve | null) => {
		const end = curve?.points.at(-1);
		return end ? `${end.total.toLocaleString()} ${end.day === COMPARISON_DAYS - 1 ? 'in week 1' : `by day ${end.day}`}` : '';
	};
	const stateWords = (state: LaunchTableRow['day3State'], value: number | null) => (state === 'ok' ? (value ?? 0).toLocaleString() : state === 'incomplete' ? 'Incomplete' : 'Not yet');
	const summary = $derived(
		current && current.points.length
			? `This album has ${upTo(current)} photo opens. ${others.length} other launches are in grey.`
			: 'Every launch with a first publication, added up over its first week.'
	);
</script>

<RemProbe bind:rem />

{#snippet launchTable()}
	<ResponsiveTable compact label="Launches ranked by photo opens in the first week" caption="Launches ranked by photo opens in the first week, with the first three days beside it" headerLabel="Album"
		columns={[{ label: 'First 3 days', numeric: true }, { label: 'Week 1', numeric: true }, { label: 'Rank', numeric: true }]}
		rows={rows.map((row) => ({
			key: row.albumKey, title: row.name, sub: `Published ${row.published}${markRecovered ? recoveredTag(row.inferred) : ''}`, current: row.current,
			values: [stateWords(row.day3State, row.day3), stateWords(row.day7State, row.day7), row.rank7 === null ? null : `${row.tied7 ? 'tied ' : ''}${ordinal(row.rank7)}`]
		}))} />
{/snippet}

<section class="compare" aria-labelledby={`${uid}-title`}>
	<h2 id={`${uid}-title`}>Against other launches, first week</h2>
	{#if !hasLaunch}
		<p class="lead">This album has no launch date, so it has no place in this comparison. The ranking below shows the launches it would be compared with.</p>
	{:else}
		<p class="lead lead-chart">Each line adds up one launch's photo opens over its first week, day by day. This album is the thick line. The table has the same numbers.</p>
		<p class="lead lead-table">Each launch's photo opens in its first three days and first week, best week first.</p>
	{/if}
	<div class="chart-only" bind:clientWidth={width}>
		{#if hasLaunch && current}
			<svg {width} {height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Cumulative photo opens by day since publication. ${summary}`}>
				{#each ticks as tick}
					<line class="grid" x1={x(tick)} x2={x(tick)} y1={pad.top} y2={y(0)} />
					<text class="tick" x={x(tick)} y={height - 18 * u} text-anchor={x(tick) > width - 36 * u ? 'end' : 'middle'}>day {tick}</text>
				{/each}
				<line class="axis" x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} />
				<text class="tick" x={pad.left - 6 * u} y={y(max) + 4 * u} text-anchor="end">{max.toLocaleString()}</text>
				<text class="tick" x={pad.left - 6 * u} y={y(0) + 4 * u} text-anchor="end">0</text>
				{#each others as curve}
					{#if curve.points.length}
						<polyline class="other" points={path(curve)} fill="none"><title>{curve.name}: {upTo(curve)} photo opens</title></polyline>
					{/if}
				{/each}
				{#if current.points.length}
					<polyline class="mine" points={path(current)} fill="none" />
					{@const end = current.points.at(-1)!}
					<circle class="mine-dot" cx={x(end.day)} cy={y(end.total)} r={4 * u} />
					<text class="label mine-label" x={x(end.day) - 8 * u} y={y(end.total) + (crowded ? 18 * u : -8 * u)} text-anchor="end">This album: {upTo(current)}</text>
					{#if current.cutByGap}<text class="tick" x={pad.left + 4 * u} y={pad.top + 10 * u}>Records incomplete after day {end.day}</text>{/if}
				{/if}
				{#if leader && leaderEnd}<text class="label other-label" x={x(leaderEnd.day) - 6 * u} y={y(leaderEnd.total) - 7 * u} text-anchor="end">{nameWithoutDate(leader.name)}: {upTo(leader)}</text>{/if}
				<text class="tick" x={pad.left + inner / 2} y={height - 2 * u} text-anchor="middle">Days since publication</text>
			</svg>
			<p class="legend">
				<span><span class="swatch mine-swatch" aria-hidden="true"></span> This album{#if current.points.length}: {upTo(current)}{/if}</span>
				<span><span class="swatch other-swatch" aria-hidden="true"></span> Other launches{#if leader && leader.points.length}{' '}(highest: {nameWithoutDate(leader.name)}, {upTo(leader)}){/if}</span>
			</p>
		{/if}
	</div>
	{#if hasLaunch}
		<details class="table-wide">
			<summary>Show the ranked launch table</summary>
			{@render launchTable()}
		</details>
		<div class="table-phone">
			{@render launchTable()}
		</div>
	{:else}
		{@render launchTable()}
	{/if}
</section>

<style>
	.compare { min-width: 0; }
	h2 { color: #172033; font-size: 1.05rem; margin: 0; }
	.lead, .legend { color: #526176; font-size: .85rem; line-height: 1.5; margin: .3rem 0 .6rem; }
	.chart-only { min-width: 0; overflow: hidden; }
	svg { display: block; max-width: 100%; }
	.axis { stroke: #6f7f95; }
	.grid { stroke: #e1e8f0; stroke-dasharray: 3 3; }
	.tick { fill: #526176; font-size: .75rem; font-variant-numeric: tabular-nums; }
	/* A name on the chart sits on a white halo so it stays readable over the lines it crosses. */
	.label { fill: #172033; font-size: .75rem; font-variant-numeric: tabular-nums; font-weight: 700; paint-order: stroke; stroke: #fff; stroke-linejoin: round; stroke-width: .25rem; }
	.mine-label { fill: #174ea6; }
	.other-label { fill: #3d4c63; }
	.other { stroke: #7b8ca3; stroke-width: 1.6; stroke-linejoin: round; }
	.mine { stroke: #1458c4; stroke-width: 3.2; stroke-linejoin: round; stroke-linecap: round; }
	.mine-dot { fill: #1458c4; }
	.legend { display: flex; flex-wrap: wrap; align-items: center; gap: .2rem .8rem; }
	.swatch { display: inline-block; width: 1.2rem; height: 0; margin-right: .3rem; vertical-align: middle; }
	.mine-swatch { border-top: 3px solid #1458c4; }
	.other-swatch { border-top: 2px solid #7b8ca3; }
	.table-wide { margin-top: .5rem; border-top: 1px solid #e1e8f0; padding-top: .4rem; }
	summary { cursor: pointer; color: #174ea6; font-size: .85rem; font-weight: 650; min-height: 2.75rem; display: flex; align-items: center; }
	summary:focus-visible { outline: 3px solid #174ea6; outline-offset: 2px; }
	.table-phone, .lead-table { display: none; }
	@media (max-width: 639px) {
		.chart-only { display: none; }
		.table-wide { display: none; }
		.table-phone { display: block; }
		.lead-table { display: block; }
		.lead-chart { display: none; }
	}
	@media (forced-colors: active) { .label { fill: CanvasText; stroke: Canvas; } .mine { stroke: Highlight; } .other { stroke: GrayText; } .mine-swatch { border-top-color: Highlight; forced-color-adjust: none; } .other-swatch { border-top-color: GrayText; forced-color-adjust: none; } }
	@media (prefers-contrast: more) { .tick, .lead, .legend { color: #2b3748; fill: #2b3748; } .other-label { fill: #2b3748; } .grid { stroke: #6f7f95; } .other { stroke: #4f6078; } }
</style>
