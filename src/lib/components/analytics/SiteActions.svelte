<script lang="ts">
	import { page } from '$app/state';
	import { dataPath, photosPath, sitePath } from '$lib/analytics/report-paths';
	import { SITE_ACTION_METRICS, type SiteActionReport } from '$lib/analytics/site-actions';

	/**
	 * What visitors did on each page: link clicks and article and demo progress. The count of pages
	 * viewed is a second measure with its own window, so it lives on the data quality page.
	 */
	let { report, period, section, currentPage }: { report: SiteActionReport | null; period: number; section: string; currentPage: number } = $props();

	const SHOWN = ['contact_clicks', 'external_clicks', 'reading_90', 'active_30', 'demo_last_section'] as const;
	const PROGRESS = ['reading_90', 'active_30', 'demo_last_section'];
	const metrics = $derived(SITE_ACTION_METRICS.filter((metric) => (SHOWN as readonly string[]).includes(metric.key)
		&& (section === 'all' || !PROGRESS.includes(metric.key) || (section === 'writing' && ['reading_90', 'active_30'].includes(metric.key)) || (section === 'demos' && metric.key === 'demo_last_section'))));
	const hasHistory = $derived(report !== null && report.available && !!report.firstRecordedAt && report.firstRecordedAt.slice(0, 10) <= report.end);
	function applicable(key: string, scope: string) {
		return !PROGRESS.includes(key) || (scope === 'writing' && ['reading_90', 'active_30'].includes(key)) || (scope === 'demos' && key === 'demo_last_section');
	}
	function href(pageIndex: number) {
		return `${sitePath(page.url.hostname)}?period=${period}&section=${section}&actionsPage=${pageIndex}#actions`;
	}
	const since = $derived(report !== null && report.available && report.firstRecordedAt ? new Date(report.firstRecordedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null);
</script>

<section class="actions" id="actions" aria-labelledby="actions-title">
	<h2 id="actions-title">What visitors did on each page</h2>
	{#if report === null}
		<p class="note" role="status">Page actions could not be read. This is not a report of zero. Reload in a few minutes; the numbers above do not depend on it.</p>
	{:else if !report.available}
		<p class="note" role="status">{report.reason} This is not a report of zero. Reload in a few minutes; the numbers above do not depend on it.</p>
	{:else if section === 'other'}
		<p class="note">Other pages are measured only as page loads. Page actions cover the profile, writing, demo and photography landing pages.</p>
	{:else if section === 'photography'}
		<p class="note">Only the photography landing and coverage pages are covered here. Album and photo opens, favorites, shares and downloads are in each album's report and in <a href={photosPath(page.url.hostname)}>the photo explorer</a>, and launches are on Home and Albums.</p>
	{:else}
		<p class="note">Operator, test, bot and excluded-browser activity is left out. These are counts of actions, not people. {#if since}Counting began {since}; earlier days have no action history.{:else}Nothing has been counted yet, and earlier traffic cannot fill that in.{/if}</p>
		{#if !hasHistory}
			<p class="empty" role="status">No page actions have been counted for these dates. This is not zero: counting had not started.</p>
		{:else}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -- a sideways-scrolling table must take keyboard focus so it can be scrolled without a mouse (WCAG 2.1.1) -->
			<div class="table-box" tabindex="0" role="region" aria-label="Actions by page. Scroll sideways for every column.">
				<table>
					<caption>Most viewed pages first</caption>
					<thead><tr><th scope="col">Page</th>{#each metrics as metric (metric.key)}<th scope="col" title={metric.help}>{metric.label}</th>{/each}</tr></thead>
					<tbody>
						{#each report.pages as row (row.path)}
							<tr><th scope="row"><a href={`https://ninochavez.co${row.path}`} target="_blank" rel="noopener noreferrer">{row.path}<span class="sr-only"> (opens the page on ninochavez.co in a new tab)</span></a></th>{#each metrics as metric (metric.key)}<td>{applicable(metric.key, row.section) ? (row.measures[metric.key] ?? 0).toLocaleString() : '—'}</td>{/each}</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if report.pages.length === 0}<p class="note">No page actions match these dates and section.</p>{/if}
			{#if report.pageCount > 1}
				<nav class="pager" aria-label="Pages of actions">
					<span>Page {report.page + 1} of {report.pageCount}</span>
					<span class="pager-links">{#if report.page > 0}<a href={href(report.page - 1)}>Previous</a>{/if}{#if report.page + 1 < report.pageCount}<a href={href(report.page + 1)}>Next</a>{/if}</span>
				</nav>
			{/if}
			<p class="note">Reading progress and demo chapters are in the columns that apply to writing and demo pages. Each column's meaning is on <a href={dataPath(page.url.hostname, '#site-measures')}>the data page</a>.</p>
		{/if}
	{/if}
</section>

<style>
	.actions { background: #fff; border: 1px solid var(--line, #d8e0ea); border-radius: .8rem; color: var(--ink, #172033); min-width: 0; padding: .8rem .9rem; }
	h2 { font-size: 1.02rem; font-weight: 700; margin: 0; }
	.note { color: var(--muted, #526176); font-size: .85rem; line-height: 1.5; margin: .35rem 0 0; max-width: 62rem; }
	.note a, th a { color: var(--blue-ink, #174ea6); text-underline-offset: 3px; }
	th a { align-items: center; display: flex; min-height: 2.75rem; min-width: 2.75rem; }
	.empty { background: #eef4fc; border-radius: .5rem; font-size: .9rem; line-height: 1.45; margin: .6rem 0 0; padding: .6rem .75rem; }
	.table-box { margin-top: .6rem; max-width: 100%; overflow-x: auto; }
	.table-box:focus-visible { outline: 3px solid var(--blue-ink, #174ea6); outline-offset: 2px; }
	table { border-collapse: collapse; font-size: .85rem; min-width: 36rem; width: 100%; }
	caption { color: var(--muted, #526176); font-size: .8rem; padding-bottom: .35rem; text-align: left; }
	th, td { border-bottom: 1px solid #e6ecf3; padding: .5rem .6rem; }
	thead th { font-weight: 650; text-align: right; vertical-align: bottom; }
	thead th:first-child, tbody th { text-align: left; }
	tbody th { font-weight: 500; max-width: 22rem; overflow-wrap: anywhere; }
	td { font-variant-numeric: tabular-nums; text-align: right; }
	.pager { align-items: center; display: flex; flex-wrap: wrap; font-size: .85rem; gap: .5rem 1rem; justify-content: space-between; margin-top: .6rem; }
	.pager-links { display: flex; gap: .4rem; }
	.pager-links a { align-items: center; border: 1px solid #b9c7da; border-radius: .5rem; color: var(--blue-ink, #174ea6); display: inline-flex; font-weight: 650; min-height: 2.75rem; padding: 0 .8rem; text-decoration: none; }
	a:focus-visible { outline: 3px solid var(--blue-ink, #174ea6); outline-offset: 2px; }
	.sr-only { clip: rect(0 0 0 0); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
	@media (prefers-contrast: more) { .note, caption { color: #2b3748; } }
</style>
