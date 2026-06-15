<!--
  VideoPlayer Component - Cloudflare Stream Embed

  Full-screen modal with CF Stream iframe for adaptive bitrate playback.
  Closes on backdrop click or Escape key.
-->

<script lang="ts">
	import type { Video } from '$types/photo';
	import { base } from '$app/paths';

	interface Props {
		video: Video;
		open: boolean;
		onclose?: () => void;
	}

	let { video, open = $bindable(false), onclose }: Props = $props();

	const CF_STREAM_SUBDOMAIN = 'mztsxz382jswgq00';

	let streamUrl = $derived(
		`https://customer-${CF_STREAM_SUBDOMAIN}.cloudflarestream.com/${video.cf_stream_id}/iframe`
	);
	// Same-origin proxy (src/routes/api/video/[streamId]/download) — the Stream
	// download endpoint isn't CORS-fetchable, so we route through our origin for
	// both the forced download and the share-to-Instagram blob fetch.
	let downloadUrl = $derived(
		`${base}/api/video/${video.cf_stream_id}/download?name=${encodeURIComponent(video.title || 'video')}`
	);

	// Web Share with files works on mobile (where Instagram lives); feature-detect
	// so the button only appears where it can actually hand off a file.
	let canShareFiles = $state(false);
	let sharing = $state(false);
	$effect(() => {
		canShareFiles =
			typeof navigator !== 'undefined' &&
			typeof navigator.canShare === 'function' &&
			(() => {
				try {
					return navigator.canShare({ files: [new File([], 't.mp4', { type: 'video/mp4' })] });
				} catch {
					return false;
				}
			})();
	});

	async function shareVideo() {
		if (sharing) return;
		sharing = true;
		try {
			const res = await fetch(downloadUrl);
			if (!res.ok) throw new Error('fetch failed');
			const blob = await res.blob();
			const file = new File([blob], `${(video.title || 'video').replace(/[^\w.\- ]+/g, '_')}.mp4`, {
				type: 'video/mp4'
			});
			if (navigator.canShare?.({ files: [file] })) {
				await navigator.share({ files: [file], title: video.title || 'Bell Pepper Open' });
			} else {
				window.open(downloadUrl, '_blank'); // fallback: hand them the file to post manually
			}
		} catch (err) {
			// user-cancelled share throws AbortError — ignore; otherwise fall back to download
			if ((err as Error)?.name !== 'AbortError') window.open(downloadUrl, '_blank');
		} finally {
			sharing = false;
		}
	}

	function handleClose() {
		open = false;
		onclose?.();
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			handleClose();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			handleClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- Backdrop -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm"
		onclick={handleBackdropClick}
		role="dialog"
		aria-label={video.title || 'Video player'}
		aria-modal="true"
	>
		<!-- Share button (mobile: hands the file to the OS share sheet → Instagram etc.) -->
		{#if canShareFiles}
			<button
				type="button"
				onclick={(e) => { e.stopPropagation(); shareVideo(); }}
				disabled={sharing}
				class="absolute top-4 right-28 z-10 w-10 h-10 rounded-full flex items-center justify-center bg-charcoal-800/80 text-white hover:bg-charcoal-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 disabled:opacity-50"
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

		<!-- Download button -->
		<a
			href={downloadUrl}
			download={`${video.title || 'video'}`}
			onclick={(e) => e.stopPropagation()}
			class="absolute top-4 right-16 z-10 w-10 h-10 rounded-full flex items-center justify-center bg-charcoal-800/80 text-white hover:bg-charcoal-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
			aria-label="Download video"
			title="Download video"
		>
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" />
			</svg>
		</a>

		<!-- Close button -->
		<button
			type="button"
			onclick={handleClose}
			class="absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center bg-charcoal-800/80 text-white hover:bg-charcoal-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
			aria-label="Close video"
		>
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M18 6L6 18M6 6l12 12" />
			</svg>
		</button>

		<!-- Video container: fill the viewport so the Stream player scales the clip
		     to fit — portrait reels play near-full-height, landscape at full width
		     (no fixed 16:9 box shrinking vertical videos). -->
		<div class="relative mx-4 h-[88vh] w-full max-w-6xl overflow-hidden rounded-lg">
			<iframe
				src={streamUrl}
				class="absolute inset-0 w-full h-full"
				allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
				allowfullscreen
				title={video.title || 'Video'}
			></iframe>
		</div>

		<!-- Title -->
		{#if video.title}
			<p class="absolute bottom-6 left-0 right-0 text-center text-sm text-white/80">
				{video.title}
			</p>
		{/if}
	</div>
{/if}
