<script lang="ts">
	import SiteActions from '$lib/components/analytics/SiteActions.svelte';
	import IntelligenceWorkspace from '$lib/components/analytics/IntelligenceWorkspace.svelte';
	import { page } from '$app/state';
 import { reportPath } from '$lib/analytics/report-paths';
	import { SITE_SECTIONS } from '$lib/analytics/site-traffic';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const report = $derived(data.report);
	const intelligenceOwner = $derived('intelligenceOwner' in data && data.intelligenceOwner === true);
	const selected = $derived(report.available && data.section !== 'all'
		? report.sections.find((section) => section.key === data.section) : null);
	const pages = $derived(report.available ? selected?.topPages ?? report.topPages : []);
	const pageCount = $derived(Math.max(1, Math.ceil(pages.length / 8)));
	const currentPage = $derived(Math.min(data.page, pageCount - 1));
	const visiblePages = $derived(pages.slice(currentPage * 8, (currentPage + 1) * 8));
	const trendDays = $derived(report.available ? selected?.daily ?? report.daily : []);
	const largestDay = $derived(Math.max(1, ...trendDays.map((day) => day.pageviews)));
	const chartPoints = $derived(trendDays.map((day, index) =>
		`${(index / Math.max(1, trendDays.length - 1)) * 100},${100 - (day.pageviews / largestDay) * 88}`
	).join(' '));
	const visibleReferrers = $derived(report.available
		? (selected?.referrers ?? report.referrers).filter((item) => item.entryVisits > 0 && item.host !== 'ninochavez.co').slice(0, 6) : []);
	const visibleDevices = $derived(report.available ? selected?.devices ?? report.devices : []);

	function reportHref(period: number, section: string, pageIndex = 0) {
		const params = new URLSearchParams({ period: String(period), view: data.view });
		if (section !== 'all') params.set('section', section);
		if (pageIndex > 0) params.set('page', String(pageIndex));
		return `${reportPath(page.url.hostname, 'sites')}?${params}`;
	}
	function pageLabel(path: string) {
		if (path === '/') return 'Home';
		try {
			return decodeURIComponent(path).split('/').filter(Boolean).map((part) => part.replaceAll('-', ' ')).join(' / ');
		} catch { return path; }
	}
	function changeLabel(current: number, previous: number | null) {
		if (previous === null) return 'Previous period unavailable';
		if (previous === 0) return current > 0 ? 'New activity' : 'No change';
		const percent = Math.round(((current - previous) / previous) * 100);
		return `${percent > 0 ? '+' : ''}${percent}% vs previous ${data.period} days`;
	}
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow, noarchive" />
</svelte:head>

<div class="site-report">
	{#if data.localReview}<p class="measurement-note">Local review — synthetic data. These counts are invented; do not quote them as site traffic.</p>{/if}
	<header class="masthead">
		<div class="identity"><span class="mark">NC</span><span>Nino Chavez <span class="slash">/</span> Reports</span></div>
		<a class="gallery-link" href="https://ninochavez.co/">View site ↗</a>
	</header>
	<div class="opening">
		<div>
			<p class="eyebrow">Across ninochavez.co</p>
			<h1>Site analytics</h1>
			<p class="subtitle">Find which work people reach, then inspect a section.</p>
		</div>
		<p class="availability">Available by direct link</p>
	</div>
	<nav class="workspace-nav" aria-label="Report workspaces">
		<a aria-current="page" href={`${reportPath(page.url.hostname, 'sites')}`}>Sites</a>
		<a href={`${reportPath(page.url.hostname, 'gallery')}`}>Gallery report</a>
	</nav>
	<div class="controls" aria-label="Traffic filters">
		<div class="control-group"><span class="control-label">Period</span><div class="segmented" aria-label="Reporting period">
			{#each [7, 30, 90] as period}
				<a class:active={data.period === period} aria-current={data.period === period ? 'true' : undefined} href={reportHref(period, data.section)}>{period} days</a>
			{/each}
		</div></div>
		<div class="control-group section-control"><span class="control-label">Section</span><div class="section-options">
			<a class:active={data.section === 'all'} href={reportHref(data.period, 'all')}>All sections</a>
			{#each SITE_SECTIONS as section}
				<a class:active={data.section === section.key} href={reportHref(data.period, section.key)}>{section.label}</a>
			{/each}
		</div></div>
	</div>

	<nav class="workspace-nav" aria-label="Measurement type"><a aria-current={data.view === 'reach' ? 'page' : undefined} href={`${reportPath(page.url.hostname, 'sites')}?period=${data.period}&section=${data.section}&view=reach`}>Reach</a><a aria-current={data.view === 'actions' ? 'page' : undefined} href={`${reportPath(page.url.hostname, 'sites')}?period=${data.period}&section=${data.section}&view=actions`}>Actions</a></nav>
	{#if data.view === 'actions' && data.actions}<SiteActions report={data.actions} period={data.period} section={data.section} currentPage={data.actionsPage} journeys={data.journeys} />
	{:else if !report.available}
		<section class="unavailable" role="status"><h2>Traffic report unavailable</h2><p>{report.reason}</p><p>The gallery report remains available.</p></section>
	{:else}
		<div class="report-meta"><span>Cloudflare Web Analytics · bot-filtered page loads</span><span>{report.start} to {report.end} · complete UTC days</span></div>
		<div class="headline-grid">
			<section class="primary-stat" aria-label="Page loads"><span>Page loads</span><strong>{(selected?.pageviews ?? report.pageviews).toLocaleString()}</strong><small>{selected ? `${selected.label} in this period` : changeLabel(report.pageviews, report.previousPageviews)}</small></section>
			<section class="primary-stat" aria-label="Entry visits"><span>Entry visits</span><strong>{(selected?.entryVisits ?? report.entryVisits).toLocaleString()}</strong><small>{selected ? 'From outside this site or direct links' : changeLabel(report.entryVisits, report.previousEntryVisits)}</small></section>
			<section class="trend-card" aria-labelledby="trend-heading"><div class="card-heading"><h2 id="trend-heading">Daily page loads</h2><span>{trendDays.length} days</span></div>
				<svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Daily page loads trend"><polyline points={chartPoints} fill="none" stroke="currentColor" stroke-width="2.25" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" /></svg>
				<details><summary>Read daily values</summary><div class="daily-values">{#each trendDays as day}<span>{day.date}</span><strong>{day.pageviews.toLocaleString()}</strong>{/each}</div></details>
			</section>
		</div>
		<p class="measurement-note">A page load is a browser measurement, not a person. Entry visits are page loads reached from another site or a direct link. Your own and agent-assisted visits can be included. These counts do not measure reading, clicks, or completed requests.</p>
		<IntelligenceWorkspace kind="sites" scope={{ kind: 'sites', period: data.period, section: data.section }} owner={intelligenceOwner} />

		{#if data.section === 'all'}
			<section class="section-breakdown" aria-labelledby="section-heading"><div class="section-title"><div><p class="eyebrow">Compare</p><h2 id="section-heading">Where attention went</h2></div><p>Same dates and measure across sections</p></div>
				<div class="section-cards">{#each report.sections as section}
					<a href={reportHref(data.period, section.key)}><span class="section-name">{section.label}</span><strong>{section.pageviews.toLocaleString()}</strong><span>{section.entryVisits.toLocaleString()} entry visits</span></a>
				{/each}</div>
			</section>
		{/if}

		<div class="detail-grid">
			<section class="panel" aria-labelledby="pages-heading"><div class="card-heading"><div><p class="eyebrow">Explore</p><h2 id="pages-heading">{selected ? `${selected.label} pages` : 'Pages drawing attention'}</h2></div><span>Page loads</span></div>
				{#if pages.length}<ol class="ranked-pages">{#each visiblePages as page, index}<li><span class="rank">{currentPage * 8 + index + 1}</span><a href={`https://ninochavez.co${page.path}`} target="_blank" rel="noopener noreferrer"><strong>{pageLabel(page.path)}</strong><small>{page.path}</small></a><strong class="count">{page.pageviews.toLocaleString()}</strong></li>{/each}</ol>{:else}<p class="empty">No measured page loads in this section for these dates.</p>{/if}
				{#if pageCount > 1}<nav class="page-nav" aria-label="Pages list pagination"><span>Page {currentPage + 1} of {pageCount}</span><div>{#if currentPage > 0}<a href={reportHref(data.period, data.section, currentPage - 1)}>Previous</a>{/if}{#if currentPage < pageCount - 1}<a href={reportHref(data.period, data.section, currentPage + 1)}>Next</a>{/if}</div></nav>{/if}
			</section>
			<div class="side-panels">
				<section class="panel" aria-labelledby="sources-heading"><div class="card-heading"><div><p class="eyebrow">Arrival</p><h2 id="sources-heading">Entry sources</h2></div><span>Entry visits</span></div>
					{#if visibleReferrers.length}<dl class="compact-list">{#each visibleReferrers as source}<div><dt>{source.host}</dt><dd>{source.entryVisits.toLocaleString()}</dd></div>{/each}</dl>{:else}<p class="empty">No referral source was reported for this period.</p>{/if}
				</section>
				<section class="panel" aria-labelledby="devices-heading"><div class="card-heading"><div><p class="eyebrow">Experience</p><h2 id="devices-heading">Devices</h2></div><span>Page loads</span></div>
					<dl class="compact-list">{#each visibleDevices as device}<div><dt>{device.name}</dt><dd>{device.pageviews.toLocaleString()}</dd></div>{/each}</dl>
				</section>
			</div>
		</div>
		<section class="handoff"><div><p class="eyebrow">More specific evidence</p><h2>What happened inside the gallery?</h2><p>Open the gallery report for album opens, photo opens, favorites, downloads, and shares. Those events have different definitions from these page loads.</p></div><a href={`${reportPath(page.url.hostname, 'gallery')}`}>Open gallery report →</a></section>
		<p class="footnote">Measured at {new Date(report.measuredAt).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })} CDT. Cloudflare adapts sampling to the query, so totals may be estimates and may differ from the gallery report. Profile, writing, and demos are sections of one site; separate business properties are not included.</p>
	{/if}
</div>

<style>
	.site-report{max-width:92rem;margin:auto;padding:1.5rem 2rem 4rem;color:#172238;font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-size:14px}
	.masthead,.opening,.workspace-nav,.controls,.report-meta,.section-title,.card-heading,.headline-grid,.detail-grid,.handoff{display:flex;justify-content:space-between;align-items:center;gap:1rem}
	.masthead{min-height:2.5rem}.identity{display:flex;align-items:center;gap:.65rem;font-weight:700}.mark{display:grid;place-items:center;width:2rem;height:2rem;border-radius:.4rem;background:#1b54ab;color:white;font-size:.7rem}.slash{color:#95a3b9;padding:0 .2rem}.gallery-link{border:1px solid #bac8dc;border-radius:.45rem;padding:.65rem .8rem;color:#1851a7;font-weight:650;text-decoration:none}
	.opening{margin-top:1.2rem;align-items:end}.eyebrow{color:#285eaf;text-transform:uppercase;letter-spacing:.16em;font-size:.67rem;font-weight:800;margin:0 0 .5rem}h1,h2,p{margin-top:0}h1{font-size:2rem;letter-spacing:-.04em;line-height:1.1;margin-bottom:.35rem}h2{font-size:1.15rem;letter-spacing:-.015em;margin:0}.subtitle{color:#607087;margin:0}.availability{color:#62718a;font-size:.78rem;margin:0}
	.workspace-nav{justify-content:start;gap:.25rem;margin-top:1rem;padding:.35rem 0;border-top:1px solid #d5dfeb;border-bottom:1px solid #d5dfeb}.workspace-nav a{padding:.7rem .9rem;border-radius:.4rem;color:#394960;text-decoration:none}.workspace-nav a[aria-current=page]{background:#dbe9fb;color:#1450a4;font-weight:700}
	.controls{justify-content:start;align-items:end;flex-wrap:wrap;background:#fff;border:1px solid #d6e0eb;border-radius:.8rem;padding:1rem;margin-top:.8rem}.control-group{display:grid;gap:.45rem}.control-label{font-size:.73rem;color:#5b6a80;font-weight:650}.segmented,.section-options{display:flex;gap:.25rem;flex-wrap:wrap}.segmented a,.section-options a{padding:.6rem .8rem;border:1px solid #d3deeb;border-radius:.4rem;color:#445268;text-decoration:none}.segmented a.active,.section-options a.active{background:#e2efff;border-color:#9fc2f3;color:#1450a4;font-weight:700}.section-control{min-width:0}
	.report-meta{font-size:.77rem;color:#64758c;margin:1.1rem 0 .7rem;flex-wrap:wrap}.headline-grid{align-items:stretch;display:grid;grid-template-columns:minmax(10rem,.7fr) minmax(10rem,.7fr) minmax(20rem,1.6fr);gap:.75rem}.primary-stat,.trend-card,.panel,.handoff,.unavailable{background:#fff;border:1px solid #d6e0eb;border-radius:.8rem;padding:1.1rem}.primary-stat{display:flex;flex-direction:column}.primary-stat span,.card-heading span{color:#66758a;font-size:.78rem}.primary-stat strong{font-size:2.35rem;color:#174fa4;line-height:1.2;margin:.5rem 0}.primary-stat small{color:#55657a}.trend-card svg{width:100%;height:5rem;color:#2469d1;margin:.6rem 0}.trend-card details,.measurement-note,.footnote{color:#586980;font-size:.78rem}.trend-card summary{cursor:pointer;color:#1a58b0}.daily-values{display:grid;grid-template-columns:1fr auto;gap:.3rem .7rem;max-height:12rem;overflow:auto;padding:.7rem 0}.measurement-note{max-width:65rem;line-height:1.55;margin:1rem 0 1.8rem}
	.section-breakdown{margin-bottom:1.6rem}.section-title{align-items:end;margin-bottom:.7rem}.section-title p:last-child{color:#718096;font-size:.78rem;margin:0}.section-cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.65rem}.section-cards a{display:flex;flex-direction:column;gap:.45rem;background:#fff;border:1px solid #d6e0eb;border-radius:.7rem;padding:1rem;text-decoration:none;color:#56677e}.section-cards a:hover,.section-cards a:focus-visible,.ranked-pages a:hover{border-color:#6195df;color:#1353ad}.section-cards strong{font-size:1.6rem;color:#192943}.section-name{font-weight:700;color:#24364f}
	.detail-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(18rem,.8fr);align-items:start;gap:.8rem}.card-heading{align-items:end;padding-bottom:.7rem;border-bottom:1px solid #e0e7f1}.ranked-pages{list-style:none;padding:0;margin:0}.ranked-pages li{display:grid;grid-template-columns:1.4rem minmax(0,1fr) auto;align-items:center;gap:.8rem;padding:.65rem 0;border-bottom:1px solid #e4eaf2}.ranked-pages li:last-child{border:0}.rank{color:#7b899a}.ranked-pages a{display:flex;flex-direction:column;gap:.12rem;min-width:0;color:#24334a;text-decoration:none;text-transform:capitalize}.ranked-pages a strong,.ranked-pages a small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ranked-pages a small{color:#79879a;font-size:.7rem;text-transform:none}.count{color:#1f5db8;font-variant-numeric:tabular-nums}.side-panels{display:grid;gap:.8rem;width:100%}.compact-list{margin:.1rem 0 0}.compact-list div{display:flex;justify-content:space-between;gap:1rem;padding:.55rem 0;border-bottom:1px solid #e4eaf2}.compact-list div:last-child{border:0}.compact-list dt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#4b5a70}.compact-list dd{margin:0;font-variant-numeric:tabular-nums;font-weight:700;color:#1c57ad}.empty{color:#64758c;margin:1rem 0 0}.handoff{align-items:center;margin-top:1rem;background:#e9f2ff}.handoff h2{margin-bottom:.45rem}.handoff p:not(.eyebrow){color:#57677e;max-width:52rem;margin:0}.handoff a{white-space:nowrap;border-radius:.4rem;background:#1955b3;color:white;text-decoration:none;padding:.8rem 1rem;font-weight:700}.footnote{line-height:1.5;margin:1rem 0}.unavailable{margin-top:1rem}.unavailable p{color:#596a80}
	@media(max-width:900px){.headline-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.trend-card{grid-column:1/-1}.section-cards{grid-template-columns:repeat(3,minmax(0,1fr))}.detail-grid{grid-template-columns:1fr}.side-panels{grid-template-columns:repeat(2,minmax(0,1fr))}}
	.page-nav{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-top:.6rem;padding-top:.8rem;border-top:1px solid #e0e7f1;color:#64758c;font-size:.8rem}.page-nav div{display:flex;gap:.4rem}.page-nav a{border:1px solid #bac8dc;border-radius:.4rem;padding:.45rem .65rem;color:#1851a7;text-decoration:none;font-weight:650}
	@media(max-width:600px){.site-report{padding:1rem 1rem 3rem}.opening{align-items:start}.availability{display:none}.headline-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.primary-stat strong{font-size:1.8rem}.section-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.side-panels{grid-template-columns:1fr}.handoff{align-items:start;flex-direction:column}.controls{align-items:start}.section-title p:last-child{display:none}.gallery-link{font-size:.75rem}.site-report h1{font-size:1.65rem}}
</style>
