<script lang="ts">
	import { page } from '$app/state';
	import { albumReportPath } from '$lib/analytics/report-paths';
	import type { RecapView } from '$lib/analytics/launch-recap-view';
	import ReportHeader from '$lib/components/analytics/ReportHeader.svelte';

	/**
	 * One recap on its own page, under the shared header: its title, when it is as of and the days it covers, the stored
	 * text, then a link to the full live report. Nothing else of the album report is on this page.
	 */
	let { view, albumKey }: { view: RecapView; albumKey: string } = $props();

	const hostname = $derived(page.url.hostname);
	const reportHref = $derived(albumReportPath(hostname, albumKey));
</script>

<svelte:head>
	<title>{view.title} · Recap</title>
	<meta name="robots" content="noindex, nofollow, noarchive" />
</svelte:head>

<div class="recap-page">
	<ReportHeader current="album" />

	<article class="recap-view" aria-labelledby="recap-title">
		<p class="eyebrow">{view.eyebrow}</p>
		<h1 id="recap-title">{view.title}</h1>
		{#if view.asOf}
			<p class="when"><strong>{view.asOf}</strong> {view.covers}</p>
			{#if view.flags.length}<p class="flags">{#each view.flags as flag (flag)}<span class="flag">{flag}</span>{/each}</p>{/if}
		{/if}
		{#if view.message}<p class="message">{view.message}</p>{/if}

		{#if view.blocks.length}
			<div class="text">
				{#each view.blocks as block, index (index)}
					{#if block.kind === 'heading'}<h2>{block.text}</h2>
					{:else if block.kind === 'list'}<ul>{#each block.items as item, at (at)}<li>{item}</li>{/each}</ul>
					{:else}<p>{block.text}</p>{/if}
				{/each}
			</div>
		{/if}
		{#if view.snapshotNote}<p class="note">{view.snapshotNote}</p>{/if}

		<p class="actions">
			<a class="primary" href={reportHref}>See the full live report</a>
			{#each view.others as other (other.checkpoint)}<a class="secondary" href={other.query}>Read the {other.title.toLowerCase()}</a>{/each}
		</p>
	</article>
</div>

<style>
	.recap-page { min-height: 100dvh; --ink: #172033; --muted: #526176; --line: #d8e0ea; --blue: #1458c4; --blue-ink: #174ea6; background: #edf2f7; color: var(--ink); margin-inline: auto; max-width: 96rem; min-width: 0; overflow-x: clip; padding: .5rem 1rem 3rem; }
	@media (min-width: 640px) { .recap-page { padding: 1.25rem 1.5rem 3.5rem; } }
	@media (min-width: 1024px) { .recap-page { padding-inline: 2rem; } }
	a:focus-visible { outline: 3px solid var(--blue-ink); outline-offset: 2px; }

	.recap-view { background: #fff; border: 1px solid var(--line); border-radius: .9rem; margin-top: .5rem; max-width: 48rem; min-width: 0; padding: 1rem 1.1rem 1.2rem; }
	@media (min-width: 640px) { .recap-view { padding: 1.3rem 1.6rem 1.5rem; } }
	.eyebrow { color: var(--blue-ink); font-size: .75rem; font-weight: 800; letter-spacing: .09em; margin: 0; text-transform: uppercase; }
	h1 { font-size: 1.4rem; font-weight: 750; letter-spacing: -.01em; line-height: 1.25; margin: .35rem 0 .5rem; overflow-wrap: break-word; }
	@media (min-width: 640px) { h1 { font-size: 1.65rem; } }
	.when { font-size: 1rem; line-height: 1.5; margin: 0 0 .4rem; }
	.flags { display: flex; flex-wrap: wrap; gap: .3rem; margin: 0 0 .4rem; }
	.flag { background: #fdf3e3; border: 1px solid #c98a1f; border-radius: .3rem; color: #6b4300; font-size: .8rem; font-weight: 700; padding: .05rem .4rem; }
	.message { font-size: 1.02rem; line-height: 1.55; margin: .6rem 0; }
	.text { border-top: 1px solid #e6ecf3; margin-top: .8rem; padding-top: .3rem; }
	.text p { font-size: 1rem; line-height: 1.55; margin: .6rem 0; overflow-wrap: break-word; }
	h2 { color: var(--muted); font-size: .88rem; font-weight: 700; margin: 1rem 0 .2rem; }
	.text ul { font-size: .98rem; line-height: 1.5; list-style: disc; margin: .2rem 0; padding-left: 1.2rem; }
	.text li { margin: .3rem 0; overflow-wrap: break-word; }
	.note { border-top: 1px solid #e6ecf3; color: var(--muted); font-size: .85rem; line-height: 1.5; margin: 1rem 0 0; padding-top: .7rem; }
	.actions { align-items: center; display: flex; flex-wrap: wrap; gap: .5rem; margin: 1rem 0 0; }
	.primary, .secondary { align-items: center; border-radius: .55rem; display: inline-flex; font-size: .92rem; font-weight: 700; justify-content: center; min-height: 2.75rem; padding: .5rem .95rem; text-align: center; text-decoration: none; }
	.primary { background: var(--blue); border: 1px solid var(--blue); color: #fff; }
	.secondary { background: #fff; border: 1px solid #8fa1b8; color: var(--blue-ink); }
	.primary:hover { background: #0f47a3; }
	.secondary:hover { background: #eef4fc; }
	@media (forced-colors: active) { .recap-view, .flag { border: 1px solid CanvasText; } .primary { border: 1px solid ButtonText; } }
	@media (prefers-contrast: more) { .recap-page { --muted: #36445a; --line: #5c6b80; } .note, h2 { color: #2b3748; } .secondary { border-color: #36445a; } }
</style>
