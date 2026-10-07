<script lang="ts">
	/**
	 * A table that becomes a list of cards when its own width is too small for its columns: the same card the Albums page
	 * uses on a phone (a name, then each figure with its label). The switch is by the table's own width in rem, so a larger
	 * text size gets the cards too. The table keeps its sideways scroll region, with a name that says so, for a wide screen.
	 */
	interface Column { label: string; numeric?: boolean; help?: string }
	interface Row { key: string; title: string; href?: string; newTab?: boolean; values: string[] }
	let { label, caption = null, headerLabel, columns, rows }: { label: string; caption?: string | null; headerLabel: string; columns: Column[]; rows: Row[] } = $props();
</script>

<div class="rt">
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -- a sideways-scrolling table must take keyboard focus so it can be scrolled without a mouse (WCAG 2.1.1) -->
	<div class="table-view" role="region" aria-label={`${label}. Scroll sideways for every column.`} tabindex="0">
		<table>
			{#if caption}<caption>{caption}</caption>{/if}
			<thead><tr><th scope="col">{headerLabel}</th>{#each columns as column (column.label)}<th scope="col" class:num={column.numeric} title={column.help}>{column.label}</th>{/each}</tr></thead>
			<tbody>
				{#each rows as row (row.key)}
					<tr>
						<th scope="row">{#if row.href}<a href={row.href} target={row.newTab ? '_blank' : undefined} rel={row.newTab ? 'noopener noreferrer' : undefined}>{row.title}{#if row.newTab}<span class="sr-only"> (opens in a new tab)</span>{/if}</a>{:else}{row.title}{/if}</th>
						{#each columns as column, at (column.label)}<td class:num={column.numeric}>{row.values[at]}</td>{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<ul class="cards" aria-label={label}>
		{#each rows as row (row.key)}
			<li class="card">
				<div class="card-head">{#if row.href}<a href={row.href} target={row.newTab ? '_blank' : undefined} rel={row.newTab ? 'noopener noreferrer' : undefined}>{row.title}{#if row.newTab}<span class="sr-only"> (opens in a new tab)</span>{/if}</a>{:else}<span class="name">{row.title}</span>{/if}</div>
				<dl>
					{#each columns as column, at (column.label)}<div><dt>{column.label}</dt><dd>{row.values[at]}</dd></div>{/each}
				</dl>
			</li>
		{/each}
	</ul>
</div>

<style>
	.rt { container-type: inline-size; margin-top: .5rem; min-width: 0; }
	.table-view { display: none; max-width: 100%; overflow-x: auto; }
	.table-view:focus-visible { outline: 3px solid var(--blue-ink, #174ea6); outline-offset: 2px; }
	table { border-collapse: collapse; font-size: .85rem; width: 100%; }
	caption { color: var(--muted, #526176); font-size: .8rem; padding-bottom: .35rem; text-align: left; }
	th, td { border-bottom: 1px solid #e6ecf3; padding: .45rem .6rem; text-align: left; vertical-align: top; }
	thead th { font-weight: 650; vertical-align: bottom; }
	tbody th { font-weight: 500; overflow-wrap: anywhere; }
	tbody th a { color: var(--blue-ink, #174ea6); display: inline-flex; min-height: 2.75rem; align-items: center; text-underline-offset: 3px; }
	td { white-space: nowrap; }
	.num { font-variant-numeric: tabular-nums; text-align: right; }

	.cards { display: grid; gap: .6rem; list-style: none; margin: 0; padding: 0; }
	.card { border: 1px solid var(--line, #d8e0ea); border-radius: .7rem; padding: .6rem .75rem; }
	.card-head { align-items: center; display: flex; min-height: 2.75rem; }
	.card-head a, .name { color: var(--ink, #172033); flex: 1 1 9rem; font-size: .98rem; font-weight: 650; min-width: 0; overflow-wrap: anywhere; text-decoration-color: #8fa1b8; text-underline-offset: 3px; }
	.card-head a { align-items: center; display: inline-flex; min-height: 2.75rem; }
	.card dl { display: grid; gap: .25rem .75rem; grid-template-columns: repeat(auto-fit, minmax(min(7.5rem, 100%), 1fr)); margin: .1rem 0 0; }
	.card dl div { min-width: 0; }
	.card dt { color: var(--muted, #526176); font-size: .74rem; }
	.card dd { font-size: .92rem; font-variant-numeric: tabular-nums; margin: 0; overflow-wrap: anywhere; }
	.sr-only { clip: rect(0 0 0 0); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }

	@container (min-width: 40rem) {
		.table-view { display: block; }
		.cards { display: none; }
	}
	a:focus-visible { outline: 3px solid var(--blue-ink, #174ea6); outline-offset: 2px; }
	@media (forced-colors: active) { .card { border: 1px solid CanvasText; } }
	@media (prefers-contrast: more) { .card dt, caption { color: #2b3748; } }
</style>
