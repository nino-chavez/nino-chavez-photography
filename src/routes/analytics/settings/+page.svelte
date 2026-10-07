<script lang="ts">
	import { enhance } from '$app/forms';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { reportPath } from '$lib/analytics/report-paths';
	import { describeSavedView, MEASURE_WORDS, SAVED_VIEW_NAME_MAX, SAVED_VIEW_PERIODS, savedViewParams } from '$lib/analytics/saved-views';
	import AnalyticsPreferences from '$lib/components/analytics/AnalyticsPreferences.svelte';
	import PrivateIntelligenceControls from '$lib/components/analytics/PrivateIntelligenceControls.svelte';
	import ReportHeader from '$lib/components/analytics/ReportHeader.svelte';
	import ReportingSettings from '$lib/components/analytics/ReportingSettings.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const hostname = $derived(page.url.hostname);
	const signInHref = $derived(`${base}/login?next=${encodeURIComponent('/analytics/settings')}`);
	function openHref(query: unknown): string | null {
		const params = savedViewParams(query);
		if (!params) return null;
		params.set('section', 'overview');
		return reportPath(hostname, 'gallery', `?${params}`);
	}
	const updated = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }).format(new Date(value));
</script>

<svelte:head>
	<title>Settings · Photography reports</title>
	<meta name="robots" content="noindex, nofollow, noarchive" />
</svelte:head>

<div class="settings">
	<ReportHeader current="settings" />

	<div class="body">
		<section class="intro" aria-labelledby="settings-title">
			<p class="eyebrow">Settings</p>
			<h1 id="settings-title">Your analytics choices, private reports and saved views.</h1>
		</section>

		<div class="grid">
			<div class="column">
				<section class="block" aria-labelledby="browser-title">
					<h2 id="browser-title">This browser</h2>
					<p class="note">Whether this browser is counted when you look at your own site. Visitors set the same choices for themselves on <a href="https://ninochavez.co/photography/analytics-preferences" target="_blank" rel="noopener noreferrer">the public analytics preferences page<span class="sr-only"> (opens in a new tab)</span></a>, which this page does not change.</p>
					<AnalyticsPreferences />
				</section>

				{#if data.owner}
					<section class="block" aria-labelledby="private-title">
						<h2 id="private-title">Private reports</h2>
						<p class="note">A launch recap is the day 3 and day 7 summary of each new album. These settings say how long private records are kept and whether recaps are emailed.</p>
						<ReportingSettings owner={true} id="settings" />
						<PrivateIntelligenceControls owner={true} actions={[]} />
					</section>
				{/if}
			</div>

			<div class="column">
				{#if data.owner}
					<section class="block" aria-labelledby="views-title">
						<h2 id="views-title">Saved views</h2>
						<p class="note">A saved view keeps filters, not numbers: it opens the gallery report with the same dates, measure and albums, and the numbers are read fresh.</p>
						{#if !data.savedViewsAvailable}
							<p class="alert" role="alert">Your saved views could not be read. They are not gone; reload in a few minutes.</p>
						{:else if data.savedViews.length === 0}
							<p class="note">You have no saved views yet.</p>
						{:else}
							<ul class="views">
								{#each data.savedViews as view (view.id)}
									<li>
										<div class="view-head">
											{#if openHref(view.query)}<a class="view-name" href={openHref(view.query)}>{view.name}<span class="sr-only"> (opens the gallery report with these filters)</span></a>{:else}<span class="view-name">{view.name}</span>{/if}
											<span class="view-meta">Updated {updated(view.updated_at)}</span>
										</div>
										<p class="view-filters">{describeSavedView(view.query)}</p>
										<div class="view-actions">
											<form method="POST" action="?/renameView" use:enhance>
												<input type="hidden" name="id" value={view.id} />
												<label class="entry"><span>Rename</span><input name="name" maxlength={SAVED_VIEW_NAME_MAX} required value={view.name} /></label>
												<button type="submit">Rename<span class="sr-only"> {view.name}</span></button>
											</form>
											<form method="POST" action="?/deleteView" use:enhance>
												<input type="hidden" name="id" value={view.id} />
												<button type="submit" class="danger">Delete<span class="sr-only"> {view.name}</span></button>
											</form>
										</div>
									</li>
								{/each}
							</ul>
						{/if}
						{#if form?.renameError}<p class="alert" role="alert">{form.renameError}</p>{/if}
						{#if form?.deleteError}<p class="alert" role="alert">{form.deleteError}</p>{/if}
						{#if form?.renamed}<p class="ok" role="status">Renamed.</p>{/if}
						{#if form?.deleted}<p class="ok" role="status">Deleted. The filters are gone; the gallery's numbers are not affected.</p>{/if}

						<form class="save" method="POST" action="?/saveView" use:enhance>
							<h3>Save a view</h3>
							<p class="note">This saves the whole gallery over the last complete days. To save a view with album filters, use Save view on the gallery report, which has them.</p>
							<div class="fields">
								<label class="entry"><span>Name</span><input name="name" maxlength={SAVED_VIEW_NAME_MAX} required placeholder="Name this view" /></label>
								<label class="entry"><span>Days</span><select name="period">{#each SAVED_VIEW_PERIODS as period (period)}<option value={period} selected={period === 30}>Last {period} days</option>{/each}</select></label>
								<label class="entry"><span>Count</span><select name="measure">{#each Object.entries(MEASURE_WORDS) as [key, label] (key)}<option value={key}>{label}</option>{/each}</select></label>
							</div>
							<button type="submit">Save view</button>
							{#if form?.saveError}<p class="alert" role="alert">{form.saveError}</p>{/if}
							{#if form?.saved}<p class="ok" role="status">Saved.</p>{/if}
						</form>
					</section>
				{:else}
					<section class="block" aria-labelledby="private-title">
						<h2 id="private-title">Private reports and saved views</h2>
						<p class="note">Signing in adds how long private records are kept, the launch recap settings, optional email delivery, and your saved views. Nothing private is read or shown until you sign in.</p>
						<p class="action"><a class="button" href={signInHref}>Sign in with a magic link</a></p>
					</section>
				{/if}
			</div>
		</div>

		<p class="note">These choices belong to this page. They do not change what visitors see or what the public site counts.</p>
	</div>
</div>

<style>
	.settings { --ink: #172033; --muted: #526176; --line: #d8e0ea; --blue: #1458c4; --blue-ink: #174ea6; --warn: #9a4a00; background: #edf2f7; color: var(--ink); margin-inline: auto; min-height: 100dvh; max-width: 96rem; min-width: 0; overflow-x: clip; padding: .5rem 1rem 3rem; }
	@media (min-width: 640px) { .settings { padding: 1rem 1.5rem 2.5rem; } }
	@media (min-width: 1024px) { .settings { padding-inline: 2rem; } }
	a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid var(--blue-ink); outline-offset: 2px; }
	.body { display: grid; gap: .9rem; min-width: 0; }
	.eyebrow { color: var(--blue-ink); font-size: .75rem; font-weight: 800; letter-spacing: .09em; margin: 0; text-transform: uppercase; }
	h1 { font-size: 1.2rem; font-weight: 700; letter-spacing: -.01em; line-height: 1.28; margin: .3rem 0 0; max-width: 46rem; }
	@media (min-width: 640px) { h1 { font-size: 1.4rem; } }
	@media (min-width: 1024px) { h1 { font-size: 1.6rem; } }
	h2 { font-size: 1.02rem; font-weight: 700; margin: 0; }
	h3 { font-size: .95rem; font-weight: 700; margin: 0; }
	.grid { display: grid; gap: .9rem; }
	@media (min-width: 1000px) { .grid { align-items: start; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
	.column { display: grid; gap: .9rem; min-width: 0; }
	.block { background: #fff; border: 1px solid var(--line); border-radius: .8rem; min-width: 0; padding: .8rem .9rem; }
	.block :global(.analytics-preferences) { margin-top: .6rem; }
	.note { color: var(--muted); font-size: .85rem; line-height: 1.5; margin: .35rem 0 0; max-width: 62rem; }
	.note a { color: var(--blue-ink); text-underline-offset: 3px; }
	.action { margin: .6rem 0 0; }
	.button, button { align-items: center; background: var(--blue-ink); border: 1px solid var(--blue-ink); border-radius: .5rem; color: #fff; cursor: pointer; display: inline-flex; font: inherit; font-size: .85rem; font-weight: 650; min-height: 2.75rem; padding: 0 .9rem; text-decoration: none; }
	button.danger { background: #fff; color: #8f1d1d; border-color: #8f1d1d; }
	.alert { background: #fdf0ef; border-radius: .5rem; color: #8f1d1d; font-size: .85rem; line-height: 1.45; margin: .6rem 0 0; padding: .55rem .7rem; }
	.ok { color: #195b33; font-size: .85rem; margin: .5rem 0 0; }
	.views { display: grid; gap: .6rem; list-style: none; margin: .6rem 0 0; padding: 0; }
	.views li { border-top: 1px solid #e6ecf3; padding-top: .6rem; }
	.views li:first-child { border-top: 0; padding-top: 0; }
	.view-head { align-items: baseline; display: flex; flex-wrap: wrap; gap: .1rem .8rem; justify-content: space-between; }
	.view-name { align-items: center; color: var(--blue-ink); display: inline-flex; font-weight: 700; min-height: 2.75rem; overflow-wrap: anywhere; text-underline-offset: 3px; }
	.view-meta { color: var(--muted); font-size: .8rem; }
	.view-filters { color: var(--muted); font-size: .85rem; line-height: 1.4; margin: .15rem 0 0; }
	.view-actions { align-items: end; display: flex; flex-wrap: wrap; gap: .5rem 1rem; margin-top: .4rem; }
	.view-actions form { align-items: end; display: flex; flex-wrap: wrap; gap: .4rem; }
	.entry { color: var(--muted); display: grid; font-size: .8rem; font-weight: 650; gap: .2rem; }
	input:not([type='hidden']), select { background: #fff; border: 1px solid #8fa1b8; border-radius: .4rem; color: var(--ink); font: inherit; font-size: .9rem; min-height: 2.75rem; min-width: 0; padding: 0 .6rem; }
	.save { border-top: 1px solid #e6ecf3; margin-top: .9rem; padding-top: .8rem; }
	.fields { display: grid; gap: .5rem; grid-template-columns: 1fr; margin: .5rem 0; }
	@media (min-width: 640px) { .fields { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr); } }
	.sr-only { clip: rect(0 0 0 0); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
	@media (forced-colors: active) { .block, input, select, button, .button { border: 1px solid CanvasText; } }
	@media (prefers-contrast: more) { .settings { --muted: #36445a; --line: #5c6b80; } .note, .view-meta, .view-filters, .entry { color: #2b3748; } }
</style>
