<!--
  VideoPlayer Component - Cloudflare Stream Embed

  Full-screen modal with CF Stream iframe for adaptive bitrate playback.
  Closes on backdrop click or Escape key.
-->

<script lang="ts">
	import type { Video } from '$types/photo';

	interface Props {
		video: Video;
		open: boolean;
		onclose?: () => void;
	}

	let { video, open = $bindable(false), onclose }: Props = $props();

	const CF_STREAM_SUBDOMAIN = import.meta.env.VITE_CF_STREAM_SUBDOMAIN || 'f77l9nwspm9h0g13';

	let streamUrl = $derived(
		`https://customer-${CF_STREAM_SUBDOMAIN}.cloudflarestream.com/${video.cf_stream_id}/iframe`
	);

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

		<!-- Video container -->
		<div class="relative w-full max-w-5xl mx-4 aspect-video rounded-lg overflow-hidden">
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
