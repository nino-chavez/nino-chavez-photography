<script lang="ts">
	import { page } from '$app/state';
	import { albumIndexPath, albumReportPath, reportPath } from '$lib/analytics/report-paths';
	import { cfImageUrl } from '$lib/utils/cloudflare-images';
	import { plural } from '$lib/analytics/launch-recap';
	import type { HomeProblem } from '$lib/analytics/home';
	import ReportHeader from '$lib/components/analytics/ReportHeader.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const view = $derived(data.view);
	const hostname = $derived(page.url.hostname);
	const trouble = $derived(view.state === 'stale' || view.state === 'unavailable');
	const dateLine = $derived(new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${view.today}T12:00:00Z`)));
	const through = $derived(new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${view.lastCompleteDay}T12:00:00Z`)));
	const problemHref = (problem: HomeProblem) => (problem.href === 'measurement' ? reportPath(hostname, 'gallery', '?section=measurement') : reportPath(hostname, 'sites', '?view=actions'));

	// A bar chart this small has fixed geometry: 7 bars, each 8 wide with 3 between, 30 tall.
	const BAR = 8;
	const STEP = 11;
	const TALL = 30;
</script>

<svelte:head>
	<title>Home · Photography reports</title>
	<meta name="robots" content="noindex, nofollow, noarchive" />
</svelte:head>

<div class="home">
	<ReportHeader current="home" />

	<div class="body">
		<section class="intro" class:trouble aria-labelledby="home-title">
			<p class="eyebrow">{trouble ? 'Data problem' : 'Home'} · {dateLine}</p>
			<h1 id="home-title">{#each view.opening as part, i (i)}{#if part.strong}<strong>{part.text}</strong>{:else}{part.text}{/if}{/each}</h1>
			<p class="week">{#each view.week as part, i (i)}{#if part.strong}<strong>{part.text}</strong>{:else}{part.text}{/if}{/each}</p>
		</section>

		{#if view.problems.length}
			<section class="problems" aria-labelledby="problems-title">
				<h2 id="problems-title">Needs attention</h2>
				<ul>
					{#each view.problems as problem (problem.id)}
						<li><span>{problem.text}</span><a href={problemHref(problem)}>{problem.linkText}<span class="sr-only"> for: {problem.text}</span></a></li>
					{/each}
				</ul>
			</section>
		{/if}

		<div class="grid">
			<section class="launches" aria-labelledby="launches-title">
				<div class="section-head">
					<h2 id="launches-title">Launches, newest first</h2>
					{#if view.moreLaunches > 0}<a class="more" href={albumIndexPath(hostname)}>The other {plural(view.moreLaunches, 'launch', 'launches')}</a>{/if}
				</div>
				{#if view.state === 'unavailable'}
					<p class="empty">No launch can be listed until the numbers can be read.</p>
				{:else if view.cards.length === 0}
					<p class="empty">No album has a launch date yet.</p>
				{:else}
					<ul class="cards">
						{#each view.cards as card (card.albumKey)}
							<li class="card">
								<div class="cover">{#if card.cover}<img src={cfImageUrl(card.cover, 'thumbnail')} alt="" width="150" height="150" loading="lazy" decoding="async" />{:else}<span class="no-image" aria-hidden="true">No cover</span>{/if}</div>
								<div class="text">
									<h3><a href={albumReportPath(hostname, card.albumKey)}>{card.name}</a></h3>
									<p class="meta"><span class="status" data-phase={card.phase}>{card.status}</span> <span>{card.published}</span></p>
									<p class="figure"><strong>{card.opens}</strong></p>
									<p class="compare">{card.comparison}</p>
								</div>
								<figure class="spark">
									<svg viewBox="0 0 {STEP * 7 - 3} {TALL + 2}" width="{STEP * 7 - 3}" height={TALL + 2} role="img" aria-label={card.sparkLabel}>
										<line x1="0" y1={TALL + 1} x2={STEP * 7 - 3} y2={TALL + 1} stroke="currentColor" stroke-width="1" opacity=".35" />
										{#each card.bars as bar, i (bar.day)}
											{#if bar.state === 'value'}
												<rect class="bar" x={i * STEP} y={TALL - Math.max(1.5, bar.height * TALL)} width={BAR} height={Math.max(1.5, bar.height * TALL)} />
											{:else if bar.state === 'gap'}
												<line class="gap" x1={i * STEP + BAR / 2} y1="2" x2={i * STEP + BAR / 2} y2={TALL} />
											{:else}
												<circle cx={i * STEP + BAR / 2} cy={TALL} r="1.2" fill="currentColor" opacity=".45" />
											{/if}
										{/each}
									</svg>
									<figcaption>Daily opens, week 1</figcaption>
								</figure>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<div class="side">
				<section class="panel" aria-labelledby="next-title">
					<h2 id="next-title">Next</h2>
					{#if view.next.items.length}
						<p class="label">{view.next.text}</p>
						<ul class="due">{#each view.next.items as item (item)}<li>{item}</li>{/each}</ul>
					{:else}
						<p>{view.next.text}</p>
					{/if}
				</section>

				<section class="panel" aria-labelledby="site-title">
					<h2 id="site-title">Site, ninochavez.co</h2>
					{#each [view.site.reach, view.site.contacts] as figure (figure.label)}
						<div class="metric">
							<p class="label">{figure.label}</p>
							{#if figure.value !== null}<p class="value">{figure.value}</p>{/if}
							<p class="detail">{figure.detail}</p>
						</div>
					{/each}
					<a class="more" href={reportPath(hostname, 'sites')}>Open the site report</a>
				</section>
			</div>
		</div>

		<p class="note">Counts are browser actions, not people. Gallery numbers cover complete days in Chicago time through {through}. Page loads are Cloudflare's count of UTC days, a different measure from photo opens. "(inferred)" marks a first-publication date worked out from the records.</p>
	</div>
</div>

<style>
	.home { --ink: #172033; --muted: #526176; --line: #d8e0ea; --blue: #1458c4; --blue-ink: #174ea6; --warn: #9a4a00; background: #edf2f7; color: var(--ink); margin-inline: auto; max-width: 96rem; min-width: 0; overflow-x: clip; padding: .5rem 1rem 3rem; }
	@media (min-width: 640px) { .home { padding: 1rem 1.5rem 2.5rem; } }
	@media (min-width: 1024px) { .home { padding-inline: 2rem; } }

	a:focus-visible { outline: 3px solid var(--blue-ink); outline-offset: 2px; }

	.body { display: grid; gap: .9rem; min-width: 0; }
	.intro { min-width: 0; padding-block: .1rem; }
	.eyebrow { color: var(--blue-ink); font-size: .75rem; font-weight: 800; letter-spacing: .09em; margin: 0; text-transform: uppercase; }
	h1 { font-size: 1.2rem; font-weight: 700; letter-spacing: -.01em; line-height: 1.28; margin: .3rem 0 .4rem; max-width: 52rem; overflow-wrap: anywhere; }
	h1 :global(strong) { font-weight: 800; }
	@media (min-width: 640px) { h1 { font-size: 1.4rem; } }
	@media (min-width: 1024px) { h1 { font-size: 1.6rem; max-width: 70rem; } }
	h2 { font-size: 1.02rem; font-weight: 700; margin: 0; }
	h3 { font-size: 1rem; font-weight: 700; line-height: 1.3; margin: 0; }
	.week { color: var(--muted); font-size: .95rem; line-height: 1.45; margin: 0; max-width: 52rem; }
	@media (min-width: 1024px) { .week { max-width: 70rem; } }
	.week :global(strong) { color: var(--ink); }
	.intro.trouble { border-left: 4px solid var(--warn); padding-left: .8rem; }
	.intro.trouble .eyebrow { color: var(--warn); }

	.problems { background: #fff7ec; border: 1px solid #e3b88a; border-radius: .8rem; padding: .7rem .9rem; }
	.problems h2 { color: #6e3500; font-size: .92rem; }
	.problems ul { display: grid; list-style: none; margin: 0; padding: 0; }
	.problems li { align-items: center; display: flex; flex-wrap: wrap; font-size: .9rem; gap: 0 .7rem; line-height: 1.4; padding-block: .2rem; }
	.problems a { color: var(--blue-ink); display: inline-flex; font-weight: 650; min-height: 2.75rem; align-items: center; text-underline-offset: 3px; }

	.grid { display: grid; gap: .9rem; min-width: 0; }
	@media (min-width: 960px) { .grid { align-items: start; grid-template-columns: minmax(0, 1fr) 21rem; } }
	@media (min-width: 1280px) { .grid { grid-template-columns: minmax(0, 1fr) 24rem; } }

	.section-head { align-items: center; display: flex; flex-wrap: wrap; gap: 0 1rem; justify-content: space-between; margin-bottom: .35rem; }
	.more { align-items: center; color: var(--blue-ink); display: inline-flex; font-size: .88rem; font-weight: 650; min-height: 2.75rem; text-underline-offset: 3px; }
	.empty { background: #fff; border: 1px solid var(--line); border-radius: .8rem; color: var(--muted); margin: 0; padding: .9rem; }

	.cards { display: grid; gap: .6rem; list-style: none; margin: 0; padding: 0; }
	.card { background: #fff; border: 1px solid var(--line); border-radius: .8rem; display: grid; gap: .4rem .8rem; grid-template-columns: 4.75rem minmax(0, 1fr); padding: .65rem; position: relative; }
	.card:hover { border-color: #9db8e6; }
	.card:focus-within { border-color: var(--blue-ink); }
	.cover { align-self: start; aspect-ratio: 1; background: #dfe6ef; border-radius: .5rem; overflow: hidden; }
	.cover img { display: block; height: 100%; object-fit: cover; width: 100%; }
	.no-image { align-items: center; color: var(--muted); display: flex; font-size: .7rem; height: 100%; justify-content: center; }
	.text { min-width: 0; }
	.text a { color: var(--ink); text-decoration-color: #8fa1b8; text-underline-offset: 3px; }
	/* One target per card: the name is the link, stretched over the whole card. */
	.text a::after { content: ''; inset: 0; position: absolute; border-radius: .8rem; }
	.text a:focus-visible { outline: none; }
	.card:has(a:focus-visible) { outline: 3px solid var(--blue-ink); outline-offset: 2px; }
	.meta { color: var(--muted); display: flex; flex-wrap: wrap; font-size: .8rem; gap: .1rem .6rem; margin: .15rem 0 0; }
	.status { color: var(--ink); font-weight: 700; }
	.status[data-phase='running'], .status[data-phase='published_today'] { color: var(--blue-ink); }
	.figure { font-size: .95rem; margin: .3rem 0 0; font-variant-numeric: tabular-nums; }
	.compare { color: var(--muted); font-size: .85rem; margin: .1rem 0 0; }
	.spark { align-items: flex-end; color: var(--muted); display: flex; gap: .6rem; grid-column: 2; margin: 0; }
	.spark svg { display: block; }
	.spark .bar { fill: var(--blue); }
	.spark .gap { stroke: var(--warn); stroke-dasharray: 3 3; stroke-width: 2; }
	@media (forced-colors: active) { .spark .bar { fill: CanvasText; } .spark .gap { stroke: CanvasText; } }
	.spark figcaption { font-size: .72rem; }
	@media (min-width: 640px) {
		.card { grid-template-columns: 5.25rem minmax(0, 1fr) auto; }
		.spark { align-self: center; display: block; grid-column: auto; }
		.spark figcaption { margin-top: .2rem; }
	}

	.side { display: grid; gap: .9rem; min-width: 0; }
	.panel { background: #fff; border: 1px solid var(--line); border-radius: .8rem; min-width: 0; padding: .8rem .9rem; }
	.panel p { margin: .3rem 0 0; }
	.panel > p:not(.label) { font-size: .92rem; }
	.label { color: var(--muted); font-size: .8rem; font-weight: 650; }
	.due { font-size: .92rem; list-style: none; margin: .2rem 0 0; padding: 0; }
	.due li { margin-top: .2rem; }
	.metric { border-top: 1px solid #e6ecf3; margin-top: .55rem; padding-top: .45rem; }
	.metric:first-of-type { border-top: 0; margin-top: .2rem; padding-top: 0; }
	.value { font-size: 1.5rem; font-variant-numeric: tabular-nums; font-weight: 750; line-height: 1.1; margin: .1rem 0 0; }
	.detail { color: var(--muted); font-size: .85rem; line-height: 1.4; }

	.note { color: var(--muted); font-size: .82rem; line-height: 1.5; margin: .2rem 0 0; max-width: 62rem; }
	.sr-only { clip: rect(0 0 0 0); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
	@media (forced-colors: active) { .card, .panel, .problems { border: 1px solid CanvasText; } }
	@media (prefers-contrast: more) { .home { --muted: #36445a; --line: #5c6b80; } .compare, .detail, .note, .week, .label, .meta { color: #2b3748; } }
</style>
