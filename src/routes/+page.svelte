<script lang="ts">
	import { base } from '$app/paths';
	import { onDestroy } from 'svelte';
	import { portfolio, photoStrip, type PortfolioPhoto } from '$lib/portfolio';
	import type { LatestApiAlbum } from '$lib/albums/latest';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let viewer = $state<HTMLDialogElement>();
	let selected = $state(0);
	let viewerPhotos = $state<readonly PortfolioPhoto[]>(portfolio);
	let currentPhoto = $derived(viewerPhotos[selected]);
	let trigger: HTMLElement | null = null;
	let previousOverflow = '';

	function openPhoto(event: MouseEvent, index: number, photos: readonly PortfolioPhoto[] = portfolio) {
		event.preventDefault();
		trigger = event.currentTarget as HTMLElement;
		viewerPhotos = photos;
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
	function advance(delta: number) { selected = (selected + delta + viewerPhotos.length) % viewerPhotos.length; }
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
	function scrollFrame(event: MouseEvent, delta: number) {
		const opening = (event.currentTarget as HTMLElement).closest('.opening');
		const strip = opening?.querySelector<HTMLElement>('.filmstrip');
		if (!strip) return;
		moveFrame(strip, delta);
	}
	function moveFrame(strip: HTMLElement, delta: number) {
		const frames = Array.from(strip.querySelectorAll<HTMLElement>('.photograph'));
		const index = frames.reduce((nearest, frame, i) =>
			Math.abs(frame.offsetLeft - strip.scrollLeft) < Math.abs(frames[nearest].offsetLeft - strip.scrollLeft) ? i : nearest, 0);
		const target = frames[Math.max(0, Math.min(frames.length - 1, index + delta))];
		strip.scrollTo({ left: target.offsetLeft, behavior: 'instant' });
	}
	let galleries = $derived(data.lead ? [data.lead, ...data.recent].slice(0, 4) : data.recent);
	function albumHref(album: LatestApiAlbum) { return new URL(album.url).pathname; }
</script>

{#snippet galleryLink(album: LatestApiAlbum)}
	<a class="event" href={albumHref(album)} data-sveltekit-preload-data="tap">
		{#if album.cover_url}<img src={album.cover_url} alt="" width="82" height="123" loading="lazy" />{:else}<span class="no-cover" aria-hidden="true">Gallery</span>{/if}
		<span class="event-text"><span class="event-meta">{#if album.photo_count > 0}{album.photo_count.toLocaleString()} photos{/if}</span><span class="event-title">{album.album_name}</span><span class="event-action">Open gallery <span aria-hidden="true">→</span></span></span>
	</a>
{/snippet}

{#snippet opening(photos: readonly PortfolioPhoto[], device: 'desktop' | 'mobile')}
	<section class="opening {device}" aria-label="Featured photographs">
		<div class="filmstrip" role="region" aria-label="Photographs. Scroll horizontally or use the previous and next buttons.">
			{#each photos as photo, i (photo.src)}
				<a class="photograph" href={`${base}${photo.src}`} onclick={(event) => openPhoto(event, i, photos)} aria-label={`Open photograph: ${photo.alt}`} aria-haspopup="dialog" style:aspect-ratio={`${photo.width} / ${photo.height}`}>
					<img src={`${base}${photo.src}`} alt={photo.alt} width={photo.width} height={photo.height} loading="eager" fetchpriority={i === 0 ? 'high' : 'low'} decoding="sync" />
				</a>
			{/each}
		</div>
		<div class="photo-toolbar"><span>Selected photographs <span class="scroll-hint">· Scroll to explore</span></span><div><button onclick={(event) => scrollFrame(event, -1)} aria-label="Previous photograph in the strip"><span aria-hidden="true">←</span></button><button onclick={(event) => scrollFrame(event, 1)}>Next photograph <span aria-hidden="true">→</span></button></div></div>
	</section>
{/snippet}

<div class="photo-home">
	<h1 class="sr-only">Nino Chavez Photography</h1>
	{@render opening(photoStrip, 'desktop')}
	{@render opening(portfolio, 'mobile')}
	<section class="finder content-width" id="find-event" aria-labelledby="finder-heading">
		<div><h2 id="finder-heading">Find your event</h2><p>Event, team, or date.</p></div>
		<form method="GET" action={`${base}/albums`}>
			<label class="sr-only" for="event-query">Event, team, or date</label>
			<div class="search-line"><input id="event-query" name="q" type="search" placeholder="e.g. Chicago Point Series" /><button type="submit">Search <span aria-hidden="true">→</span></button></div>
		</form>
		<div class="archive-links"><a href={`${base}/albums`}>All events <span aria-hidden="true">→</span></a><a href={`${base}/timeline`}>Browse by date <span aria-hidden="true">→</span></a></div>
	</section>
	<section class="recent-events content-width" aria-labelledby="recent-heading">
		<div class="section-heading"><h2 id="recent-heading">Recent galleries</h2><a href={`${base}/albums`}>All events <span aria-hidden="true">→</span></a></div>
		{#if data.unavailable}<p>Recent galleries are temporarily unavailable. <a href={`${base}/albums`}>Try the event archive.</a></p>
		{:else if galleries.length}<div class="event-grid">{#each galleries as album (album.album_key)}{@render galleryLink(album)}{/each}</div>
		{:else}<p>New event galleries will appear here when they’re published.</p>{/if}
	</section>
	<section id="photographs" class="selected content-width" aria-labelledby="photos-heading">
		<div class="section-heading"><h2 id="photos-heading">Selected photographs</h2><span class="small muted">Open any photograph</span></div>
		<div class="photo-grid">{#each portfolio.slice(0, 6) as photo, i (photo.src)}<a class="photograph" href={`${base}${photo.src}`} onclick={(event) => openPhoto(event, i)} aria-label={`Open photograph: ${photo.alt}`} aria-haspopup="dialog"><img src={`${base}${photo.src}`} alt={photo.alt} width={photo.width} height={photo.height} loading="lazy" decoding="async" /></a>{/each}</div>
	</section>
	<div class="contact-line content-width"><a href="https://ninochavez.co/photography/coverage" data-sveltekit-reload>Event coverage</a><a href="mailto:nino@ninochavez.co">Get in touch</a></div>
</div>

<!-- Static portfolio images have no gallery IDs, so this viewer offers viewing only. -->
<dialog bind:this={viewer} class="portfolio-viewer" aria-labelledby="viewer-caption" onkeydown={viewerKey} onclose={restorePage}>
	<div class="viewer-controls"><span aria-live="polite">{selected + 1} / {viewerPhotos.length}</span><button onclick={() => viewer?.close()}>Close <span aria-hidden="true">×</span></button></div>
	<figure><img src={`${base}${currentPhoto.src}`} alt={currentPhoto.alt} width={currentPhoto.width} height={currentPhoto.height} /><figcaption id="viewer-caption">{currentPhoto.alt}</figcaption></figure>
	<div class="viewer-paging"><button onclick={() => advance(-1)}>← Previous</button><button onclick={() => advance(1)}>Next →</button></div>
</dialog>

<style>
	.photo-home { --home-ink: #f3f1eb; --home-muted: #b9b7b0; --home-line: #484848; font-family: Arial, Helvetica, sans-serif; color: var(--home-ink); font-size: 15px; line-height: 1.5; }
	.photo-home :is(h1,h2,p,figure) { margin: 0; }
	.photo-home h2 { font-family: inherit; font-weight: 400; text-transform: none; font-size: 26px; line-height: 1.25; letter-spacing: -.02em; }
	.photo-home a { color: inherit; text-underline-offset: 5px; text-decoration-thickness: 1px; }
	.photo-home a:hover { text-decoration: underline; }
	.photo-home :is(button,input) { font: inherit; color: inherit; }
	.photo-home button { cursor: pointer; }
	.photo-home :focus-visible, .portfolio-viewer :focus-visible { outline: 2px solid var(--color-gold-400); outline-offset: 5px; }
	.photo-home .small { font-size: 13px; line-height: 1.5; }
	.photo-home .muted { color: var(--home-muted); }
	.content-width { width: min(1440px,100%); padding-inline: 48px; margin-inline: auto; }
	.opening.mobile { display: none; }
	.photograph { display: block; padding: 0; width: 100%; background: transparent; line-height: 0; }
	.photograph img { display: block; width: 100%; height: auto; }
	.filmstrip { display: flex; gap: 6px; height: min(620px,calc(100svh - 220px)); min-height: 350px; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x proximity; scrollbar-width: thin; scrollbar-color: #777 #242424; position: relative; }
	.filmstrip > .photograph { flex: 0 0 auto; width: auto; height: 100%; scroll-snap-align: start; }
	.filmstrip .photograph:focus-visible { outline-offset: -4px; }
	.filmstrip img { width: 100%; height: 100%; max-width: none; object-fit: contain; }
	.photo-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; min-height: 58px; padding: 6px 32px; border-bottom: 1px solid var(--home-line); font-size: 12px; }
	.photo-toolbar > span { color: var(--home-muted); }
	.photo-toolbar > div { display: flex; gap: 16px; align-items: center; }
	.photo-toolbar button { display: inline-flex; align-items: center; justify-content: center; gap: 10px; background: transparent; border: 0; min-height: 44px; min-width: 44px; padding: 8px 0; font-size: 13px; }
	.finder, .selected { scroll-margin-top: calc(var(--gallery-header-height) + 24px); }
	.finder { display: grid; grid-template-columns: 220px 1fr auto; align-items: center; gap: 40px; padding-block: 36px; border-bottom: 1px solid var(--home-line); }
	.finder p { font-size: 13px; color: var(--home-muted); margin-top: 8px; }
	.search-line { display: flex; border-bottom: 1px solid var(--home-ink); background: #222; }
	.search-line input { min-width: 0; width: 100%; padding: 15px 16px; border: 0; background: transparent; border-radius: 0; font-size: 16px; }
	.search-line input::placeholder { color: var(--home-muted); opacity: 1; }
	.search-line button { display: flex; align-items: center; gap: 16px; font-size: 13px; padding: 0 20px; border: 0; background: transparent; }
	.archive-links { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; font-size: 13px; }
	.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 28px; }
	.section-heading a { font-size: 13px; }
	.recent-events, .selected { margin-top: 60px; }
	.event-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 28px; }
	.event { display: flex; flex-direction: column; gap: 18px; text-decoration: none; min-width: 0; }
	.event img { display: block; width: 100%; height: 240px; object-fit: cover; object-position: 50% 35%; }
	.event:hover { text-decoration: none; }
	.event:hover .event-title { text-decoration: underline; text-underline-offset: 4px; }
	.event-text { display: block; }
	.event-meta { display: block; color: var(--home-muted); font-size: 12px; line-height: 1.5; margin-bottom: 8px; }
	.event-title { display: block; font-size: 15px; line-height: 1.5; overflow-wrap: anywhere; }
	.event-action { display: block; font-size: 12px; margin-top: 10px; color: var(--home-muted); }
	.no-cover { min-height: 240px; display: grid; place-items: center; font-size: 12px; background: #222; }
	.photo-grid { display: grid; grid-template-columns: repeat(6,minmax(0,1fr)); gap: 20px; align-items: start; }
	.contact-line { display: flex; gap: 28px; padding-block: 30px; margin-top: 60px; font-size: 13px; border-top: 1px solid var(--home-line); }
	.portfolio-viewer { width: min(1060px,100%); max-width: 100%; height: 100dvh; max-height: 100dvh; padding: 20px 28px; border: 0; margin: auto; background: var(--color-charcoal-950); color: #f3f1eb; font-family: Arial, Helvetica, sans-serif; }
	.portfolio-viewer::backdrop { background: #000d; }
	.portfolio-viewer[open] { display: flex; flex-direction: column; gap: 16px; }
	.viewer-controls, .viewer-paging { display: flex; align-items: center; justify-content: space-between; font-size: 13px; flex: none; }
	.portfolio-viewer button { background: transparent; color: inherit; border: 1px solid #484848; padding: 10px 15px; min-height: 44px; cursor: pointer; }
	.portfolio-viewer figure { margin: 0; flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; gap: 12px; }
	.portfolio-viewer figure img { min-height: 0; flex: 1; object-fit: contain; width: 100%; height: 100%; }
	.portfolio-viewer figcaption { flex: none; text-align: center; font-size: 12px; color: #b9b7b0; }
	@media (max-width: 1000px) {
		.content-width { padding-inline: 28px; }
		.finder { grid-template-columns: 180px 1fr; gap: 24px; }
		.archive-links { grid-column: 2; flex-direction: row; gap: 24px; margin-top: -12px; }
		.event-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
		.event img { height: 300px; }
		.photo-grid { grid-template-columns: repeat(3,minmax(0,1fr)); }
	}
	@media (max-width: 700px) {
		.content-width { padding-inline: 20px; }
		.opening.desktop { display: none; }
		.opening.mobile { display: block; }
		.photo-home h2 { font-size: 23px; }
		.filmstrip { height: min(120vw,calc(100svh - 190px)); min-height: 300px; }
		.photo-toolbar { padding: 4px 20px; min-height: 56px; gap: 8px; font-size: 11px; }
		.photo-toolbar > div { gap: 4px; }
		.photo-toolbar button { font-size: 12px; gap: 6px; }
		.scroll-hint { display: none; }
		.finder { grid-template-columns: 1fr; padding-block: 28px; gap: 20px; }
		.finder p { margin-top: 5px; }
		.archive-links { grid-column: auto; gap: 26px; margin-top: 0; }
		.search-line input { padding: 14px 12px; }
		.search-line button { padding: 0 12px; gap: 8px; }
		.recent-events, .selected { margin-top: 40px; }
		.section-heading { margin-bottom: 22px; }
		.section-heading a, .section-heading .small { font-size: 11px; }
		.event-grid { grid-template-columns: 1fr; gap: 28px; }
		.event { display: grid; grid-template-columns: 98px minmax(0,1fr); gap: 18px; }
		.event img { width: 98px; height: 147px; }
		.event-title { font-size: 14px; }
		.no-cover { min-height: 147px; }
		.photo-grid { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; }
		.contact-line { margin-top: 40px; }
		.portfolio-viewer { padding: 16px; gap: 12px; }
	}
	@media (max-width: 359px) { .content-width, .photo-toolbar { padding-inline: 16px; } }
	@media (forced-colors: active) { .search-line, .portfolio-viewer button { border: 1px solid CanvasText; } }
</style>
