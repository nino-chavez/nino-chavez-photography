<script lang="ts">
	interface Point {
		date: string;
		count: number | null;
		observed: number | null;
		coverage: 'complete' | 'partial' | 'unavailable';
	}

	interface Props {
		points: Point[];
		measureLabel: string;
	}

	let { points, measureLabel }: Props = $props();
	const usablePoints = $derived(points.filter((point) => point.count !== null));
	const maximum = $derived(Math.max(1, ...usablePoints.map((point) => point.count ?? 0)));
	const line = $derived(usablePoints.map((point, index) => {
		const originalIndex = points.indexOf(point);
		const x = points.length === 1 ? 50 : (originalIndex / (points.length - 1)) * 100;
		const y = 88 - ((point.count ?? 0) / maximum) * 76;
		return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
	}).join(' '));
	const startLabel = $derived(points[0]?.date ?? '');
	const endLabel = $derived(points.at(-1)?.date ?? '');
</script>

<figure class="trend" aria-labelledby="trend-title">
	<div class="trend-heading">
		<div>
			<h2 id="trend-title">Recorded {measureLabel.toLowerCase()}</h2>
			<p>{startLabel} to {endLabel} · America/Chicago</p>
		</div>
		<span>{maximum.toLocaleString()} peak</span>
	</div>
	{#if usablePoints.length}
		<svg viewBox="0 0 100 100" role="img" aria-label={`Daily recorded ${measureLabel.toLowerCase()} from ${startLabel} to ${endLabel}`} preserveAspectRatio="none">
			<line x1="0" x2="100" y1="88" y2="88" class="axis" />
			<path d={line} class="line" vector-effect="non-scaling-stroke" />
		</svg>
	{:else}
		<p class="empty">No complete daily evidence is available for this interval.</p>
	{/if}
	<details>
		<summary>Read the daily values</summary>
		<table>
			<thead><tr><th scope="col">Date</th><th scope="col">Recorded</th><th scope="col">Coverage</th></tr></thead>
			<tbody>{#each points as point}<tr><td>{point.date}</td><td>{point.count === null ? 'Unavailable' : point.count.toLocaleString()}</td><td>{point.coverage}</td></tr>{/each}</tbody>
		</table>
	</details>
</figure>

<style>
	.trend { margin: 0; border: 1px solid #d8e0ea; border-radius: 14px; background: #fff; padding: 1rem; }
	.trend-heading { display: flex; justify-content: space-between; gap: 1rem; align-items: start; }
	h2 { margin: 0; color: #172033; font-size: .95rem; }
	p, summary { margin: .25rem 0 0; color: #526176; font-size: .78rem; }
	span { color: #174ea6; font-variant-numeric: tabular-nums; font-size: .78rem; font-weight: 700; white-space: nowrap; }
	svg { display: block; height: 9rem; margin: .75rem 0; overflow: visible; width: 100%; }
	.axis { stroke: #d8e0ea; stroke-width: 1; }
	.line { fill: none; stroke: #1769e0; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2.5; }
	details { border-top: 1px solid #e8edf3; padding-top: .65rem; }
	table { border-collapse: collapse; margin-top: .65rem; width: 100%; font-size: .75rem; }
	th, td { border-bottom: 1px solid #e8edf3; padding: .35rem; text-align: left; }
	.empty { padding: 2rem 0; }
</style>
