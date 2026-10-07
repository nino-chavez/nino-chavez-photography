<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import { albumIndexPath, photosPath } from '$lib/analytics/report-paths';
	import { photoParams } from '$lib/analytics/photo-view';
	import { readShortlist, signInNeeds, writeShortlist } from '$lib/analytics/shortlist';
	import { cfImageUrl } from '$lib/utils/cloudflare-images';
	import { formatDay, plural, type RecapSentence } from '$lib/analytics/launch-recap';
	import ReportHeader from '$lib/components/analytics/ReportHeader.svelte';
	import LaunchDailyChart from '$lib/components/analytics/LaunchDailyChart.svelte';
	import LaunchComparison from '$lib/components/analytics/LaunchComparison.svelte';
	import IntelligenceWorkspace from '$lib/components/analytics/IntelligenceWorkspace.svelte';
	import LaunchFindings from '$lib/components/analytics/LaunchFindings.svelte';
	import LaunchRecaps from '$lib/components/analytics/LaunchRecaps.svelte';
	import { launchScope } from '$lib/analytics/intelligence-contract';
	import SharingNotes from '$lib/components/analytics/SharingNotes.svelte';
	import type { ActionData, PageData } from '../../../routes/analytics/albums/[albumKey]/$types';

	/** The album report: this page's data when it is not asked for a single recap. The route's page chooses between this and the recap view. */
	let { data, form }: { data: Extract<PageData, { mode: 'report' }>; form: ActionData } = $props();

	const signedIn = $derived(data.user !== null);
	const recap = $derived(data.recap);
	const photos = $derived(data.photos);
	const undated = $derived(data.album.status === 'no_launch_date');
	const PAGE_SIZE = 60;

	let hydrated = $state(false);
	let selectedId = $state<string | null>(null);
	let visible = $state(PAGE_SIZE);
	let shortlist = $state<string[]>([]);
	let recordRequest = $state(0);
	let announce = $state('');
	let dialogEl = $state<HTMLDialogElement | undefined>();
	let dialogOpen = $state(false);
	let opener: HTMLElement | null = null;

	const selected = $derived(photos.find((photo) => photo.photoId === selectedId) ?? photos[0] ?? null);
	const selectedRank = $derived(selected ? photos.findIndex((photo) => photo.photoId === selected.photoId) + 1 : 0);
	const mostRequested = $derived(photos.filter((photo) => photo.downloads > 0).slice(0, 6));
	const topCount = $derived(photos[0]?.downloads ?? 0);
	const orderIsWeak = $derived(topCount <= 3);
	const shown = $derived(photos.slice(0, visible));
	const hostname = $derived(page.url.hostname);
	const indexHref = $derived(albumIndexPath(hostname));
	const signInHref = $derived(`${base}/login?next=${encodeURIComponent(`/analytics/albums/${data.album.key}`)}`);
	const csvQuery = $derived((measure: string) => new URLSearchParams({
		period: 'custom', start: data.query.start, end: data.query.end, scope: 'album', albums: data.album.key, measure, traffic: 'conservative', compare: 'none'
	}).toString());
	const csvHref = $derived(`${photosPath(hostname, '/export.csv')}?${csvQuery('photo_opens')}`);
	const shortlistCsvHref = $derived(`${photosPath(hostname, '/export.csv')}?${csvQuery('downloads')}&shortlist=${encodeURIComponent(shortlist.join(','))}`);
	// The same album over the same days in the photo explorer, which has the filters, columns and saved views this report does not.
	const explorerHref = $derived(photosPath(hostname, `?${photoParams({ ...data.query, compare: 'none' }, 'popular', 0)}`));
	const topSix = $derived(mostRequested.map((photo) => photo.photoId));
	const topSixShortlisted = $derived(topSix.length > 0 && topSix.every((id) => shortlist.includes(id)));
	const scope = $derived({ kind: 'gallery' as const, query: data.query });

	// SvelteKit reuses this component when the link goes to another album, so what was chosen here must not carry over.
	let shownFor = '';
	$effect(() => {
		const key = data.album.key;
		if (key !== shownFor) { shownFor = key; selectedId = null; visible = PAGE_SIZE; announce = ''; }
	});

	onMount(() => {
		hydrated = true;
		shortlist = readShortlist();
	});

	function saveShortlist(next: string[]) {
		shortlist = next;
		writeShortlist(next);
	}
	function toggleShortlist(photoId: string) {
		const had = shortlist.includes(photoId);
		saveShortlist(had ? shortlist.filter((id) => id !== photoId) : [...shortlist, photoId]);
		announce = had ? 'Photo removed from the shortlist.' : 'Photo added to the shortlist.';
	}
	function shortlistTopSix() {
		const merged = [...shortlist];
		for (const id of topSix) if (!merged.includes(id)) merged.push(id);
		saveShortlist(merged.slice(0, 500));
		announce = `${plural(topSix.length, 'photo')} added to the shortlist.`;
	}
	function scrollToId(id: string) {
		const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
		document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
	}
	async function seeAll() {
		visible = Math.max(visible, photos.length);
		await tick();
		scrollToId('photos');
		document.getElementById('photos')?.focus({ preventScroll: true });
	}
	function recordChange() {
		recordRequest += 1;
		scrollToId('assistant');
	}
	// Below the desktop breakpoint there is no side panel, so a photo's details open in a modal dialog.
	const narrow = () => matchMedia('(max-width: 1023px)').matches;
	function dialogClosed() {
		dialogOpen = false;
		// Focus goes back to the photo that was tapped, without moving the page.
		opener?.focus({ preventScroll: true });
		opener = null;
	}
	async function choose(photoId: string, event: Event) {
		const trigger = event.currentTarget as HTMLElement;
		select(photoId);
		if (narrow() && dialogEl) {
			opener = trigger;
			dialogOpen = true;
			await tick();
			dialogEl.showModal();
			document.getElementById('dialog-close')?.focus({ preventScroll: true });
		}
	}
	function select(photoId: string) {
		selectedId = photoId;
		const photo = photos.find((item) => item.photoId === photoId);
		const rank = photos.findIndex((item) => item.photoId === photoId) + 1;
		announce = photo && !narrow() ? `Photo ${rank} selected: ${plural(photo.downloads, 'download request')}, ${plural(photo.opens, 'open')}. Its details are in the Selected photo panel.` : '';
	}
	const requested = (n: number) => `${n.toLocaleString()} requested`;
</script>

<svelte:head>
	<title>{data.album.name} · Album launch report</title>
	<meta name="robots" content="noindex, nofollow, noarchive" />
</svelte:head>

{#snippet words(sentence: RecapSentence)}{#each sentence as part}{#if part.strong}<strong>{part.text}</strong>{:else}{part.text}{/if}{/each}{/snippet}

{#snippet details(where: 'panel' | 'dialog', selected: (typeof photos)[number])}
					<h2 id={`selected-title-${where}`}>{where === 'dialog' ? `Photo ${selectedRank.toLocaleString()} of ${photos.length.toLocaleString()}` : 'Selected photo'}</h2>
					{#if where === 'panel'}<p class="note">Number {selectedRank.toLocaleString()} of {photos.length.toLocaleString()} in this ranking.</p>{/if}
					<div class="selected-image">
						{#if selected.cfImageId}<img src={cfImageUrl(selected.cfImageId, 'medium')} alt={`Selected photo, number ${selectedRank} in this ranking`} loading={where === 'dialog' ? 'eager' : 'lazy'} decoding="async" />{:else}<span class="no-image">No preview</span>{/if}
					</div>
					<dl class="facts">
						<div><dt>Download requests</dt><dd>{selected.downloads.toLocaleString()}</dd></div>
						<div><dt>Opens</dt><dd>{selected.opens.toLocaleString()}</dd></div>
						<div><dt>Favorites</dt><dd>{selected.favorites.toLocaleString()}</dd></div>
					</dl>
					{#if selected.exposureRecorded && selected.exposures !== null && selected.opensInExposureWindow !== null}
						<p class="note">Since {data.album.exposure.since ? formatDay(data.album.exposure.since) : 'collection began'}, this photo's tile appeared on screen in a gallery grid {plural(selected.exposures, 'time')}, and the photo was opened {plural(selected.opensInExposureWindow, 'time')} on those days.{#if selected.opensInExposureWindow > selected.exposures}{' '}An open can also come from a direct link, without the tile ever appearing in a grid.{/if}</p>
					{/if}
					<div class="selected-actions">
						{#if selected.cfImageId}<a class="secondary" href={`https://ninochavez.co${base}/photo/${encodeURIComponent(selected.cfImageId)}`}>Open photo to share or download</a>{/if}
						{#if signedIn}<button type="button" class="secondary" onclick={() => toggleShortlist(selected.photoId)} disabled={!hydrated}>{shortlist.includes(selected.photoId) ? 'Remove from shortlist' : 'Add to shortlist'}</button>{/if}
					</div>
{/snippet}

<div class="launch-report">
	<ReportHeader current="album" />

	<div class="report-body">
		<section class="recap" aria-labelledby="album-title">
			<div class="recap-text">
				<p class="eyebrow">{recap.eyebrow}</p>
				<h1 id="album-title">{data.album.name}</h1>
				<p class="meta">{#if recap.published}<span>{@render words(recap.published)}</span>{' '}{/if}<span>{photos.length.toLocaleString()} {photos.length === 1 ? 'photo' : 'photos'} in the album.</span></p>
				<p class="headline">{@render words(recap.headline)}</p>
				{#each recap.sentences as sentence}
					<p class="sentence">{@render words(sentence)}</p>
				{/each}
				<p class="window">{@render words(recap.window)}</p>
			</div>
			<div class="panel chart-panel" id="launch-chart">
				<LaunchDailyChart chart={data.charts.daily} {undated} />
			</div>
		</section>

		<section class="downloads panel" aria-labelledby="downloads-title">
			<div class="downloads-main">
			<h2 id="downloads-title">{mostRequested.length ? 'Photos people asked to download' : 'Download requests'}</h2>
			{#if recap.downloads}<p class="sentence">{@render words(recap.downloads)}</p>{/if}
			{#if mostRequested.length}
				<ul class="strip" aria-label="The photos with the most download requests">
					{#each mostRequested as photo, index (photo.photoId)}
						<li>
							<button type="button" class="strip-photo" onclick={(event) => { if (narrow()) choose(photo.photoId, event); else { select(photo.photoId); scrollToId('photos'); } }} aria-label={`Photo ${index + 1}, ${photo.downloads} download ${photo.downloads === 1 ? 'request' : 'requests'}. Show it in the photo panel.`}>
								{#if photo.cfImageId}<img src={cfImageUrl(photo.cfImageId, 'thumbnail')} alt="" loading="lazy" decoding="async" />{:else}<span class="no-image">No preview</span>{/if}
							</button>
							<span class="cap">{requested(photo.downloads)}</span>
						</li>
					{/each}
				</ul>
			{/if}
			{#if recap.arrivals}<p class="sentence arrivals">{@render words(recap.arrivals)}</p>{/if}
			<div class="actions">
				<a class="primary" href="#photos" onclick={(event) => { event.preventDefault(); void seeAll(); }}>See all {photos.length.toLocaleString()} photos</a>
				{#if signedIn}
					{#if mostRequested.length}<button type="button" class="secondary" onclick={shortlistTopSix} disabled={!hydrated || topSixShortlisted}>{topSixShortlisted ? `Shortlisted ${topSix.length}` : `Shortlist these ${topSix.length}`}</button>{/if}
					<button type="button" class="secondary" onclick={recordChange} disabled={!hydrated}>Record what you did</button>
				{/if}
				<a class="secondary" href={csvHref}>Export CSV</a>
				<a class="secondary" href={explorerHref}>Filter these photos</a>
				{#if signedIn && shortlist.length}<a class="secondary" href={shortlistCsvHref}>Shortlist CSV ({shortlist.length})</a>{/if}
			</div>
			{#if !signedIn}<p class="note">{signInNeeds(['shortlisting', 'recording what you did', 'private sharing notes'])} <a href={signInHref}>sign-in</a>. Everything else on this page is open by direct link.</p>{/if}
			<p class="sr-only" role="status" aria-live="polite">{announce}</p>
			</div>
			<div class="limits">
				<h3>What this cannot tell you</h3>
				<ul>{#each recap.limits as limit}<li>{limit}</li>{/each}</ul>
			</div>
		</section>

		{#if data.sharing}
			<div class="panel">
				<SharingNotes notes={data.sharing.notes} available={data.sharing.available} today={data.album.today} {form} />
			</div>
		{/if}

		{#if data.findings.findings.length}
			<section class="worth" aria-labelledby="worth-title">
				<h2 id="worth-title">Worth your attention</h2>
				<LaunchFindings findings={data.findings.findings} checked={data.findings.checked} owner={signedIn} scope={launchScope(data.album.key)} />
			</section>
		{/if}

		{#if data.recaps}
			<LaunchRecaps rows={data.recaps.rows} />
		{/if}

		<div class="below">
			<section id="photos" class="photos panel" aria-labelledby="photos-title" tabindex="-1">
				<h2 id="photos-title">{#if undated}Photos, most opened first{:else}Photos, most requested first{/if}</h2>
				<p class="note">Ranked by download requests, then opens. Download requests are requests, not confirmed saved files.{#if topCount === 0}{' '}No photo was requested, so the order uses opens only.{:else if orderIsWeak}{' '}The most any photo got was {topCount.toLocaleString()}, so treat the order as weak.{/if}</p>
				{#if photos.length}
					<ul class="grid">
						{#each shown as photo, index (photo.photoId)}
							<li>
								<button type="button" class="cell" class:active={selected?.photoId === photo.photoId} aria-pressed={selected?.photoId === photo.photoId}
									aria-label={`Photo ${index + 1}: ${photo.downloads} download ${photo.downloads === 1 ? 'request' : 'requests'}, ${photo.opens} ${photo.opens === 1 ? 'open' : 'opens'}`} onclick={(event) => choose(photo.photoId, event)}>
									{#if photo.cfImageId}<img src={cfImageUrl(photo.cfImageId, 'grid')} alt="" loading="lazy" decoding="async" />{:else}<span class="no-image">No preview</span>{/if}
									{#if shortlist.includes(photo.photoId)}<span class="tag" aria-hidden="true">Shortlisted</span>{/if}
								</button>
								<span class="cap">{photo.downloads.toLocaleString()} requested · {photo.opens.toLocaleString()} {photo.opens === 1 ? 'open' : 'opens'}</span>
							</li>
						{/each}
					</ul>
					{#if visible < photos.length}
						<button type="button" class="secondary more" onclick={() => (visible = Math.min(photos.length, visible + PAGE_SIZE))}>{photos.length - visible <= PAGE_SIZE ? `Show the other ${(photos.length - visible).toLocaleString()} photos` : `Show ${PAGE_SIZE} more (${(photos.length - visible).toLocaleString()} left)`}</button>
					{/if}
				{:else}
					<p class="note">No photos are listed for this album.</p>
				{/if}
			</section>

			{#if selected}
				<aside class="selected panel" aria-labelledby="selected-title-panel">
					{@render details('panel', selected)}
				</aside>
			{/if}

			<div class="compare panel">
				<LaunchComparison curves={data.charts.curves} rows={data.charts.table} hasLaunch={!undated} />
			</div>
		</div>

		{#if data.intelligence !== 'none'}
		<section id="assistant" class="assistant panel" aria-label="Ask about this album and record changes">
			<IntelligenceWorkspace recordOnly={data.intelligence === 'record'} kind="gallery" {scope} owner={data.intelligenceOwner} contextTarget={{ kind: 'album', albumKey: data.album.key }} signInNext={`/analytics/albums/${data.album.key}`} {recordRequest} />
		</section>
		{/if}
	</div>

	<dialog class="photo-dialog" bind:this={dialogEl} aria-labelledby="selected-title-dialog" onclose={dialogClosed} onclick={(event) => { if (event.target === dialogEl) dialogEl?.close(); }}>
		{#if selected && dialogOpen}
			<div class="dialog-bar">
				<button type="button" class="secondary close" id="dialog-close" onclick={() => dialogEl?.close()}>Close</button>
			</div>
			{@render details('dialog', selected)}
		{/if}
	</dialog>
</div>

<style>
	.launch-report { --ink: #172033; --muted: #526176; --line: #d8e0ea; --blue: #1458c4; --blue-ink: #174ea6; background: #edf2f7; color: var(--ink); margin-inline: auto; max-width: 96rem; min-width: 0; overflow-x: clip; padding: .5rem 1rem 3rem; }
	@media (min-width: 640px) { .launch-report { padding: 1.25rem 1.5rem 3.5rem; } }
	@media (min-width: 1024px) { .launch-report { padding-inline: 2rem; } }

	a:focus-visible, button:focus-visible, [tabindex]:focus-visible { outline: 3px solid var(--blue-ink); outline-offset: 2px; }
	#photos:focus-visible { outline-offset: 4px; }

	.panel { background: #fff; border: 1px solid var(--line); border-radius: .9rem; min-width: 0; padding: 1rem; }
	/* The site layout already provides the page's <main>. */
	.report-body { display: grid; gap: 1rem; min-width: 0; }

	.recap { display: grid; gap: 1rem; min-width: 0; }
	.recap-text { min-width: 0; padding-block: .25rem; }
	.eyebrow { color: var(--blue-ink); font-size: .75rem; font-weight: 800; letter-spacing: .09em; margin: 0; text-transform: uppercase; }
	h1 { font-size: 1.55rem; font-weight: 750; letter-spacing: -.01em; line-height: 1.2; margin: .35rem 0 .2rem; overflow-wrap: anywhere; }
	h2 { font-size: 1.05rem; font-weight: 700; margin: 0; }
	h3 { font-size: .9rem; font-weight: 700; margin: 0 0 .3rem; }
	.meta { color: var(--muted); font-size: .88rem; margin: 0 0 .9rem; }
	.headline { font-size: 1.3rem; font-weight: 500; line-height: 1.4; margin: 0 0 .6rem; }
	.headline :global(strong) { font-weight: 800; }
	.sentence { font-size: 1.02rem; line-height: 1.55; margin: 0 0 .5rem; max-width: 42rem; }
	.sentence :global(strong) { font-weight: 750; }
	.window { color: var(--muted); font-size: .85rem; line-height: 1.5; margin: .8rem 0 0; max-width: 42rem; }
	.window :global(strong) { font-weight: 650; }
	.note { color: var(--muted); font-size: .85rem; line-height: 1.5; margin: .35rem 0 .6rem; max-width: 46rem; }
	.note a { color: var(--blue-ink); font-weight: 650; }

	.downloads { display: grid; gap: .25rem 2rem; }
	.downloads-main { min-width: 0; }
	@media (min-width: 1024px) { .downloads { grid-template-columns: minmax(0, 1fr) 20rem; } .downloads .limits { align-self: start; border-left: 1px solid #e1e8f0; border-top: 0; margin-top: 0; padding: 0 0 0 1.5rem; } }
	.downloads .sentence { margin: .4rem 0 .2rem; }
	.arrivals { margin-top: .7rem; }
	.strip { display: grid; gap: .6rem; grid-template-columns: repeat(3, minmax(0, 1fr)); list-style: none; margin: .5rem 0; padding: 0; }
	@media (min-width: 640px) { .strip { grid-template-columns: repeat(6, minmax(0, 1fr)); max-width: 52rem; } }
	.strip li, .grid li { display: grid; gap: .25rem; min-width: 0; }
	.cap { color: var(--muted); font-size: .76rem; line-height: 1.3; overflow-wrap: anywhere; }
	.strip-photo, .cell { background: #dfe6ef; border: 2px solid transparent; border-radius: .5rem; cursor: pointer; display: block; min-height: 2.75rem; overflow: hidden; padding: 0; position: relative; width: 100%; }
	.strip-photo { aspect-ratio: 3 / 2; }
	.cell { aspect-ratio: 3 / 2; }
	.cell.active { border-color: var(--blue); box-shadow: 0 0 0 2px #fff inset; }
	img { display: block; height: 100%; object-fit: cover; width: 100%; }
	.no-image { align-items: center; color: var(--muted); display: flex; font-size: .78rem; height: 100%; justify-content: center; }
	.tag { background: var(--blue); border-radius: .3rem; bottom: .25rem; color: #fff; font-size: .68rem; font-weight: 700; left: .25rem; padding: .1rem .35rem; position: absolute; }

	.actions { align-items: center; display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .6rem; }
	.primary, .secondary { align-items: center; border-radius: .55rem; cursor: pointer; display: inline-flex; font: inherit; font-size: .9rem; font-weight: 700; justify-content: center; min-height: 2.75rem; padding: .5rem .9rem; text-align: center; text-decoration: none; }
	.primary { background: var(--blue); border: 1px solid var(--blue); color: #fff; }
	.secondary { background: #fff; border: 1px solid #8fa1b8; color: var(--blue-ink); }
	.secondary:disabled { cursor: default; opacity: .6; }
	.primary:hover:not(:disabled) { background: #0f47a3; }
	.secondary:hover:not(:disabled) { background: #eef4fc; }

	.limits { border-top: 1px solid #e1e8f0; margin-top: .9rem; padding-top: .7rem; }
	.limits ul { color: var(--muted); font-size: .82rem; line-height: 1.5; list-style: disc; margin: 0; padding-left: 1.1rem; }

	.below { display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr); min-width: 0; }
	.photos { scroll-margin-top: .75rem; }
	.selected { display: none; }
	.grid { display: grid; gap: .6rem .5rem; grid-template-columns: repeat(3, minmax(0, 1fr)); list-style: none; margin: .6rem 0; padding: 0; }
	@media (min-width: 640px) { .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
	@media (min-width: 1280px) { .grid { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
	.more { margin-top: .5rem; }
	.selected-image { aspect-ratio: 3 / 2; background: #dfe6ef; border-radius: .6rem; margin: .5rem 0; overflow: hidden; }
	.facts { display: grid; gap: .5rem; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: .6rem 0; }
	.facts div { background: #f4f7fb; border-radius: .5rem; padding: .5rem .6rem; }
	.facts dt { color: var(--muted); font-size: .74rem; }
	.facts dd { font-size: 1.15rem; font-variant-numeric: tabular-nums; font-weight: 750; margin: .1rem 0 0; }
	.selected-actions { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .6rem; }

	@media (min-width: 1024px) {
		.recap { align-items: start; grid-template-columns: minmax(0, 1fr) minmax(0, 30rem); }
		h1 { font-size: 1.85rem; }
		.below { align-items: start; grid-template-columns: minmax(0, 1fr) 24rem; grid-template-areas: "photos selected" "photos compare" "photos ."; grid-template-rows: auto auto 1fr; }
		.photos { grid-area: photos; }
		.selected { display: block; grid-area: selected; position: sticky; top: .75rem; }
		.compare { grid-area: compare; }
	}
	@media (min-width: 1280px) { .recap { grid-template-columns: minmax(0, 1fr) minmax(0, 36rem); } }

	.photo-dialog { background: #fff; border: 0; inset: 0; margin: auto; border-radius: .9rem; box-shadow: 0 20px 60px rgb(23 32 51 / .35); color: var(--ink); max-height: min(92dvh, 46rem); max-width: min(94vw, 34rem); overflow: auto; padding: .75rem 1rem 1rem; width: 100%; }
	.photo-dialog::backdrop { background: rgb(23 32 51 / .6); }
	.dialog-bar { display: flex; justify-content: flex-end; margin-bottom: .25rem; }
	@media (min-width: 1024px) { .photo-dialog { display: none; } }
	.assistant { padding: .25rem 1rem 1rem; }
	.worth { display: grid; gap: .5rem; min-width: 0; }
	.worth h2 { font-size: 1.05rem; }
	#launch-chart, #downloads-title { scroll-margin-top: .75rem; }
	/* The shared assistant's own buttons are 37px tall; this page holds every control to 44px. */
	.assistant :global(button), .assistant :global(.finding-actions a) { min-height: 2.75rem; }
	.sr-only { clip: rect(0 0 0 0); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
	@media (forced-colors: active) { .panel, .strip-photo, .cell { border: 1px solid CanvasText; } .primary { border: 1px solid ButtonText; } .cell.active { outline: 3px solid Highlight; } }
	@media (prefers-contrast: more) { .launch-report { --muted: #36445a; --line: #5c6b80; } .cap, .note, .window, .meta { color: #2b3748; } .secondary { border-color: #36445a; } }
	@media (prefers-reduced-motion: no-preference) { .primary, .secondary { transition: background-color .12s; } }
</style>
