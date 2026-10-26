<script lang="ts">
	import { base } from '$app/paths';
	import { onDestroy } from 'svelte';
	import { portfolio } from '$lib/portfolio';
	import type { LatestApiAlbum } from '$lib/albums/latest';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let viewer = $state<HTMLDialogElement>();
	let selected = $state(0);
	let currentPhoto = $derived(portfolio[selected]);
	let trigger: HTMLElement | null = null;
	let previousOverflow = '';

	function openPhoto(event: MouseEvent, index: number) {
		event.preventDefault();
		trigger = event.currentTarget as HTMLElement;
		selected = index;
		previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		viewer?.showModal();
	}
	function restorePage() {
		document.body.style.overflow = previousOverflow;
		trigger?.focus({ preventScroll: true });
		trigger = null;
	}
	function advance(delta: number) { selected = (selected + delta + portfolio.length) % portfolio.length; }
	function viewerKey(event: KeyboardEvent) {
		if (event.key === 'ArrowRight') { event.preventDefault(); advance(1); }
		if (event.key === 'ArrowLeft') { event.preventDefault(); advance(-1); }
		if (event.key === 'Tab' && viewer) {
			const controls = viewer.querySelectorAll<HTMLButtonElement>('button');
			const first = controls[0];
			const last = controls[controls.length - 1];
			if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
			if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
		}
	}
	onDestroy(() => { if (typeof document !== 'undefined' && viewer?.open) document.body.style.overflow = previousOverflow; });
	function albumHref(album: LatestApiAlbum) { return new URL(album.url).pathname; }
</script>

{#snippet galleryLink(album: LatestApiAlbum)}
	<a class="event" href={albumHref(album)} data-sveltekit-preload-data="tap">
		{#if album.cover_url}<img src={album.cover_url} alt="" width="82" height="123" loading="lazy" />{:else}<span class="no-cover" aria-hidden="true">Gallery</span>{/if}
		<span class="event-text"><span class="event-meta">{#if album.photo_count > 0}{album.photo_count.toLocaleString()} photos{/if}</span><span class="event-title">{album.album_name}</span><span class="event-action">Open gallery <span aria-hidden="true">→</span></span></span>
	</a>
{/snippet}

<div class="photo-home">
	<div class="opening">
		<figure class="lead-photo">
			<a class="photograph" href={`${base}${portfolio[0].src}`} onclick={(event) => openPhoto(event, 0)} aria-label={`Open photograph: ${portfolio[0].alt}`} aria-haspopup="dialog"><img src={`${base}${portfolio[0].src}`} alt={portfolio[0].alt} width={portfolio[0].width} height={portfolio[0].height} fetchpriority="high" /></a>
			<figcaption>Selected photographs <span>01 / {portfolio.length}</span></figcaption>
		</figure>
		<div class="opening-side">
			<div class="intro"><p class="eyebrow">Photography</p><h1>Nino Chavez</h1></div>
			<section class="finder" id="find-event" aria-labelledby="finder-heading">
				<h2 id="finder-heading">Find your event</h2>
				<form method="GET" action={`${base}/albums`}>
					<label for="event-query">Event, team, or date</label>
					<div class="search-line"><input id="event-query" name="q" type="search" placeholder="e.g. Chicago Point Series" /><button type="submit">Search</button></div>
				</form>
				<div class="archive-links"><a href={`${base}/albums`}>All events <span aria-hidden="true">→</span></a><a href={`${base}/timeline`}>Browse by date <span aria-hidden="true">→</span></a></div>
			</section>
			<div class="latest-event">
				{#if data.unavailable}<p>Recent galleries are temporarily unavailable. <a href={`${base}/albums`}>Try the event archive.</a></p>
				{:else if data.lead}<p class="small muted">Latest gallery</p>{@render galleryLink(data.lead)}
				{:else}<p>New event galleries will appear here when they’re published.</p>{/if}
			</div>
		</div>
	</div>
	<section id="photographs" class="selected" aria-labelledby="photos-heading">
		<div class="section-heading"><h2 id="photos-heading">Selected photographs</h2><span class="small muted">{portfolio.length} photographs · Open any image</span></div>
		<div class="photo-grid">{#each portfolio.slice(1) as photo, i (photo.src)}<a class="photograph" href={`${base}${photo.src}`} onclick={(event) => openPhoto(event, i + 1)} aria-label={`Open photograph: ${photo.alt}`} aria-haspopup="dialog"><img src={`${base}${photo.src}`} alt={photo.alt} width={photo.width} height={photo.height} loading="lazy" decoding="async" /></a>{/each}</div>
	</section>
	{#if data.recent.length > 0}
		<section class="recent-events" aria-labelledby="recent-heading"><div class="section-heading"><h2 id="recent-heading">Recent events</h2><a href={`${base}/albums`}>See all events <span aria-hidden="true">→</span></a></div><div class="event-grid">{#each data.recent as album (album.album_key)}{@render galleryLink(album)}{/each}</div></section>
	{/if}
	<div class="contact-line"><a href="https://ninochavez.co/photography/coverage" data-sveltekit-reload>Event coverage</a><a href="mailto:nino@ninochavez.co">Get in touch</a></div>
</div>

<!-- Static portfolio images have no gallery IDs, so this viewer offers viewing only. -->
<dialog bind:this={viewer} class="portfolio-viewer" aria-labelledby="viewer-caption" onkeydown={viewerKey} onclose={restorePage}>
	<div class="viewer-controls"><span aria-live="polite">{selected + 1} / {portfolio.length}</span><button onclick={() => viewer?.close()}>Close <span aria-hidden="true">×</span></button></div>
	<figure><img src={`${base}${currentPhoto.src}`} alt={currentPhoto.alt} width={currentPhoto.width} height={currentPhoto.height} /><figcaption id="viewer-caption">{currentPhoto.alt}</figcaption></figure>
	<div class="viewer-paging"><button onclick={() => advance(-1)}>← Previous</button><button onclick={() => advance(1)}>Next →</button></div>
</dialog>

<style>
	.photo-home { --home-ink: #f3f1eb; --home-muted: #b9b7b0; --home-line: #484848; max-width: 1440px; padding: 0 48px; margin: auto; font-family: Arial, Helvetica, sans-serif; color: var(--home-ink); font-size: 15px; line-height: 1.5; }
	.photo-home :is(h1,h2,p,figure) { margin: 0; }
	.photo-home :is(h1,h2) { font-family: inherit; font-weight: 400; text-transform: none; }
	.photo-home h1 { font-size: clamp(34px,4.5vw,64px); letter-spacing: -.045em; line-height: 1.05; }
	.photo-home h2 { font-size: 22px; line-height: 1.25; letter-spacing: -.02em; }
	.photo-home a { color: inherit; text-underline-offset: 5px; text-decoration-thickness: 1px; }
	.photo-home a:hover { text-decoration: underline; }
	.photo-home :is(button,input) { font: inherit; color: inherit; }
	.photo-home button { cursor: pointer; }
	.photo-home :focus-visible, .portfolio-viewer :focus-visible { outline: 2px solid var(--color-gold-400); outline-offset: 5px; }
	.photo-home .small { font-size: 12px; line-height: 1.5; }
	.photo-home .muted { color: var(--home-muted); }
	.photo-home .eyebrow { font-size: 12px; letter-spacing: .05em; margin-bottom: 12px; color: var(--home-muted); }
	.opening { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 7vw; align-items: start; margin: 30px 0 72px; }
	.lead-photo { max-width: 390px; justify-self: center; width: 100%; }
	.photograph { display: block; padding: 0; width: 100%; background: transparent; border: 0; text-align: left; line-height: 0; }
	.photograph img { display: block; width: 100%; height: auto; }
	.lead-photo figcaption { display: flex; justify-content: space-between; font-size: 11px; margin-top: 10px; color: var(--home-muted); }
	.opening-side { padding: 34px 0 0; max-width: 480px; }
	.intro { margin-bottom: 45px; }
	.finder, .selected { scroll-margin-top: calc(var(--gallery-header-height) + 24px); }
	.finder h2 { margin-bottom: 18px; }
	.finder label { display: block; font-size: 12px; margin-bottom: 8px; }
	.search-line { display: flex; border-bottom: 1px solid var(--home-ink); background: #222; }
	.search-line input { min-width: 0; width: 100%; padding: 13px 12px; border: 0; background: transparent; border-radius: 0; font-size: 15px; }
	.search-line input::placeholder { color: var(--home-muted); opacity: 1; }
	.search-line button { font-size: 12px; padding: 0 14px; border: 0; background: transparent; text-decoration: underline; }
	.archive-links { display: flex; flex-wrap: wrap; gap: 26px; font-size: 13px; margin-top: 16px; }
	.latest-event { margin-top: 30px; border-top: 1px solid var(--home-line); padding-top: 18px; }
	.latest-event > p { margin-bottom: 12px; }
	.event { display: grid; grid-template-columns: 82px minmax(0,1fr); gap: 16px; align-items: start; text-decoration: none; min-width: 0; }
	.event img { display: block; width: 100%; height: auto; }
	.event:hover { text-decoration: none; }
	.event:hover .event-title { text-decoration: underline; text-underline-offset: 4px; }
	.event-text { display: block; }
	.event-meta { display: block; color: var(--home-muted); font-size: 11px; line-height: 1.5; margin-bottom: 7px; }
	.event-title { display: block; font-size: 13px; line-height: 1.45; overflow-wrap: anywhere; }
	.event-action { display: block; font-size: 11px; margin-top: 8px; color: var(--home-muted); }
	.no-cover { min-height: 100px; display: grid; place-items: center; font-size: 11px; background: #222; }
	.section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; padding-top: 22px; margin-bottom: 26px; border-top: 1px solid var(--home-line); }
	.section-heading a { font-size: 13px; }
	.photo-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 28px; align-items: start; }
	.recent-events { margin: 70px 0 40px; }
	.event-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 24px; }
	.contact-line { display: flex; gap: 28px; padding: 26px 0; margin-top: 30px; font-size: 13px; border-top: 1px solid var(--home-line); }
	.portfolio-viewer { width: min(1060px,100%); max-width: 100%; height: 100dvh; max-height: 100dvh; padding: 20px 28px; border: 0; margin: auto; background: var(--color-charcoal-950); color: #f3f1eb; font-family: Arial, Helvetica, sans-serif; }
	.portfolio-viewer::backdrop { background: #000d; }
	.portfolio-viewer[open] { display: flex; flex-direction: column; gap: 16px; }
	.viewer-controls, .viewer-paging { display: flex; align-items: center; justify-content: space-between; font-size: 13px; flex: none; }
	.portfolio-viewer button { background: transparent; color: inherit; border: 1px solid #484848; padding: 10px 15px; min-height: 44px; cursor: pointer; }
	.portfolio-viewer figure { margin: 0; flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; gap: 12px; }
	.portfolio-viewer figure img { min-height: 0; flex: 1; object-fit: contain; width: 100%; height: 100%; }
	.portfolio-viewer figcaption { flex: none; text-align: center; font-size: 12px; color: #b9b7b0; }
	@media (max-width: 1000px) { .photo-home { padding-inline: 28px; } .opening { gap: 50px; } .opening-side { padding-top: 0; } .intro { margin-bottom: 30px; } .photo-grid { gap: 20px; } }
	@media (max-width: 700px) {
		.photo-home { padding-inline: 20px; }
		.opening { display: flex; flex-direction: column; gap: 24px; margin: 24px 0 40px; }
		.opening-side { display: contents; }
		.intro { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
		.lead-photo { order: 0; max-width: none; }
		.lead-photo .photograph, .lead-photo figcaption { width: 200px; max-width: 100%; margin-left: auto; margin-right: auto; }
		.finder { order: 1; width: 100%; }
		.finder h2 { font-size: 21px; margin-bottom: 14px; }
		.latest-event { order: 2; width: 100%; margin-top: 0; }
		.photo-grid { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 18px; }
		.section-heading { align-items: flex-start; flex-direction: column; gap: 8px; margin-bottom: 20px; }
		.section-heading h2 { font-size: 21px; }
		.recent-events { margin-top: 42px; margin-bottom: 30px; }
		.event-grid { grid-template-columns: 1fr; gap: 24px; }
		.portfolio-viewer { padding: 16px; gap: 12px; }
	}
	@media (max-width: 360px) { .lead-photo .photograph, .lead-photo figcaption { width: 170px; } }
	@media (forced-colors: active) { .search-line, .portfolio-viewer button { border: 1px solid CanvasText; } }
</style>
