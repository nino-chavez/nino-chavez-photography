<script lang="ts">
	import { base } from '$app/paths';
	import { onDestroy } from 'svelte';
	import { portfolio, photoStrip, rotatePortfolio, type PortfolioPhoto } from '$lib/portfolio';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let desktopPhotos = $derived(rotatePortfolio(photoStrip, data.photoStart));

	let viewer = $state<HTMLDialogElement>();
	let selected = $state(0);
	let viewerPhotos = $state<readonly PortfolioPhoto[]>(portfolio);
	let currentPhoto = $derived(viewerPhotos[selected]);
	let trigger: HTMLElement | null = null;
	let previousOverflow = '';

	function openPhoto(event: MouseEvent, index: number, photos: readonly PortfolioPhoto[]) {
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
	function advance(delta: number) {
		selected = (selected + delta + viewerPhotos.length) % viewerPhotos.length;
	}
	function viewerKey(event: KeyboardEvent) {
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			advance(1);
		}
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			advance(-1);
		}
		if (event.key === 'Tab' && viewer) {
			const controls = viewer.querySelectorAll<HTMLButtonElement>('button');
			const first = controls[0];
			const last = controls[controls.length - 1];
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			}
			if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}
	}
	onDestroy(() => {
		if (typeof document !== 'undefined' && viewer?.open) document.body.style.overflow = previousOverflow;
	});
	function scrollFrame(event: MouseEvent, delta: number) {
		const opening = (event.currentTarget as HTMLElement).closest('.opening');
		const strip = opening?.querySelector<HTMLElement>('.filmstrip');
		if (!strip) return;
		moveFrame(strip, delta);
	}
	function moveFrame(strip: HTMLElement, delta: number) {
		const frames = Array.from(strip.querySelectorAll<HTMLElement>('.photograph'));
		const index = frames.reduce(
			(nearest, frame, i) =>
				Math.abs(frame.offsetLeft - strip.scrollLeft) < Math.abs(frames[nearest].offsetLeft - strip.scrollLeft) ? i : nearest,
			0
		);
		const target = frames[Math.max(0, Math.min(frames.length - 1, index + delta))];
		strip.scrollTo({ left: target.offsetLeft, behavior: 'instant' });
	}
</script>

{#snippet opening(photos: readonly PortfolioPhoto[], device: 'desktop' | 'mobile')}
	<section class="opening {device}" aria-label="Featured photographs">
		<div class="filmstrip" role="region" aria-label="Photographs. Scroll horizontally or use the previous and next buttons.">
			{#each photos as photo, i (photo.src)}
				<a
					class="photograph"
					href={`${base}${photo.src}`}
					onclick={(event) => openPhoto(event, i, photos)}
					aria-label={`Open photograph: ${photo.alt}`}
					aria-haspopup="dialog"
					style:aspect-ratio={`${photo.width} / ${photo.height}`}
				>
					<img
						src={`${base}${photo.src}`}
						alt={photo.alt}
						width={photo.width}
						height={photo.height}
						loading="eager"
						fetchpriority={i === 0 ? 'high' : 'low'}
						decoding="sync"
					/>
				</a>
			{/each}
		</div>
		<div class="photo-toolbar">
			<span>Selected Works <span class="scroll-hint">· Scroll to explore</span></span>
			<div>
				<button onclick={(event) => scrollFrame(event, -1)} aria-label="Previous photograph in the strip"
					><span aria-hidden="true">←</span></button
				><button onclick={(event) => scrollFrame(event, 1)}>Next photograph <span aria-hidden="true">→</span></button>
			</div>
		</div>
	</section>
{/snippet}

<div class="photo-home">
	<header class="work-heading">
		<h1>Selected Works</h1>
		<p>Volleyball, action sports, and moments away from the court.</p>
	</header>
	<div id="photographs" class="photo-opening" tabindex="-1">{@render opening(desktopPhotos, 'desktop')}</div>
</div>

<!-- Static portfolio images have no gallery IDs, so this viewer offers viewing only. -->
<dialog bind:this={viewer} class="portfolio-viewer" aria-labelledby="viewer-caption" onkeydown={viewerKey} onclose={restorePage}>
	<div class="viewer-controls">
		<span aria-live="polite">{selected + 1} / {viewerPhotos.length}</span><button onclick={() => viewer?.close()}
			>Close <span aria-hidden="true">×</span></button
		>
	</div>
	<figure>
		<img src={`${base}${currentPhoto.src}`} alt={currentPhoto.alt} width={currentPhoto.width} height={currentPhoto.height} />
		<figcaption id="viewer-caption">{currentPhoto.alt}</figcaption>
	</figure>
	<div class="viewer-paging"><button onclick={() => advance(-1)}>← Previous</button><button onclick={() => advance(1)}>Next →</button></div>
</dialog>

<style>
	.work-heading {
		padding: 32px 48px;
	}
	.work-heading h1 {
		font:
			500 36px/1.2 Montserrat,
			Arial,
			sans-serif;
		letter-spacing: -1px;
	}
	.work-heading p {
		margin-top: 16px !important;
		color: #c1c1bb;
	}
	@media (max-width: 700px) {
		.work-heading {
			padding: 24px 20px;
		}
		.work-heading h1 {
			font-size: 30px;
		}
	}
	.photo-home {
		--home-ink: #f3f1eb;
		--home-muted: #b9b7b0;
		--home-line: #484848;
		font-family: Arial, Helvetica, sans-serif;
		color: var(--home-ink);
		font-size: 15px;
		line-height: 1.5;
	}
	.photo-home :is(h1, p, figure) {
		margin: 0;
	}
	.photo-home a {
		color: inherit;
		text-underline-offset: 5px;
		text-decoration-thickness: 1px;
	}
	.photo-home a:hover {
		text-decoration: underline;
	}
	.photo-home button {
		font: inherit;
		color: inherit;
	}
	.photo-home button {
		cursor: pointer;
	}
	.photo-home :focus-visible,
	.portfolio-viewer :focus-visible {
		outline: 2px solid var(--color-gold-400);
		outline-offset: 5px;
	}
	.opening.mobile {
		display: none;
	}
	.photograph {
		display: block;
		padding: 0;
		width: 100%;
		background: transparent;
		line-height: 0;
	}
	.photograph img {
		display: block;
		width: 100%;
		height: auto;
	}
	.filmstrip {
		display: flex;
		gap: 6px;
		height: min(620px, calc(100svh - 220px));
		min-height: 350px;
		overflow-x: auto;
		overflow-y: hidden;
		scroll-snap-type: x proximity;
		scrollbar-width: thin;
		scrollbar-color: #777 #242424;
		position: relative;
	}
	.filmstrip > .photograph {
		flex: 0 0 auto;
		width: auto;
		height: 100%;
		scroll-snap-align: start;
	}
	.filmstrip .photograph:focus-visible {
		outline-offset: -4px;
	}
	.filmstrip img {
		width: 100%;
		height: 100%;
		max-width: none;
		object-fit: contain;
	}
	.photo-toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		min-height: 58px;
		padding: 6px 32px;
		border-bottom: 1px solid var(--home-line);
		font-size: 12px;
	}
	.photo-toolbar > span {
		color: var(--home-muted);
	}
	.photo-toolbar > div {
		display: flex;
		gap: 16px;
		align-items: center;
	}
	.photo-toolbar button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		background: transparent;
		border: 0;
		min-height: 44px;
		min-width: 44px;
		padding: 8px 0;
		font-size: 13px;
	}
	.photo-opening {
		scroll-margin-top: var(--gallery-header-height);
	}
	.portfolio-viewer {
		width: min(1060px, 100%);
		max-width: 100%;
		height: 100dvh;
		max-height: 100dvh;
		padding: 20px 28px;
		border: 0;
		margin: auto;
		background: var(--color-charcoal-950);
		color: #f3f1eb;
		font-family: Arial, Helvetica, sans-serif;
	}
	.portfolio-viewer::backdrop {
		background: #000d;
	}
	.portfolio-viewer[open] {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.viewer-controls,
	.viewer-paging {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 13px;
		flex: none;
	}
	.portfolio-viewer button {
		background: transparent;
		color: inherit;
		border: 1px solid #484848;
		padding: 10px 15px;
		min-height: 44px;
		cursor: pointer;
	}
	.portfolio-viewer figure {
		margin: 0;
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}
	.portfolio-viewer figure img {
		min-height: 0;
		flex: 1;
		object-fit: contain;
		width: 100%;
		height: 100%;
	}
	.portfolio-viewer figcaption {
		flex: none;
		text-align: center;
		font-size: 12px;
		color: #b9b7b0;
	}
	@media (max-width: 1000px) {
	}
	@media (max-width: 700px) {
		.opening.desktop {
			display: block;
		}
		.opening.mobile {
			display: block;
		}
		.filmstrip {
			height: min(120vw, calc(100svh - 190px));
			min-height: 300px;
		}
		.photo-toolbar {
			padding: 4px 20px;
			min-height: 56px;
			gap: 8px;
			font-size: 11px;
		}
		.photo-toolbar > div {
			gap: 4px;
		}
		.photo-toolbar button {
			font-size: 12px;
			gap: 6px;
		}
		.scroll-hint {
			display: none;
		}
		.portfolio-viewer {
			padding: 16px;
			gap: 12px;
		}
	}
</style>
