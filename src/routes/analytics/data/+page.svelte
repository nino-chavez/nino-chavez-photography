<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { dataPath } from '$lib/analytics/report-paths';
	import { EVENTS_NOT_READ, journeyName, notReadNote, siteJourneyNote, withNotRead } from '$lib/analytics/data-quality';
	import type { DataAnchor } from '$lib/analytics/data-anchors';
	import ClassificationCorrections from '$lib/components/analytics/ClassificationCorrections.svelte';
	import ReportHeader from '$lib/components/analytics/ReportHeader.svelte';
	import ResponsiveTable from '$lib/components/analytics/ResponsiveTable.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const view = $derived(data.view);
	const hostname = $derived(page.url.hostname);
	const trouble = $derived(view.status.state === 'attention');
	// The event counts arrive after the page. If they cannot be read, the headline and the list of parts not read change with them,
	// so the page never says nothing is missing above a part that says it is.
	let eventsRead = $state<'pending' | 'read' | 'failed'>('pending');
	$effect(() => {
		let live = true;
		eventsRead = 'pending';
		void data.events.then((events) => { if (live) eventsRead = events.available ? 'read' : 'failed'; });
		return () => { live = false; };
	});
	const status = $derived(eventsRead === 'failed' ? withNotRead(view.status, EVENTS_NOT_READ) : view.status);
	const through = $derived(new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${view.window.end}T12:00:00Z`)));
	const anchor = (id: DataAnchor) => `#${id}`;
	const asOfTime = (value: string | null) => (value ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value)) : 'not recorded');
	const PERIODS = [7, 30, 90] as const;
	const signInHref = $derived(`${base}/login?next=${encodeURIComponent('/analytics/data')}`);
</script>

<svelte:head>
	<title>Data · Photography reports</title>
	<meta name="robots" content="noindex, nofollow, noarchive" />
</svelte:head>

<div class="data">
	<ReportHeader current="data" />

	<div class="body">
		<section id="status" class="intro" class:trouble aria-labelledby="status-title">
			<p class="eyebrow">{trouble ? 'Data problem' : 'Data quality'} · {view.window.label}</p>
			<h1 id="status-title">{status.headline}</h1>
			<p class="detail">{status.detail}</p>

			{#if status.problems.length}
				<ul class="issues" aria-label="What needs attention">
					{#each status.problems as problem (problem.id)}
						<li><span>{problem.text}</span>{#if problem.href !== 'status'}<a href={anchor(problem.href)}>{problem.linkText}<span class="sr-only"> for: {problem.text}</span></a>{/if}</li>
					{/each}
				</ul>
			{/if}
			{#if status.notRead.length}
				<ul class="issues quiet" aria-label="Parts that could not be read here">
					{#each status.notRead as item (item.id)}
						<li><span>Could not be read: {item.name}.</span><a href={anchor(item.section)}>What this means<span class="sr-only"> for {item.name}</span></a></li>
					{/each}
				</ul>
			{/if}

			<nav class="period" aria-label="Days covered"><span class="label">Days covered</span>
				<span class="chips">{#each PERIODS as days (days)}<a class="choice" href={dataPath(hostname, `?period=${days}`)} aria-current={view.days === days ? 'true' : undefined}>{days} days</a>{/each}</span>
			</nav>
		</section>

		<div class="grid">
			<div class="pair-cols">
				<div class="stack">
			<section id="coverage" class="panel" aria-labelledby="coverage-title">
				<h2 id="coverage-title">Coverage and freshness</h2>
				<p class="lead">Are the gallery counts current, and is every day in them complete?</p>
				{#if view.coverage}
					<p>{view.coverage.headline}</p>
					{#if view.coverage.incompleteDays.length}<p class="detail">Incomplete: {view.coverage.incompleteDays.join(', ')}.</p>{/if}
					<p>{view.coverage.refresh}</p>
					<p class="detail">{view.coverage.since ? `History is kept since ${view.coverage.since}; earlier days have no record. ` : ''}{view.coverage.basis}</p>
				{:else if view.reportDown}
					<p class="gap"><strong>Not shown.</strong> {view.reportDown.what} <span>{view.reportDown.todo}</span></p>
				{/if}
			</section>
			<section id="counting" class="panel" aria-labelledby="counting-title">
				<h2 id="counting-title">How counting works</h2>
				<p class="lead">What one number in the gallery reports stands for.</p>
				{#if view.counting}
					<p>{view.counting.rule}</p>
					<dl class="facts">{#each view.counting.totals as item (item.label)}<div><dt>{item.label}</dt><dd>{item.value}</dd></div>{/each}
						<div><dt>Browsers with any activity</dt><dd>{view.counting.browsers.value ?? 'Not shown'}</dd></div></dl>
					<p class="detail">{view.counting.browsers.limit}</p>
					<h3>Recorded event counts</h3>
					{#await data.events}
						<p class="detail" role="status">Loading the detailed event counts. The rest of this page is ready.</p>
					{:then events}
						<p class="detail">{events.label}</p>
						{#if events.counts}
							<details>
								<summary>Inspect every event count</summary>
								<dl class="facts" aria-label="Recorded event counts">{#each events.counts as item (item.label)}<div><dt>{item.label}</dt><dd>{item.count.toLocaleString()}</dd></div>{/each}</dl>
							</details>
						{:else if events.down}
							<p class="gap"><strong>Not shown.</strong> {events.down.what} <span>{events.down.todo}</span></p>
						{/if}
					{/await}
				{:else if view.reportDown}
					<p class="gap"><strong>Not shown.</strong> {view.reportDown.what} <span>{view.reportDown.todo}</span></p>
				{/if}
			</section>
				</div>
				<div class="stack">
			<section id="delivery" class="panel" aria-labelledby="delivery-title">
				<h2 id="delivery-title">Delivery and volume</h2>
				<p class="lead">Is collection reaching the analytics provider, and how much is being sent?</p>
				{#if view.deliveryState === 'shown' && view.delivery.rows}
					<dl class="facts">{#each view.delivery.rows as row (row.label)}<div><dt>{row.label}</dt><dd>{row.value}</dd></div>{/each}</dl>
						<h3>What these words mean</h3>
						<dl class="terms">{#each view.delivery.terms as item (item.term)}<div><dt>{item.term}</dt><dd>{item.means}</dd></div>{/each}</dl>
					{#if view.delivery.volume}<p>{view.delivery.volume}</p>{:else}<p>No volume estimate is available yet. This does not mean no traffic.</p>{/if}
					<p class="detail">{view.delivery.volumeLimit}</p>
				{:else if view.deliveryNote}
					<p class="gap"><strong>{view.deliveryState === 'owner_only' ? 'Sign in to see the counts.' : 'Not shown.'}</strong> {view.deliveryNote}</p>
				{/if}
				<p class="detail">{view.delivery.provider} {view.delivery.quota}</p>
				{#if view.evidence}
					<h3>Search and download evidence</h3>
					{#if view.evidence.rows.length}
							<ResponsiveTable label="Search and download evidence" headerLabel="What was attempted" columns={[{ label: 'Status' }, { label: 'Recorded', numeric: true }, { label: 'Results', numeric: true }, { label: 'Errors' }, { label: 'Latest, Chicago time' }]} rows={view.evidence.rows.map((row) => ({ key: row.path + row.status, title: row.path, values: [row.status, row.recorded, row.results, row.errors, row.latest] }))} />
					{:else}<p>No search or download attempts were recorded in these dates. That is not evidence that nothing happened.</p>{/if}
					<p class="detail" class:alert={view.evidence.failed}>{view.evidence.label} {view.evidence.note}</p>
				{/if}
			</section>
				</div>
			</div>
			<section id="traffic" class="panel" aria-labelledby="traffic-title">
				<h2 id="traffic-title">Traffic classes and traffic impact</h2>
				<p class="lead">What is counted in the gallery numbers, what is left out, and which album places change because of it?</p>
				{#if view.traffic}
					<p>{view.traffic.summary}</p>
					<dl class="facts classes">{#each view.traffic.classes as item (item.id)}<div><dt>{item.label}<span class="tag">{item.counted ? 'counted' : 'left out'}</span></dt><dd>{item.count.toLocaleString()}</dd></div>{/each}</dl>
					<h3>Which album places change</h3>
					<p>{view.traffic.impact.scope}</p>
					{#if view.traffic.impact.changes}<p>{view.traffic.impact.changes}</p>{/if}
					{#if view.traffic.impact.changed.length}
						<ul class="moves" aria-label="Albums whose place changes">{#each view.traffic.impact.changed as row (row.albumKey)}<li><strong>{row.name}</strong><span>Place {row.rankChange}. {row.all.toLocaleString()} with all traffic, {row.counted.toLocaleString()} counted.</span></li>{/each}</ul>
					{/if}
					{#if view.traffic.impact.rows.length}
						<details>
							<summary>Show all {view.traffic.impact.rows.length.toLocaleString()} albums with their counts</summary>
								<ResponsiveTable label="Every album with at least one recorded photo open" headerLabel="Album" columns={[{ label: 'All traffic', numeric: true }, { label: 'Counted', numeric: true }, { label: 'Left out', numeric: true }, { label: 'Place, all traffic to counted' }]} rows={view.traffic.impact.rows.map((row) => ({ key: row.albumKey, title: row.name, values: [row.all.toLocaleString(), row.counted.toLocaleString(), row.left.toLocaleString(), row.rankChange] }))} />
						</details>
					{/if}
				{:else if view.reportDown}
					<p class="gap"><strong>Not shown.</strong> {view.reportDown.what} <span>{view.reportDown.todo}</span></p>
				{/if}
			</section>
			<div class="pair-cols">
				<div class="stack">
			<section id="arrivals" class="panel" aria-labelledby="arrivals-title">
				<h2 id="arrivals-title">Tagged arrivals and open locations</h2>
				<p class="lead">How visitors reached the gallery, and where in it they opened things.</p>
				{#if view.arrivals}
					<h3>Tagged arrivals</h3>
					{#if view.arrivals.tagged.length}
						<dl class="facts">{#each view.arrivals.tagged as item (item.source)}<div><dt>{item.source}</dt><dd>{item.count.toLocaleString()}</dd></div>{/each}</dl>
					{:else}<p>No tagged arrival was recorded in these dates.</p>{/if}
					<p class="detail">A tag shows how a link was shared. It does not prove that a later action was caused by that channel.</p>
					<h3>Open locations</h3>
					<p>{view.arrivals.open.sentence}</p>
					{#if view.arrivals.openLocations.length}
						<dl class="facts">{#each view.arrivals.openLocations as item (item.source)}<div><dt>{item.source}</dt><dd>{item.count.toLocaleString()}</dd></div>{/each}</dl>
					{:else}<p>No open location was recorded in these dates.</p>{/if}
					{#if view.arrivals.withoutSource}<p class="detail">Actions without a source: {view.arrivals.withoutSource.toLocaleString()}.</p>{/if}
					<h3>After a tagged arrival</h3>
					{#await data.journeys}
						<p class="detail" role="status">Loading what happened after a tagged arrival. The rest of this page is ready.</p>
					{:then loaded}
						{@const linked = loaded.available.find((item) => item.report === 'sources_return')}
						{#if linked && linked.breakdown.length}
							<p class="detail">For browsers that allowed linked analytics. A visit can appear under more than one tag, so these rows cannot be added together.</p>
								<ResponsiveTable label="What happened after a tagged arrival" headerLabel="Source tag" columns={[{ label: 'Arrival visits', numeric: true }, { label: 'Album opens', numeric: true }, { label: 'Photo opens', numeric: true }, { label: 'Download requests', numeric: true }, { label: 'Favorites', numeric: true }, { label: 'Returning browsers', numeric: true }]} rows={linked.breakdown.map((row) => ({ key: row.source, title: row.source, values: [row.tagged_arrival_visits, row.subsequent_album_open_visits, row.subsequent_photo_open_visits, row.subsequent_download_request_visits, row.subsequent_favorite_visits, row.before_window_returning_browsers].map((value) => String(value)) }))} />
							<p class="detail">Returning means seen before this period, within a 90-day look back. As of {asOfTime(linked.asOf)}. These are associations, not proof that a channel caused an action.</p>
						{:else if linked}<p>No tagged linked visits match these dates.</p>
						{:else}<p class="gap"><strong>Not shown.</strong> This comes from the linked-journey reports, which could not be read. <a href="#journeys">What that means and what to do</a>.</p>{/if}
					{/await}
				{:else if view.reportDown}
					<p class="gap"><strong>Not shown.</strong> {view.reportDown.what} <span>{view.reportDown.todo}</span></p>
				{/if}
			</section>
				</div>
				<div class="stack">
			<section id="site-measures" class="panel" aria-labelledby="site-title">
				<h2 id="site-title">Site measures</h2>
				<p class="lead">Two counts of the same site that are not expected to match, and what each can and cannot say.</p>
				<div class="pair">
					<div class="metric"><p class="label">Page loads on ninochavez.co (Cloudflare)</p>{#if view.site.cloudflare.value !== null}<p class="value">{view.site.cloudflare.value}</p>{/if}<p class="detail">{view.site.cloudflare.detail}</p></div>
					<div class="metric"><p class="label">Pages viewed, the site's own count</p>{#if view.site.firstParty.value !== null}<p class="value">{view.site.firstParty.value}</p>{/if}<p class="detail">{view.site.firstParty.detail}</p></div>
				</div>
				<p>{view.site.crossCheck}</p>
				<p class="detail">A dated check on September 28, 2026 could not establish that Cloudflare's page loads cover the gallery's album routes the same way for September 21–27. It is not a live connection to Cloudflare. {view.site.sampling}</p>
				{#if view.site.devices}
					<h3>Devices</h3>
					<p class="detail">{view.site.devicesNote}</p>
					<dl class="facts">{#each view.site.devices as item (item.name)}<div><dt>{item.name}</dt><dd>{item.pageLoads.toLocaleString()}</dd></div>{/each}</dl>
				{/if}
				<h3>Linked journeys on the site</h3>
				{#await data.siteJourneys}
					<p class="detail" role="status">Loading linked journeys. The rest of this page is ready.</p>
				{:then loaded}
					{#if !loaded.available}
						<p class="gap"><strong>Not shown.</strong> {siteJourneyNote(loaded.reason).what} <span>{siteJourneyNote(loaded.reason).todo}</span></p>
					{:else if loaded.rows.length}
						<p class="detail">Opted-in views only. These fractions show actions seen after a view within the same page view. They do not prove cause or describe all visitors.</p>
						<ul class="plain">{#each loaded.rows as row (row.section)}<li><strong>{row.section}</strong>: {row.contactViews} of {row.views} views had a contact-link click; {row.outboundViews} had an outbound click.{#if row.articleViews} {row.progressViews} of {row.articleViews} article views reached 90%; {row.activeViews} had 30 seconds on screen.{/if}{#if row.demoViews} {row.lastSectionViews} of {row.demoViews} demo views reached the last section.{/if}</li>{/each}</ul>
					{:else}<p>No eligible linked views match these dates. A collection or delivery gap can also cause this.</p>{/if}
				{:catch}
					<p class="gap"><strong>Not shown.</strong> {notReadNote('posthog').what} <span>{notReadNote('posthog').todo}</span></p>
				{/await}
			</section>
				</div>
			</div>
			<section id="journeys" class="panel" aria-labelledby="journeys-title">
				<h2 id="journeys-title">Linked journeys in the gallery</h2>
				<p class="lead">What visitors did in sequence, for the browsers that allowed linked analytics.</p>
				{#await data.journeys}
					<p class="detail" role="status">Loading the linked-journey reports. The rest of this page is ready.</p>
				{:then loaded}
					<p class="detail">These reports connect actions only for browsers that allowed linked analytics. Each report uses its own denominator, so its totals can differ from the counts above. They describe that group, not every visitor.</p>
					{#each loaded.available as journey (journey.report)}
						<details class="journey">
							<summary>{journeyName(journey.report)}</summary>
							<p class="detail">{journey.coverage.cohort}. Excludes {journey.coverage.excluded}. {journey.coverage.metadata}</p>
							<dl class="facts">{#each Object.entries(journey.totals) as [label, value] (label)}<div><dt>{journey.report === 'search_usefulness' && label === 'searches_shown' && journey.totals.zero_result_searches === null ? 'Search result sets with a matching selection' : label.replaceAll('_', ' ')}</dt><dd>{value === null ? 'Not available' : value.toLocaleString()}</dd></div>{/each}</dl>
							<p class="detail">As of {asOfTime(journey.asOf)} · {journey.coverage.start} to {journey.coverage.end} · definition version {journey.coverage.definitionVersion}</p>
						</details>
					{/each}
					{#if loaded.unavailable}<p class="gap"><strong>Not shown.</strong> {loaded.unavailable.what} <span>{loaded.unavailable.todo}</span></p>{/if}
				{/await}
			</section>
			<section id="corrections" class="panel" aria-labelledby="corrections-title">
				<h2 id="corrections-title">Correct how an action is classed</h2>
				{#if data.corrections}
					<ClassificationCorrections corrections={data.corrections} {form} pageHref={(pageNumber) => dataPath(hostname, `?period=${view.days}&event_page=${pageNumber}#corrections`)} />
				{:else}
					<p>When you are signed in you can give a counted action a different class, with a reason, and reverse it later. <a href={signInHref}>Sign in with a magic link</a> to see the actions and the corrections made so far.</p>
				{/if}
			</section>
		</div>

		<p class="note">Counts are browser actions, not people. Gallery numbers cover complete days in Chicago time through {through}. Page loads are Cloudflare's count of UTC days, a different measure from photo opens.</p>
	</div>
</div>

<style>
	.data { --ink: #172033; --muted: #526176; --line: #d8e0ea; --blue: #1458c4; --blue-ink: #174ea6; --warn: #9a4a00; background: #edf2f7; color: var(--ink); margin-inline: auto; min-height: 100dvh; max-width: 96rem; min-width: 0; overflow-x: clip; padding: .5rem 1rem 3rem; }
	@media (min-width: 640px) { .data { padding: 1rem 1.5rem 2.5rem; } }
	@media (min-width: 1024px) { .data { padding-inline: 2rem; } }
	a:focus-visible, summary:focus-visible { outline: 3px solid var(--blue-ink); outline-offset: 2px; }
	.body { display: grid; gap: .9rem; min-width: 0; }
	.intro { min-width: 0; scroll-margin-top: .5rem; }
	.eyebrow { color: var(--blue-ink); font-size: .75rem; font-weight: 800; letter-spacing: .09em; margin: 0; text-transform: uppercase; }
	.trouble .eyebrow { color: var(--warn); }
	h1 { font-size: 1.2rem; font-weight: 700; letter-spacing: -.01em; line-height: 1.28; margin: .3rem 0 .4rem; max-width: 52rem; }
	@media (min-width: 640px) { h1 { font-size: 1.4rem; } }
	@media (min-width: 1024px) { h1 { font-size: 1.6rem; max-width: 70rem; } }
	h2 { font-size: 1.02rem; font-weight: 700; margin: 0; }
	h3 { font-size: .92rem; font-weight: 700; margin: .9rem 0 .15rem; }
	.detail { color: var(--muted); font-size: .88rem; line-height: 1.5; margin: .2rem 0 0; max-width: 62rem; }
	.lead { color: var(--muted); font-size: .85rem; margin: .1rem 0 .5rem; }

	.issues { background: #fff; border: 1px solid var(--line); border-left: 4px solid var(--warn); border-radius: .8rem; list-style: none; margin: .6rem 0 0; max-width: 62rem; padding: .3rem .9rem; }
	.issues.quiet { border-left-color: var(--blue-ink); }
	.issues li { align-items: baseline; border-top: 1px solid #e6ecf3; display: flex; flex-wrap: wrap; font-size: .92rem; gap: .1rem .9rem; justify-content: space-between; line-height: 1.4; padding: .5rem 0; }
	.issues li:first-child { border-top: 0; }
	.issues a { align-items: center; color: var(--blue-ink); display: inline-flex; font-weight: 650; min-height: 2.75rem; text-underline-offset: 3px; }
	.period { align-items: center; display: flex; flex-wrap: wrap; gap: .25rem .6rem; margin-top: .6rem; }
	.label { color: var(--muted); font-size: .8rem; font-weight: 650; margin: 0; }
	.chips { display: flex; flex-wrap: wrap; gap: .3rem; }
	.choice { align-items: center; background: #fff; border: 1px solid #b9c7da; border-radius: .5rem; color: var(--blue-ink); display: inline-flex; font-size: .85rem; font-weight: 650; min-height: 2.75rem; padding: 0 .75rem; text-decoration: none; }
	.choice[aria-current='true'] { background: #dce9fa; border-color: var(--blue-ink); box-shadow: inset 0 -3px 0 var(--blue-ink); }

	.grid { display: grid; gap: .9rem; min-width: 0; }
	.pair-cols { display: grid; gap: .9rem; min-width: 0; }
	.stack { align-content: start; display: grid; gap: .9rem; min-width: 0; }
	@media (min-width: 1024px) { .pair-cols { align-items: start; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
	.panel { background: #fff; border: 1px solid var(--line); border-radius: .8rem; min-width: 0; padding: .8rem .9rem; scroll-margin-top: .5rem; }
	.panel > p { font-size: .92rem; line-height: 1.5; margin: .35rem 0 0; max-width: 62rem; }
	.panel > p.detail { font-size: .85rem; }
	.panel a { color: var(--blue-ink); text-decoration: underline; text-underline-offset: 3px; }
	.gap { background: #eef4fc; border-radius: .5rem; padding: .55rem .7rem; }
	.gap span { display: block; margin-top: .15rem; }
	.alert { color: var(--warn); }
	.facts { margin: .4rem 0 0; }
	.facts div { align-items: baseline; border-top: 1px solid #e6ecf3; display: flex; flex-wrap: wrap; font-size: .9rem; gap: .1rem .8rem; justify-content: space-between; padding: .4rem 0; }
	.facts div:first-child { border-top: 0; }
	.facts dt { color: var(--ink); min-width: 0; overflow-wrap: anywhere; }
	.facts dd { font-variant-numeric: tabular-nums; font-weight: 650; margin: 0; overflow-wrap: anywhere; text-align: right; }
	.tag { background: #eef2f7; border-radius: .3rem; color: var(--muted); font-size: .72rem; font-weight: 650; margin-left: .5rem; padding: .05rem .4rem; }
	.pair { display: grid; gap: .6rem; margin-top: .3rem; }
	@media (min-width: 700px) { .pair { grid-template-columns: 1fr 1fr; } }
	.metric { border: 1px solid #e6ecf3; border-radius: .6rem; min-width: 0; padding: .6rem .75rem; }
	.metric p { margin: .15rem 0 0; }
	.value { font-size: 1.5rem; font-variant-numeric: tabular-nums; font-weight: 750; line-height: 1.1; }
	.plain { font-size: .9rem; line-height: 1.5; margin: .4rem 0 0; padding-left: 1.1rem; }
	details { font-size: .9rem; margin-top: .5rem; }
	summary { align-items: center; color: var(--blue-ink); cursor: pointer; display: flex; font-weight: 650; min-height: 2.75rem; }
	.journey { border-top: 1px solid #e6ecf3; margin-top: 0; }
	.terms { margin: .3rem 0 0; }
	.terms div { border-top: 1px solid #e6ecf3; display: grid; gap: .1rem; padding: .35rem 0; }
	.terms div:first-child { border-top: 0; }
	.terms dt { font-size: .85rem; font-weight: 650; }
	.terms dd { color: var(--muted); font-size: .85rem; line-height: 1.45; margin: 0; }
	.moves { list-style: none; margin: .4rem 0 0; padding: 0; }
	.moves li { border-top: 1px solid #e6ecf3; display: grid; gap: .1rem; padding: .5rem 0; }
	.moves li:first-child { border-top: 0; }
	.moves span { color: var(--muted); font-size: .88rem; }
	.note { color: var(--muted); font-size: .82rem; line-height: 1.5; margin: .2rem 0 0; max-width: 62rem; }
	.sr-only { clip: rect(0 0 0 0); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
	@media (forced-colors: active) { .panel, .issues, .choice, .metric { border: 1px solid CanvasText; } }
	@media (prefers-contrast: more) { .data { --muted: #36445a; --line: #5c6b80; } .detail, .lead, .note, .label { color: #2b3748; } }
</style>
