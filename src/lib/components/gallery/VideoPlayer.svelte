<!--
  VideoPlayer Component - Cloudflare Stream Embed

  Full-screen modal with CF Stream iframe. Prev/next navigation across the
  album's videos (buttons + arrow keys), an autoplay toggle that auto-advances
  on end (via the Stream player SDK), per-video share + download.
-->

<script lang="ts">
	import type { Video } from '$types/photo';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';

	interface Props {
		videos: Video[];
		index: number;
		open: boolean;
		onclose?: () => void;
	}

	let { videos, index = $bindable(0), open = $bindable(false), onclose }: Props = $props();

	const CF_STREAM_SUBDOMAIN = 'mztsxz382jswgq00';

	let video = $derived(videos[index]);
	let count = $derived(videos.length);

	// Autoplay/binge mode (persisted). When on, each clip plays muted and we
	// auto-advance when it ends.
	let autoplayNext = $state(false);
	onMount(() => {
		try { autoplayNext = localStorage.getItem('video-autoplay') === '1'; } catch { /* noop */ }
	});
	function toggleAutoplay() {
		autoplayNext = !autoplayNext;
		try { localStorage.setItem('video-autoplay', autoplayNext ? '1' : '0'); } catch { /* noop */ }
	}

	let streamUrl = $derived(
		`https://customer-${CF_STREAM_SUBDOMAIN}.cloudflarestream.com/${video?.cf_stream_id}/iframe` +
			(autoplayNext ? '?autoplay=true&muted=true' : '')
	);
	let downloadUrl = $derived(
		`${base}/api/video/${video?.cf_stream_id}/download?name=${encodeURIComponent(video?.title || 'video')}`
	);

	function next() { if (count) index = (index + 1) % count; }
	function prev() { if (count) index = (index - 1 + count) % count; }

	function handleClose() { open = false; onclose?.(); }
	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) handleClose();
	}
	function handleKeydown(event: KeyboardEvent) {
		if (!open) return;
		if (event.key === 'Escape') handleClose();
		else if (event.key === 'ArrowRight') next();
		else if (event.key === 'ArrowLeft') prev();
	}

	// Auto-advance on end via the Stream player SDK. Re-binds whenever the
	// current clip changes (new iframe) while autoplay is on.
	let iframeEl = $state<HTMLIFrameElement>();
	function loadStreamSdk(): Promise<any> {
		const w = window as any;
		if (w.Stream) return Promise.resolve(w.Stream);
		return new Promise((resolve) => {
			const existing = document.querySelector('script[data-cf-stream-sdk]');
			if (existing) { existing.addEventListener('load', () => resolve(w.Stream)); return; }
			const s = document.createElement('script');
			s.src = 'https://embed.cloudflarestream.com/embed/sdk.latest.js';
			s.setAttribute('data-cf-stream-sdk', '');
			s.onload = () => resolve(w.Stream);
			document.head.appendChild(s);
		});
	}
	$effect(() => {
		if (!open || !autoplayNext || !iframeEl || !video) return;
		let player: any;
		const onEnded = () => next();
		let cancelled = false;
		loadStreamSdk().then((Stream) => {
			if (cancelled || !Stream || !iframeEl) return;
			player = Stream(iframeEl);
			player.addEventListener('ended', onEnded);
		});
		return () => {
			cancelled = true;
			try { player?.removeEventListener('ended', onEnded); } catch { /* noop */ }
		};
	});

	// Per-video share (mobile share sheet → Instagram etc.)
	let canShareFiles = $state(false);
	let sharing = $state(false);
	$effect(() => {
		canShareFiles =
			typeof navigator !== 'undefined' &&
			typeof navigator.canShare === 'function' &&
			(() => { try { return navigator.canShare({ files: [new File([], 't.mp4', { type: 'video/mp4' })] }); } catch { return false; } })();
	});
	async function shareVideo() {
		if (sharing) return;
		sharing = true;
		try {
			const res = await fetch(downloadUrl);
			if (!res.ok) throw new Error('fetch failed');
			const blob = await res.blob();
			const file = new File([blob], `${(video.title || 'video').replace(/[^\w.\- ]+/g, '_')}.mp4`, { type: 'video/mp4' });
			if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: video.title || 'Bell Pepper Open' });
			else window.open(downloadUrl, '_blank');
		} catch (err) {
			if ((err as Error)?.name !== 'AbortError') window.open(downloadUrl, '_blank');
		} finally { sharing = false; }
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open && video}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm"
		onclick={handleBackdropClick}
		role="dialog"
		aria-label={video.title || 'Video player'}
		aria-modal="true"
	>
		<!-- Top controls -->
		<div class="absolute top-4 right-4 z-10 flex items-center gap-2">
			<!-- Autoplay toggle -->
			<button
				type="button"
				onclick={(e) => { e.stopPropagation(); toggleAutoplay(); }}
				class="h-10 rounded-full px-4 flex items-center gap-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 {autoplayNext ? 'bg-gold-500 text-charcoal-900' : 'bg-charcoal-800/80 text-white hover:bg-charcoal-700'}"
				aria-pressed={autoplayNext}
				title="Autoplay next"
			>
				Autoplay {autoplayNext ? 'On' : 'Off'}
			</button>

			{#if canShareFiles}
				<button
					type="button"
					onclick={(e) => { e.stopPropagation(); shareVideo(); }}
					disabled={sharing}
					class="w-10 h-10 rounded-full flex items-center justify-center bg-charcoal-800/80 text-white hover:bg-charcoal-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 disabled:opacity-50"
					aria-label="Share video"
					title="Share to Instagram / social"
				>
					{#if sharing}
						<svg class="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.2-8.6" stroke-linecap="round" /></svg>
					{:else}
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>
					{/if}
				</button>
			{/if}

			<!-- Download -->
			<a
				href={downloadUrl}
				download={`${video.title || 'video'}`}
				onclick={(e) => e.stopPropagation()}
				class="w-10 h-10 rounded-full flex items-center justify-center bg-charcoal-800/80 text-white hover:bg-charcoal-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
				aria-label="Download video"
				title="Download video"
			>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
			</a>

			<!-- Close -->
			<button
				type="button"
				onclick={handleClose}
				class="w-10 h-10 rounded-full flex items-center justify-center bg-charcoal-800/80 text-white hover:bg-charcoal-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
				aria-label="Close video"
			>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
			</button>
		</div>

		<!-- Prev / Next (when more than one video) -->
		{#if count > 1}
			<button
				type="button"
				onclick={(e) => { e.stopPropagation(); prev(); }}
				class="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full flex items-center justify-center bg-charcoal-800/80 text-white hover:bg-charcoal-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
				aria-label="Previous video"
			>
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
			</button>
			<button
				type="button"
				onclick={(e) => { e.stopPropagation(); next(); }}
				class="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full flex items-center justify-center bg-charcoal-800/80 text-white hover:bg-charcoal-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
				aria-label="Next video"
			>
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6" /></svg>
			</button>
		{/if}

		<!-- Video container: fill the viewport so portrait reels play near-full-height -->
		{#key video.cf_stream_id}
			<div class="relative mx-12 sm:mx-16 h-[86vh] w-full max-w-6xl overflow-hidden rounded-lg">
				<iframe
					bind:this={iframeEl}
					src={streamUrl}
					class="absolute inset-0 w-full h-full"
					allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
					allowfullscreen
					title={video.title || 'Video'}
				></iframe>
			</div>
		{/key}

		<!-- Title + position -->
		<p class="absolute bottom-5 left-0 right-0 text-center text-sm text-white/80">
			{video.title || ''}{#if count > 1}<span class="text-white/50"> · {index + 1} / {count}</span>{/if}
		</p>
	</div>
{/if}
