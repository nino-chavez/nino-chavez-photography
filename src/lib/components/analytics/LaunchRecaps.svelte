<script lang="ts">
	import { page } from '$app/state';
	import type { RecapBlock } from '$lib/analytics/launch-recap-text';
	import type { RecapRow } from '$lib/analytics/launch-recap-list';

	/**
	 * The album's recaps: day 3 and day 7, each with the date it was due, whether it was late or built on incomplete
	 * records, and a plain link that opens the stored text. A recap that is not stored says why. Nothing here is a
	 * control that writes or sends: opening a recap is a link to this same page.
	 */
	let { rows, summary, explain, open, openMissing }: {
		rows: RecapRow[];
		summary: string;
		explain: string | null;
		open: { title: string; subject: string; flags: string[]; blocks: RecapBlock[] } | null;
		openMissing: number | null;
	} = $props();

	const back = $derived(page.url.pathname);
</script>

<section class="recaps panel" id="recaps" aria-labelledby="recaps-title">
	<h2 id="recaps-title">Recaps</h2>
	<p class="note">{summary}</p>
	{#if explain}<p class="note">{explain}</p>{/if}
	<ul class="rows">
		{#each rows as row (row.checkpoint)}
			<li>
				<div class="head">
					<strong>{row.title}</strong>
					<span class="when">{row.when}</span>
					{#each row.flags as flag (flag)}<span class="flag">{flag}</span>{/each}
				</div>
				{#if row.covers}<p class="note">{row.covers}</p>{/if}
				{#if row.note}<p class="note">{row.note}</p>{/if}
				{#if row.query}<a class="read" href={`${row.query}#stored-recap`}>Read the stored {row.title.toLowerCase()}</a>{/if}
			</li>
		{/each}
	</ul>

	{#if openMissing !== null}
		<p class="note" id="stored-recap" tabindex="-1">The day {openMissing} recap is not stored, so there is no text to read. <a href={back}>Back to the report</a></p>
	{/if}
	{#if open}
		<article class="stored" id="stored-recap" tabindex="-1" aria-labelledby="stored-title">
			<h3 id="stored-title">{open.subject}</h3>
			{#if open.flags.length}<p class="flags">{#each open.flags as flag (flag)}<span class="flag">{flag}</span>{/each}</p>{/if}
			{#each open.blocks as block, index (index)}
				{#if block.kind === 'heading'}<h4>{block.text}</h4>
				{:else if block.kind === 'list'}<ul>{#each block.items as item, at (at)}<li>{item}</li>{/each}</ul>
				{:else if index > 0}<p>{block.text}</p>{/if}
			{/each}
			<p><a class="read" href={back}>Back to the report</a></p>
		</article>
	{/if}
</section>

<style>
	.recaps { background: #fff; border: 1px solid var(--line, #d8e0ea); border-radius: .9rem; min-width: 0; padding: 1rem; }
	h2 { font-size: 1.05rem; font-weight: 700; margin: 0; }
	h3 { font-size: 1rem; font-weight: 700; margin: 0 0 .3rem; overflow-wrap: anywhere; }
	h4 { color: var(--muted, #526176); font-size: .85rem; font-weight: 700; margin: .8rem 0 .2rem; }
	.note { color: var(--muted, #526176); font-size: .85rem; line-height: 1.5; margin: .35rem 0 .2rem; max-width: 46rem; }
	.rows { display: grid; gap: .7rem; list-style: none; margin: .6rem 0 0; padding: 0; }
	.rows li { border-top: 1px solid #e6ecf3; padding-top: .6rem; }
	.rows li:first-child { border-top: 0; padding-top: 0; }
	.head { align-items: baseline; display: flex; flex-wrap: wrap; gap: .15rem .7rem; }
	.when { color: var(--muted, #526176); font-size: .88rem; }
	.flag { background: #fdf3e3; border: 1px solid #c98a1f; border-radius: .3rem; color: #6b4300; font-size: .76rem; font-weight: 700; padding: .05rem .4rem; }
	.read { align-items: center; color: var(--blue-ink, #174ea6); display: inline-flex; font-weight: 700; min-height: 2.75rem; text-underline-offset: 3px; }
	.stored { background: #f7f9fc; border: 1px solid #d8e0ea; border-radius: .7rem; margin-top: .8rem; padding: .8rem 1rem; }
	.stored p { font-size: .95rem; line-height: 1.55; margin: .4rem 0; max-width: 44rem; overflow-wrap: anywhere; }
	.stored ul { color: var(--ink, #172033); font-size: .92rem; line-height: 1.5; list-style: disc; margin: .2rem 0; padding-left: 1.1rem; }
	.stored li { margin: .25rem 0; overflow-wrap: anywhere; }
	.flags { display: flex; flex-wrap: wrap; gap: .3rem; }
	a:focus-visible, [tabindex]:focus-visible { outline: 3px solid var(--blue-ink, #174ea6); outline-offset: 2px; }
	@media (forced-colors: active) { .recaps, .stored, .flag { border: 1px solid CanvasText; } }
	@media (prefers-contrast: more) { .note, .when { color: #2b3748; } }
</style>
