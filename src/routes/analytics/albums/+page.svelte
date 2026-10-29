<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { albumIndexPath, albumReportPath, photosPath } from '$lib/analytics/report-paths';
	import { dayLabel, figureText, matchesName, MAX_COMPARED, QUIET_DAYS, rankText, statusText, undatedReasonShort, type IndexLaunchRow, type IndexUndatedRow } from '$lib/analytics/album-index';
	import { formatDay, plural, recoveredDates, recoveredTag } from '$lib/analytics/launch-recap';
	import { undatedCounts } from '$lib/analytics/album-index';
	import ReportHeader from '$lib/components/analytics/ReportHeader.svelte';
	import LaunchOverlay from '$lib/components/analytics/LaunchOverlay.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const PAGE_SIZE = 25;
	const index = $derived(data.index);
	const hostname = $derived(page.url.hostname);

	let hydrated = $state(false);
	let query = $state('');
	let picked = $state<string[] | null>(null);
	let showQuiet = $state(false);
	let showUndated = $state(false);
	let visible = $state(PAGE_SIZE);
	onMount(() => { hydrated = true; });

	const term = $derived(query.trim());
	const searching = $derived(term !== '');
	const selected = $derived(picked ?? data.compare);
	const chosen = $derived(selected.flatMap((key) => index.launches.filter((row) => row.albumKey === key)));

	const launchMatches = $derived(index.launches.filter((row) => matchesName(row.name, term)));
	const undatedMatches = $derived(index.undated.filter((row) => matchesName(row.name, term)));
	const active = $derived(index.undated.filter((row) => !row.noActivity));
	const quiet = $derived(index.undated.filter((row) => row.noActivity));
	const undatedLine = $derived(undatedCounts(active.length, quiet.length, QUIET_DAYS));
	// Recovered dates: a mark picks them out only when some dates were recorded; when all were recovered the page says so once and draws no mark.
	const recovered = $derived(recoveredDates(index.launches.map((row) => row.inferred)));
	// A column every row fills the same way says nothing, so it is left out: here, a status that is the same for every launch.
	const statusVaries = $derived(new Set(index.launches.map((row) => statusText(row.status))).size > 1);
	// A search looks through every album, including the quiet ones, so a known event is never hidden by the collapsed list.
	const shownUndated = $derived(searching ? undatedMatches.slice(0, visible) : active.slice(0, visible));
	const hiddenUndated = $derived((searching ? undatedMatches.length : active.length) - shownUndated.length);

	// The albums with no launch date are most of the page and none of its five questions, so they wait behind one button. A search opens them.
	const undatedOpen = $derived(showUndated || searching);

	const results = $derived(searching
		? `${plural(launchMatches.length, 'launch', 'launches')} and ${plural(undatedMatches.length, 'album')} without a launch date match "${term}".`
		: '');

	// New search, new page of results.
	$effect(() => { void term; visible = PAGE_SIZE; });

	function toggle(albumKey: string) {
		const next = selected.includes(albumKey) ? selected.filter((key) => key !== albumKey) : selected.length < MAX_COMPARED ? [...selected, albumKey] : selected;
		picked = next;
		const url = new URL(page.url);
		if (next.length) url.searchParams.set('compare', next.join(','));
		else url.searchParams.delete('compare');
		// The choice lives in the address so a comparison can be shared, without adding a history entry for every tick.
		replaceState(url, page.state);
	}
	function clearChoice() {
		picked = [];
		const url = new URL(page.url);
		url.searchParams.delete('compare');
		replaceState(url, page.state);
	}
	const full = $derived(selected.length >= MAX_COMPARED);
	const reportHref = (key: string) => albumReportPath(hostname, key);
	const published = (row: IndexLaunchRow) => `${dayLabel(row.published, index.today)}${recovered.mark ? recoveredTag(row.inferred) : ''}`;
	// On a card the label is "Download requests" and the window sits with the figure ("26 in week 1"), so the label never breaks to fit a narrow column.
	const inWeekOne = (item: IndexLaunchRow['downloads']) => (item.state === 'ok' ? `${figureText(item)} in week 1` : figureText(item));
	const count = (value: number | null) => (value === null ? 'Unknown' : value.toLocaleString('en-US'));
	const lastActivity = (row: IndexUndatedRow) => (row.lastActivity ? dayLabel(row.lastActivity, index.today) : 'None in the window');
</script>

<svelte:head>
	<title>Albums · Photography reports</title>
	<meta name="robots" content="noindex, nofollow, noarchive" />
</svelte:head>

{#snippet pick(row: IndexLaunchRow, words: boolean)}
	<label class="pick">
		<input type="checkbox" checked={selected.includes(row.albumKey)} disabled={!hydrated || (full && !selected.includes(row.albumKey))} onchange={() => toggle(row.albumKey)} />
		<span class="pick-text"><span class="sr-only">Compare {row.name}</span>{#if words}<span aria-hidden="true">Compare</span>{/if}</span>
	</label>
{/snippet}

<div class="album-index">
	<ReportHeader current="albums" />

	<div class="body">
		<section class="intro" aria-labelledby="index-title">
			<p class="eyebrow">Album index</p>
			<h1 id="index-title">Albums</h1>
			<p class="headline"><strong>{index.publicAlbums.toLocaleString('en-US')}</strong> public albums. <strong>{index.launches.length.toLocaleString('en-US')}</strong> have a launch date, the day they were first published. {#if index.undated.length}The other <strong>{index.undated.length.toLocaleString('en-US')}</strong> do not{#if index.activityAvailable}: {undatedLine}{/if}.{/if}</p>
			<p class="note">Counts are browser actions, not people, and download requests are requests, not saved files. Counted over complete days in Chicago time. Albums that are not public are not listed.</p>
			<div class="tools">
				<div class="search">
					<label for="find-album">Find an album</label>
					<input id="find-album" type="search" name="q" autocomplete="off" bind:value={query} disabled={!hydrated} placeholder="Type part of an album name" />
				</div>
				<a class="secondary" href={albumIndexPath(hostname, '/export.csv')} download="album-index.csv">Export CSV</a>
				<a class="secondary" href={photosPath(hostname)}>Photos across all albums</a>
			</div>
			<p class="results" role="status" aria-live="polite">{results}</p>
		</section>

		<section class="panel" aria-labelledby="launches-title">
			<h2 id="launches-title">Launches, newest first</h2>
			{#if index.launches.length === 0}
				<p class="note">No album has a launch date yet. An album gets one when it is first published.</p>
			{:else}
				<p class="lead">Each launch is counted from its first publication and compared with the other launches at the same age. First 3 days and week 1 are photo opens in complete days. Rank at day 7 is among the launches with a complete first week. A launch younger than that shows its figure so far and is not ranked.</p>
					{#if recovered.note}<p class="note">{recovered.note}</p>{/if}
				{#if launchMatches.length === 0}
					<p class="note">No launch matches "{term}".</p>
				{:else}
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -- a sideways-scrolling table must take keyboard focus so it can be scrolled without a mouse (WCAG 2.1.1) -->
					<div class="scroll table-view" role="region" aria-label="Launches table. Scroll sideways for every column." tabindex="0">
						<table>
							<caption class="sr-only">Launches, newest first, with photo opens in the first 3 days and first week, rank at day 7, and download requests in the first week</caption>
							<thead>
								<tr>
									<th scope="col">Compare</th><th scope="col">Album</th><th scope="col">First published</th>{#if statusVaries}<th scope="col">Status</th>{/if}
									<th scope="col" class="num">First 3 days</th><th scope="col" class="num">Week 1</th><th scope="col" class="num">Rank at day 7</th><th scope="col" class="num">Download requests, week 1</th>
								</tr>
							</thead>
							<tbody>
								{#each launchMatches as row (row.albumKey)}
									<tr class:picked={selected.includes(row.albumKey)}>
										<td>{@render pick(row, false)}</td>
										<th scope="row"><a href={reportHref(row.albumKey)}>{row.name}</a></th>
										<td>{published(row)}</td>
										{#if statusVaries}<td>{statusText(row.status)}</td>{/if}
										<td class="num">{figureText(row.day3)}</td>
										<td class="num">{figureText(row.week1)}</td>
										<td class="num">{rankText(row.rank)}</td>
										<td class="num">{figureText(row.downloads)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<p class="note card-view">To compare launches on one chart, tick Compare on up to {MAX_COMPARED} of them. The chart is under the list.</p>
						<ul class="cards card-view" aria-label="Launches, newest first">
						{#each launchMatches as row (row.albumKey)}
							<li class="card" class:picked={selected.includes(row.albumKey)}>
								<div class="card-head"><a href={reportHref(row.albumKey)}>{row.name}</a>{@render pick(row, true)}</div>
								<dl class="tight">
										<div><dt>First 3 days</dt><dd>{figureText(row.day3)}</dd></div>
										<div><dt>Week 1</dt><dd>{figureText(row.week1)}</dd></div>
										<div><dt>Rank at day 7</dt><dd>{rankText(row.rank)}</dd></div>
									</dl>
									<dl class="tight">
										<div><dt>First published</dt><dd>{published(row)}</dd></div>
										{#if statusVaries}<div><dt>Status</dt><dd>{statusText(row.status)}</dd></div>{/if}
										<div><dt>Download requests</dt><dd>{inWeekOne(row.downloads)}</dd></div>
									</dl>
							</li>
						{/each}
					</ul>
				{/if}

				<div class="compare" aria-labelledby="compare-title" role="group">
					<h3 id="compare-title">Compare launches</h3>
					<p class="lead">Tick up to {MAX_COMPARED} launches to draw their photo opens, added up by day since publication, on one chart. <span class="count">{selected.length} of {MAX_COMPARED} chosen.</span>{#if full} Untick one to choose another.{/if}
						{#if selected.length}<button type="button" class="link" onclick={clearChoice}>Clear</button>{/if}</p>
					{#if chosen.length >= 2}
						<LaunchOverlay rows={chosen} />
					{:else}
						<p class="note">{chosen.length === 1 ? 'Choose one more launch to compare.' : 'Choose at least two launches to compare.'}</p>
					{/if}
				</div>
			{/if}
		</section>

		<section class="panel" aria-labelledby="undated-title">
			<h2 id="undated-title">Albums without a launch date</h2>
			{#if index.undated.length === 0}
				<p class="note">Every public album has a launch date.</p>
			{:else}
				<p class="lead">These cannot be compared with launches. They are ordered by photo opens in the last {QUIET_DAYS} complete days, {formatDay(index.window.start)} to {formatDay(index.window.end)}.{#if !index.activityAvailable} <strong>Those counts could not be read just now, so none is shown rather than a wrong one.</strong>{/if}</p>
				{#if !searching}
					<button type="button" class="secondary" aria-expanded={showUndated} aria-controls="undated-list" onclick={() => (showUndated = !showUndated)} disabled={!hydrated}>
						{showUndated ? `Hide the ${active.length.toLocaleString('en-US')} albums with activity` : `Show the ${active.length.toLocaleString('en-US')} albums without a launch date that had activity`}
					</button>
				{/if}
				<div id="undated-list" hidden={!undatedOpen}>
					{#if undatedOpen}
					{#if shownUndated.length === 0}
						<p class="note">{searching ? `No album without a launch date matches "${term}".` : 'Every one of these albums had no activity in the window.'}</p>
					{:else}
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -- a sideways-scrolling table must take keyboard focus so it can be scrolled without a mouse (WCAG 2.1.1) -->
						<div class="scroll table-view" role="region" aria-label="Albums without a launch date, table. Scroll sideways for every column." tabindex="0">
							<table>
								<caption class="sr-only">Albums without a launch date, with photo opens in the last {QUIET_DAYS} complete days and the reason they have no launch date</caption>
								<thead>
									<tr><th scope="col">Album</th><th scope="col" class="num">Photos</th><th scope="col" class="num">Photo opens, last {QUIET_DAYS} days</th><th scope="col">Last activity</th><th scope="col">Why no launch date</th></tr>
								</thead>
								<tbody>
									{#each shownUndated as row (row.albumKey)}
										<tr>
											<th scope="row"><a href={reportHref(row.albumKey)}>{row.name}</a></th>
											<td class="num">{row.photos.toLocaleString('en-US')}</td>
											<td class="num">{count(row.photoOpens)}</td>
											<td>{lastActivity(row)}</td>
											<td>{undatedReasonShort(row.reason)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						<ul class="cards card-view" aria-label="Albums without a launch date">
							{#each shownUndated as row (row.albumKey)}
								<li class="card">
									<div class="card-head"><a href={reportHref(row.albumKey)}>{row.name}</a></div>
									<dl>
										<div><dt>Photos</dt><dd>{row.photos.toLocaleString('en-US')}</dd></div>
										<div><dt>Photo opens, last {QUIET_DAYS} days</dt><dd>{count(row.photoOpens)}</dd></div>
										<div><dt>Last activity</dt><dd>{lastActivity(row)}</dd></div>
										<div><dt>Why no launch date</dt><dd>{undatedReasonShort(row.reason)}</dd></div>
									</dl>
								</li>
							{/each}
						</ul>
					{/if}
					{#if hiddenUndated > 0}
						<button type="button" class="secondary more" onclick={() => (visible += PAGE_SIZE)}>{hiddenUndated <= PAGE_SIZE ? `Show the other ${hiddenUndated.toLocaleString('en-US')}` : `Show ${PAGE_SIZE} more (${hiddenUndated.toLocaleString('en-US')} left)`}</button>
					{/if}

					{#if !searching && quiet.length}
						<div class="quiet">
							<button type="button" class="secondary" aria-expanded={showQuiet} aria-controls="quiet-list" onclick={() => (showQuiet = !showQuiet)} disabled={!hydrated}>
								{showQuiet ? `Hide the ${quiet.length.toLocaleString('en-US')} albums with no activity` : `Show ${quiet.length.toLocaleString('en-US')} ${quiet.length === 1 ? 'album' : 'albums'} with no activity in the last ${QUIET_DAYS} days`}
							</button>
							<div id="quiet-list" hidden={!showQuiet}>
								{#if showQuiet}
									<p class="lead">No photo opens, album opens, download requests, favorites or shares in the window. This is a recorded zero, not a gap in the records.</p>
									<ul class="quiet-list" aria-label="Albums with no activity">
										{#each quiet as row (row.albumKey)}
											<li><a href={reportHref(row.albumKey)}><span class="name">{row.name}</span><span class="why">{row.photos.toLocaleString('en-US')} photos · {undatedReasonShort(row.reason)}</span></a></li>
										{/each}
									</ul>
								{/if}
							</div>
						</div>
					{/if}
					{/if}
				</div>
			{/if}
		</section>
	</div>
</div>

<style>
	.album-index { --ink: #172033; --muted: #526176; --line: #d8e0ea; --blue: #1458c4; --blue-ink: #174ea6; background: #edf2f7; color: var(--ink); margin-inline: auto; min-height: 100dvh; max-width: 96rem; min-width: 0; overflow-x: clip; padding: .5rem min(1rem, 4vw) 3rem; }
	@media (min-width: 640px) { .album-index { padding: 1.25rem 1.5rem 3.5rem; } }
	@media (min-width: 1024px) { .album-index { padding-inline: 2rem; } }

	a:focus-visible, button:focus-visible, input:focus-visible, [tabindex]:focus-visible { outline: 3px solid var(--blue-ink); outline-offset: 2px; }

	.body { display: grid; gap: 1rem; min-width: 0; }
	.panel { background: #fff; border: 1px solid var(--line); border-radius: .9rem; min-width: 0; padding: 1rem min(1rem, 4vw); }
	.intro { min-width: 0; padding-block: .25rem; }
	.eyebrow { color: var(--blue-ink); font-size: .75rem; font-weight: 800; letter-spacing: .09em; margin: 0; text-transform: uppercase; }
	h1 { font-size: 1.55rem; font-weight: 750; letter-spacing: -.01em; line-height: 1.2; margin: .35rem 0 .4rem; }
	h2 { font-size: 1.05rem; font-weight: 700; margin: 0; }
	h3 { font-size: .95rem; font-weight: 700; margin: 0; }
	.headline { font-size: 1.15rem; line-height: 1.45; margin: 0 0 .5rem; max-width: 46rem; }
	.headline :global(strong) { font-weight: 800; }
	.note, .lead { color: var(--muted); font-size: .85rem; line-height: 1.5; margin: .35rem 0 .6rem; max-width: 52rem; }
	.lead :global(strong) { color: var(--ink); }
	.count { color: var(--ink); font-weight: 650; }
	.results { color: var(--ink); font-size: .88rem; margin: .5rem 0 0; min-height: 1.3rem; }

	.tools { align-items: end; display: flex; flex-wrap: wrap; gap: .6rem 1rem; margin-top: .6rem; }
	.search { display: grid; flex: 1 1 18rem; gap: .25rem; max-width: 28rem; }
	.search label { color: var(--ink); font-size: .85rem; font-weight: 700; }
	input[type='search'] { background: #fff; border: 1px solid #8fa1b8; border-radius: .55rem; color: var(--ink); font: inherit; font-size: 1rem; min-height: 2.75rem; padding: .4rem .75rem; width: 100%; }
	input[type='search']:disabled { opacity: .7; }
	.secondary { align-items: center; background: #fff; border: 1px solid #8fa1b8; border-radius: .55rem; color: var(--blue-ink); cursor: pointer; display: inline-flex; font: inherit; font-size: .9rem; font-weight: 700; justify-content: center; min-height: 2.75rem; padding: .5rem .9rem; text-align: center; text-decoration: none; }
	.secondary:hover:not(:disabled) { background: #eef4fc; }
	.secondary:disabled { cursor: default; opacity: .6; }
	.more { margin-top: .6rem; }
	.link { background: none; border: 0; color: var(--blue-ink); cursor: pointer; font: inherit; font-size: .85rem; font-weight: 700; min-height: 2.75rem; min-width: 2.75rem; padding: 0 .6rem; text-decoration: underline; }

	.scroll { overflow-x: auto; }
	table { border-collapse: collapse; font-size: .88rem; width: 100%; }
	th, td { border-bottom: 1px solid #e1e8f0; padding: .4rem .55rem; text-align: left; vertical-align: middle; }
	thead th { color: var(--muted); font-size: .76rem; font-weight: 650; vertical-align: bottom; }
	tbody th { font-weight: 600; min-width: 11rem; }
	tbody th a { align-items: center; color: var(--ink); display: inline-flex; min-height: 2.75rem; text-decoration-color: #8fa1b8; text-underline-offset: 3px; }
	tbody th a:hover { color: var(--blue-ink); }
	.num { font-variant-numeric: tabular-nums; text-align: right; }
	td.num { white-space: nowrap; }
	tr.picked > * { background: #eaf1fd; }

	.pick { align-items: center; cursor: pointer; display: inline-flex; font-size: .85rem; gap: .35rem; min-height: 2.75rem; min-width: 2.75rem; padding-inline: .25rem; }
	.pick input { cursor: pointer; flex: none; height: 1.3rem; margin: 0; width: 1.3rem; }
	.pick input:disabled { cursor: default; }
	/* The word may break at the largest text sizes, or it pushes the card past the panel's edge (measured at 312%). */
	.pick-text { min-width: 0; overflow-wrap: anywhere; }
	.card-head .pick { flex: 0 1 auto; max-width: 100%; min-width: 0; }

	.cards { display: none; gap: .6rem; list-style: none; margin: .5rem 0 0; padding: 0; }
	.card { border: 1px solid var(--line); border-radius: .7rem; min-width: 0; padding: .6rem .75rem; }
	.card.picked { background: #eaf1fd; border-color: #9db8e6; }
	.card-head { align-items: center; display: flex; flex-wrap: wrap; gap: .1rem .5rem; justify-content: space-between; }
	.card-head a { align-items: center; color: var(--ink); display: inline-flex; flex: 1 1 min(9rem, 100%); min-height: 2.75rem; min-width: 0; font-size: .98rem; font-weight: 650; overflow-wrap: break-word; text-decoration-color: #8fa1b8; text-underline-offset: 3px; }
	.card dl { display: grid; gap: .25rem .75rem; grid-template-columns: repeat(auto-fit, minmax(min(7.5rem, 100%), 1fr)); margin: .4rem 0 0; }
	.card dl div { min-width: 0; }
	.card dl:not(.tight) div:first-child { grid-column: 1 / -1; }
	/* A launch card's three figures sit on one line (down to a 390px phone at the default text size); the larger the text, the fewer fit. */
	.card dl.tight { grid-template-columns: repeat(auto-fit, minmax(min(5.5rem, 100%), 1fr)); }
	.card dl.tight + dl.tight { grid-template-columns: repeat(auto-fit, minmax(min(7.5rem, 100%), 1fr)); margin-top: .25rem; }
	.card dt { color: var(--muted); font-size: .74rem; }
	.card dd { font-size: .92rem; font-variant-numeric: tabular-nums; margin: 0; overflow-wrap: break-word; }

	.note.card-view { display: none; }
	@media (max-width: 959px) {
		.table-view { display: none; }
		.cards, .note.card-view { display: grid; }
	}

	.compare { border-top: 1px solid #e1e8f0; margin-top: 1rem; padding-top: .8rem; }

	.quiet { margin-top: .9rem; }
	.quiet-list { column-gap: 2rem; columns: 1; list-style: none; margin: .4rem 0 0; padding: 0; }
	@media (min-width: 720px) { .quiet-list { columns: 2; } }
	@media (min-width: 1100px) { .quiet-list { columns: 3; } }
	.quiet-list li { break-inside: avoid; }
	.quiet-list a { color: var(--ink); display: grid; gap: .05rem; min-height: 2.75rem; padding: .35rem 0; text-decoration: none; }
	.quiet-list .name { font-size: .9rem; font-weight: 600; overflow-wrap: break-word; text-decoration: underline; text-decoration-color: #8fa1b8; text-underline-offset: 3px; }
	.quiet-list a:hover .name { color: var(--blue-ink); }
	.why { color: var(--muted); font-size: .78rem; }

	.sr-only { clip: rect(0 0 0 0); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
	@media (min-width: 1024px) { h1 { font-size: 1.85rem; } }
	@media (forced-colors: active) { .panel, .card { border: 1px solid CanvasText; } }
	@media (prefers-contrast: more) { .album-index { --muted: #36445a; --line: #5c6b80; } .note, .lead, .why, .card dt { color: #2b3748; } .secondary { border-color: #36445a; } }
</style>
