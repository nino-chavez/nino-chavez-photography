<script lang="ts">
	import { page } from '$app/state';
	import { dataPath, photosPath, sitePath } from '$lib/analytics/report-paths';
	import { SITE_ACTION_METRICS, type SiteActionReport } from '$lib/analytics/site-actions';
	import ResponsiveTable from '$lib/components/analytics/ResponsiveTable.svelte';

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
			<ResponsiveTable label="Actions by page, most viewed first" headerLabel="Page" columns={metrics.map((metric) => ({ label: metric.label, numeric: true, help: metric.help }))}
				rows={report.pages.map((row) => ({ key: row.path, title: row.path, href: `https://ninochavez.co${row.path}`, newTab: true, values: metrics.map((metric) => (applicable(metric.key, row.section) ? (row.measures[metric.key] ?? 0).toLocaleString() : '—')) }))} />
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
	.note a { color: var(--blue-ink, #174ea6); text-decoration: underline; text-underline-offset: 3px; }
	.empty { background: #eef4fc; border-radius: .5rem; font-size: .9rem; line-height: 1.45; margin: .6rem 0 0; padding: .6rem .75rem; }
	.pager { align-items: center; display: flex; flex-wrap: wrap; font-size: .85rem; gap: .5rem 1rem; justify-content: space-between; margin-top: .6rem; }
	.pager-links { display: flex; gap: .4rem; }
	.pager-links a { align-items: center; border: 1px solid #b9c7da; border-radius: .5rem; color: var(--blue-ink, #174ea6); display: inline-flex; font-weight: 650; min-height: 2.75rem; padding: 0 .8rem; text-decoration: none; }
	a:focus-visible { outline: 3px solid var(--blue-ink, #174ea6); outline-offset: 2px; }
	@media (prefers-contrast: more) { .note { color: #2b3748; } }
</style>
