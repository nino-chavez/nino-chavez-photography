<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { albumIndexPath, dataPath, homePath, sitePath } from '$lib/analytics/report-paths';
	import { pageLabel, pagesFor, providerFix, referrersFor, sectionCards, sectionLabel, siteLead, SITE_PERIODS, todayLine, windowNote } from '$lib/analytics/site-report';
	import { SITE_SECTIONS } from '$lib/analytics/site-traffic';
	import ReportHeader from '$lib/components/analytics/ReportHeader.svelte';
	import IntelligenceWorkspace from '$lib/components/analytics/IntelligenceWorkspace.svelte';
	import SiteActions from '$lib/components/analytics/SiteActions.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The owner's record form opens from a request made here, as on the album report. It needs the page to be interactive.
	let recordRequest = $state(0);
	let hydrated = $state(false);
	onMount(() => { hydrated = true; });
	const hostname = $derived(page.url.hostname);
	const traffic = $derived(data.traffic);
	const report = $derived(traffic && traffic.available ? traffic : null);
	const lead = $derived(siteLead({ traffic, actions: data.actions, period: data.period, section: data.section, today: data.today }));
	const figures = $derived([lead.reach, lead.contacts, lead.outbound]);
	const today = $derived(todayLine(data.actions, data.today));
	const pages = $derived(report ? pagesFor(report, data.section) : []);
	const pageCount = $derived(Math.max(1, Math.ceil(pages.length / 8)));
	const currentPage = $derived(Math.min(data.page, pageCount - 1));
	const visiblePages = $derived(pages.slice(currentPage * 8, (currentPage + 1) * 8));
	const sources = $derived(report ? referrersFor(report, data.section) : []);
	const cards = $derived(report ? sectionCards(report) : []);
	const days = $derived(report ? (data.section === 'all' ? report.daily : report.sections.find((item) => item.key === data.section)?.daily ?? []) : []);
	const largest = $derived(Math.max(1, ...days.map((day) => day.pageviews)));
	const peakDay = $derived(days.find((day) => day.pageviews === largest) ?? null);
	const points = $derived(days.map((day, index) => `${(index / Math.max(1, days.length - 1)) * 100},${100 - (day.pageviews / largest) * 88}`).join(' '));

	function href(period: number, section: string, pageIndex = 0) {
		const params = new URLSearchParams({ period: String(period) });
		if (section !== 'all') params.set('section', section);
		if (pageIndex > 0) params.set('page', String(pageIndex));
		return `${sitePath(hostname)}?${params}`;
	}
	const shortDate = (date: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
</script>

<svelte:head>
	<title>Site · Photography reports</title>
	<meta name="robots" content="noindex, nofollow, noarchive" />
</svelte:head>

<div class="site">
	<ReportHeader current="site" />

	<div class="body">
		<section class="intro" aria-labelledby="site-title">
			<p class="eyebrow">Site · ninochavez.co</p>
			<h1 id="site-title">Is anyone looking at your profile and work, and did anyone reach out?</h1>
		</section>

		<div class="controls">
			<nav class="group" aria-label="Period"><span class="label">Period</span>
				<span class="chips">{#each SITE_PERIODS as period (period)}<a class="choice" href={href(period, data.section)} aria-current={data.period === period ? 'true' : undefined}>{period} days</a>{/each}</span>
			</nav>
			<nav class="group" aria-label="Section"><span class="label">Section</span>
				<span class="chips">
					<a class="choice" href={href(data.period, 'all')} aria-current={data.section === 'all' ? 'true' : undefined}>All sections</a>
					{#each SITE_SECTIONS as section (section.key)}<a class="choice" href={href(data.period, section.key)} aria-current={data.section === section.key ? 'true' : undefined}>{section.label}</a>{/each}
				</span>
			</nav>
		</div>

		<section class="lead" aria-labelledby="lead-title">
			<h2 id="lead-title" class="sr-only">{sectionLabel(data.section)}, the last {data.period} days</h2>
			<div class="figures">
				{#each figures as figure (figure.label)}
					<div class="figure">
						<p class="label">{figure.label}</p>
						{#if figure.value !== null}<p class="value">{figure.value}</p>{/if}
						<p class="detail">{figure.detail}</p>
					</div>
				{/each}
			</div>
			{#if today}<p class="note">{today}</p>{/if}
			<p class="note">{windowNote(traffic, data.period, data.today)} <a href={dataPath(hostname, '#site-measures')}>How these are counted</a>.</p>
		</section>

		{#if report && data.section !== 'photography'}
			<section class="panel trend" aria-labelledby="trend-title">
				<h2 id="trend-title">Page loads by day</h2>
				<svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Page loads by day, ${days.length} days, the most in one day ${largest.toLocaleString()}. The values are listed below.`}>
					<polyline fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" {points} />
				</svg>
				{#if days.length && peakDay}<p class="note">{shortDate(days[0].date)} to {shortDate(days[days.length - 1].date)}, one point a day. The most loads in one day were {peakDay.pageviews.toLocaleString()}, on {shortDate(peakDay.date)}; the line's baseline is zero.</p>{/if}
				<details>
					<summary>Daily values</summary>
					<dl class="daily">{#each days as day (day.date)}<div><dt>{shortDate(day.date)}</dt><dd>{day.pageviews.toLocaleString()}</dd></div>{/each}</dl>
				</details>
			</section>
		{/if}

		{#if report && data.section === 'all'}
			<section aria-labelledby="where-title">
				<h2 id="where-title">Where attention went</h2>
				<ul class="cards">
					{#each cards as card (card.key)}
						<li class="card">
							<a href={card.pointsToGallery ? homePath(hostname) : href(data.period, card.key)}>
								<span class="name">{card.label}</span>
								{#if card.pointsToGallery}<span class="detail">The gallery is counted on Home and Albums, not as page loads.</span>
								{:else}<strong>{(card.pageLoads ?? 0).toLocaleString()}</strong><span class="detail">page loads · {(card.entryVisits ?? 0).toLocaleString()} entry visits</span>{/if}
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if report && data.section === 'photography'}
			<section class="panel" aria-labelledby="gallery-title">
				<h2 id="gallery-title">Photography is counted in the gallery reports</h2>
				<p class="note">The gallery is one app page, so page loads undercount what people do in it. Open <a href={homePath(hostname)}>Home</a> for what happened since you last looked, or <a href={albumIndexPath(hostname)}>Albums</a> for every launch.</p>
			</section>
		{:else if report}
			<div class="grid">
				<section class="panel" aria-labelledby="pages-title">
					<h2 id="pages-title">{data.section === 'all' ? 'Pages drawing attention' : `${sectionLabel(data.section)} pages`}</h2>
					<p class="sub">Page loads</p>
					{#if pages.length}
						<ol class="ranked">{#each visiblePages as row, index (row.path)}<li><span class="rank">{currentPage * 8 + index + 1}</span><a href={`https://ninochavez.co${row.path}`} target="_blank" rel="noopener noreferrer"><strong>{pageLabel(row.path)}</strong><small>{row.path}</small><span class="sr-only"> (opens the page on ninochavez.co in a new tab)</span></a><span class="count">{row.pageviews.toLocaleString()}</span></li>{/each}</ol>
					{:else}<p class="note">No page loads were measured in this section for these dates. This does not mean the section is broken.</p>{/if}
					{#if pageCount > 1}
						<nav class="pager" aria-label="Pages drawing attention"><span>Page {currentPage + 1} of {pageCount}</span><span class="pager-links">{#if currentPage > 0}<a href={href(data.period, data.section, currentPage - 1)}>Previous</a>{/if}{#if currentPage < pageCount - 1}<a href={href(data.period, data.section, currentPage + 1)}>Next</a>{/if}</span></nav>
					{/if}
				</section>
				<section class="panel" aria-labelledby="sources-title">
					<h2 id="sources-title">Where visits came from</h2>
					<p class="sub">Entry visits</p>
					{#if sources.length}<dl class="sources">{#each sources as source (source.host)}<div><dt>{source.host}</dt><dd>{source.entryVisits.toLocaleString()}</dd></div>{/each}</dl>
					{:else}<p class="note">No referring site was reported for these dates. Visits that arrive directly have no referrer.</p>{/if}
				</section>
			</div>
		{/if}

		{#if !report}
			<section class="panel" role="status" aria-labelledby="down-title">
				<h2 id="down-title">The page-load lists are not available</h2>
				<p class="note">Top pages and visit sources come from Cloudflare, which could not be read, so they are not shown. That is not the same as there being none. {providerFix(traffic && !traffic.available ? traffic.reason : 'could not be read')} The click counts above and the page actions below do not depend on Cloudflare.</p>
			</section>
		{/if}

		<SiteActions report={data.actions} period={data.period} section={data.section} currentPage={data.actionsPage} />

		{#if data.intelligence !== 'none'}
			<section class="panel" id="assistant" aria-label="Report intelligence and recorded changes for this site report">
				{#if data.intelligence === 'record'}
					<h2 id="record-title">Record what you did</h2>
					<p class="note">Note a change you made, such as a new post or a changed link, so that later you can check whether it moved anything. Nothing is published or sent.</p>
					<p class="action"><button type="button" class="record" onclick={() => { recordRequest += 1; }} disabled={!hydrated}>Record what you did</button></p>
				{/if}
				<IntelligenceWorkspace recordOnly={data.intelligence === 'record'} kind="sites" scope={{ kind: 'sites', period: data.period, section: data.section }} owner={data.intelligenceOwner} signInNext="/analytics/sites" {recordRequest} />
			</section>
		{/if}
	</div>
</div>

<style>
	.site { --ink: #172033; --muted: #526176; --line: #d8e0ea; --blue: #1458c4; --blue-ink: #174ea6; background: #edf2f7; color: var(--ink); margin-inline: auto; min-height: 100dvh; max-width: 96rem; min-width: 0; overflow-x: clip; padding: .5rem min(1rem, 4vw) 3rem; }
	@media (min-width: 640px) { .site { padding: 1rem 1.5rem 2.5rem; } }
	@media (min-width: 1024px) { .site { padding-inline: 2rem; } }
	a:focus-visible, summary:focus-visible { outline: 3px solid var(--blue-ink); outline-offset: 2px; }
	.body { display: grid; gap: .9rem; min-width: 0; }
	.eyebrow { color: var(--blue-ink); font-size: .75rem; font-weight: 800; letter-spacing: .09em; margin: 0; text-transform: uppercase; }
	h1 { font-size: 1.2rem; font-weight: 700; letter-spacing: -.01em; line-height: 1.28; margin: .3rem 0 0; max-width: 46rem; }
	@media (min-width: 640px) { h1 { font-size: 1.4rem; } }
	@media (min-width: 1024px) { h1 { font-size: 1.6rem; } }
	h2 { font-size: 1.02rem; font-weight: 700; margin: 0; }

	.controls { display: flex; flex-wrap: wrap; gap: .5rem 1.5rem; }
	.group { align-items: center; display: flex; flex-wrap: wrap; gap: .25rem .6rem; }
	.label { color: var(--muted); font-size: .8rem; font-weight: 650; margin: 0; }
	.chips { display: flex; flex-wrap: wrap; gap: .3rem; }
	.choice { text-align: center; align-items: center; background: #fff; border: 1px solid #b9c7da; border-radius: .5rem; color: var(--blue-ink); display: inline-flex; font-size: .85rem; font-weight: 650; min-height: 2.75rem; padding: 0 .75rem; text-decoration: none; }
	.choice[aria-current='true'] { background: #dce9fa; border-color: var(--blue-ink); box-shadow: inset 0 -3px 0 var(--blue-ink); }
	/* Selected is also a tick, so it does not depend on the colour of the fill. */
	.choice[aria-current='true']::before { content: '\2713\00a0' / ''; }

	.lead { min-width: 0; }
	.figures { display: grid; gap: .6rem; grid-template-columns: 1fr; }
	@media (min-width: 900px) { .figures { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	.figure, .panel { background: #fff; border: 1px solid var(--line); border-radius: .8rem; min-width: 0; padding: .8rem min(.9rem, 3.6vw); }
	.figure p { margin: .2rem 0 0; }
	@media (max-width: 899px) { .figure { column-gap: .8rem; display: grid; grid-template-columns: minmax(0, 1fr) auto; } .figure .label { align-self: center; } .figure .value { grid-column: 2; grid-row: 1; margin: 0; text-align: right; } .figure .detail { grid-column: 1 / -1; } }
	.value { font-size: 1.7rem; font-variant-numeric: tabular-nums; font-weight: 750; line-height: 1.1; }
	.detail { color: var(--muted); font-size: .85rem; line-height: 1.4; }
	.note { color: var(--muted); font-size: .85rem; line-height: 1.5; margin: .4rem 0 0; max-width: 62rem; }
	.note a { color: var(--blue-ink); text-decoration: underline; text-underline-offset: 3px; }
	.sub { color: var(--muted); font-size: .8rem; margin: .1rem 0 .3rem; }

	.trend svg { color: var(--blue); display: block; height: 3.25rem; margin: .5rem 0; width: 100%; }
	details { font-size: .85rem; }
	summary { align-items: center; color: var(--blue-ink); cursor: pointer; display: flex; font-weight: 650; min-height: 2.75rem; }
	.daily { display: grid; gap: .1rem .8rem; grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr)); margin: 0 0 .3rem; }
	.daily div { display: flex; justify-content: space-between; padding: .2rem 0; }
	.daily dt { color: var(--muted); }
	.daily dd { font-variant-numeric: tabular-nums; font-weight: 650; margin: 0; }

	.cards { display: grid; gap: .6rem; grid-template-columns: repeat(auto-fit, minmax(min(9rem, 100%), 1fr)); list-style: none; margin: .5rem 0 0; padding: 0; }
	.card a { background: #fff; border: 1px solid var(--line); border-radius: .8rem; color: var(--ink); display: grid; gap: .2rem; height: 100%; min-height: 2.75rem; padding: .7rem .8rem; text-decoration: none; }
	.card a:hover { border-color: var(--blue-ink); }
	.card .name { font-weight: 700; }
	.card span, .card strong { overflow-wrap: break-word; }
	.card strong { font-size: 1.35rem; font-variant-numeric: tabular-nums; }

	.grid { display: grid; gap: .9rem; }
	@media (min-width: 900px) { .grid { grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); align-items: start; } }
	.ranked { list-style: none; margin: 0; padding: 0; }
	.ranked li { align-items: center; border-top: 1px solid #e6ecf3; display: grid; gap: .6rem; grid-template-columns: 1.6rem minmax(0, 1fr) auto; min-height: 2.75rem; padding: .35rem 0; }
	.ranked li:first-child { border-top: 0; }
	.rank { color: var(--muted); font-variant-numeric: tabular-nums; }
	.ranked a { align-content: center; color: var(--ink); display: grid; min-height: 2.75rem; min-width: 0; text-decoration: none; }
	.ranked a strong { overflow-wrap: break-word; text-transform: capitalize; }
	.ranked small { color: var(--muted); font-size: .75rem; overflow-wrap: break-word; }
	.count { font-variant-numeric: tabular-nums; font-weight: 700; }
	.sources { margin: 0; }
	.sources div { border-top: 1px solid #e6ecf3; display: flex; gap: .8rem; justify-content: space-between; padding: .5rem 0; }
	.sources div:first-child { border-top: 0; }
	.sources dt { overflow-wrap: break-word; }
	.sources dd { font-variant-numeric: tabular-nums; font-weight: 700; margin: 0; }
	.pager { align-items: center; display: flex; flex-wrap: wrap; font-size: .85rem; gap: .5rem 1rem; justify-content: space-between; margin-top: .6rem; }
	.pager-links { display: flex; gap: .4rem; }
	.pager-links a { align-items: center; border: 1px solid #b9c7da; border-radius: .5rem; color: var(--blue-ink); display: inline-flex; font-weight: 650; min-height: 2.75rem; padding: 0 .8rem; text-decoration: none; }
	.action { margin: .6rem 0 0; }
	.record { align-items: center; background: var(--blue-ink); border: 1px solid var(--blue-ink); border-radius: .5rem; color: #fff; cursor: pointer; display: inline-flex; font: inherit; font-size: .85rem; font-weight: 650; min-height: 2.75rem; padding: 0 .9rem; }
	.record:disabled { cursor: not-allowed; opacity: .62; }
	.record:focus-visible { outline: 3px solid var(--blue-ink); outline-offset: 2px; }
	.sr-only { clip: rect(0 0 0 0); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
	@media (forced-colors: active) {
		.figure, .panel, .card a, .choice { border: 1px solid CanvasText; }
		.choice[aria-current='true'] { background: Highlight; border: 2px solid CanvasText; color: HighlightText; forced-color-adjust: none; }
		.trend svg { color: CanvasText; }
	}
	@media (prefers-contrast: more) { .site { --muted: #36445a; --line: #5c6b80; } .detail, .note, .sub, .label { color: #2b3748; } }
</style>
