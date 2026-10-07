<script lang="ts">
	import type { RecapRow } from '$lib/analytics/launch-recap-list';

	/**
	 * The album's recaps: day 3 and day 7, each with the date it was due, whether it was late or built on incomplete
	 * records, and a plain link that opens the recap on its own page. Only the owner sees why a recap is missing. Nothing
	 * here is a control that writes or sends.
	 */
	let { rows }: { rows: RecapRow[] } = $props();
</script>

<section class="recaps panel" id="recaps" aria-labelledby="recaps-title">
	<h2 id="recaps-title">Recaps</h2>
	{#if rows.length}<ul class="rows">
		{#each rows as row (row.checkpoint)}
			<li>
				<div class="head">
					<strong>{row.title}</strong>
					<span class="when">{row.when}</span>
					{#each row.flags as flag (flag)}<span class="flag">{flag}</span>{/each}
				</div>
				{#if row.covers}<p class="note">{row.covers}</p>{/if}
				{#if row.note}<p class="note">{row.note}</p>{/if}
				{#if row.query}<a class="read" href={row.query}>Read the {row.title.toLowerCase()}</a>{/if}
			</li>
		{/each}
	</ul>{/if}
</section>

<style>
	.recaps { background: #fff; border: 1px solid var(--line, #d8e0ea); border-radius: .9rem; min-width: 0; padding: 1rem; }
	h2 { font-size: 1.05rem; font-weight: 700; margin: 0; }
	.note { color: var(--muted, #526176); font-size: .85rem; line-height: 1.5; margin: .35rem 0 .2rem; max-width: 46rem; }
	.rows { display: grid; gap: .7rem; list-style: none; margin: .6rem 0 0; padding: 0; }
	.rows li { border-top: 1px solid #e6ecf3; padding-top: .6rem; }
	.rows li:first-child { border-top: 0; padding-top: 0; }
	.head { align-items: baseline; display: flex; flex-wrap: wrap; gap: .15rem .7rem; }
	.when { color: var(--muted, #526176); font-size: .88rem; }
	.flag { background: #fdf3e3; border: 1px solid #c98a1f; border-radius: .3rem; color: #6b4300; font-size: .76rem; font-weight: 700; padding: .05rem .4rem; }
	.read { align-items: center; color: var(--blue-ink, #174ea6); display: inline-flex; font-weight: 700; min-height: 2.75rem; text-underline-offset: 3px; }
	a:focus-visible { outline: 3px solid var(--blue-ink, #174ea6); outline-offset: 2px; }
	@media (forced-colors: active) { .recaps, .flag { border: 1px solid CanvasText; } }
	@media (prefers-contrast: more) { .note, .when { color: #2b3748; } }
</style>
