<!--
  VideoCard Component - Cloudflare Stream Video Thumbnail

  Shows a video thumbnail with play icon overlay and duration badge.
  Pure CSS transitions for performance (matches PhotoCard pattern).

  The label is the clip's position, not `video.title` — that column holds the source filename,
  and this card used to render it, so 94 of these read "lpo-bell-pepper(65)-4.MP4". See
  $lib/video/video-label.
-->

<script lang="ts">
	import type { Video } from '$types/photo';
	import { clipAriaLabel, clipLabel, formatDuration } from '$lib/video/video-label';

	interface Props {
		video: Video;
		index?: number;
		onclick?: (video: Video) => void;
	}

	let { video, index = 0, onclick }: Props = $props();

	function handleClick(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		onclick?.(video);
	}
</script>

<button
	type="button"
	class="video-card group relative aspect-video bg-charcoal-900 rounded-lg overflow-hidden border border-charcoal-800 transition-all cursor-pointer outline-none block w-full"
	onclick={handleClick}
	aria-label={clipAriaLabel(index, video.duration_seconds)}
>
	<!-- Thumbnail -->
	{#if video.cf_stream_thumbnail}
		<!--
			Decorative: the button around it already carries the accessible name. Labelling both
			makes a screen reader announce the clip twice, and the old value here was the source
			filename anyway.
		-->
		<img
			src={video.cf_stream_thumbnail}
			alt=""
			class="absolute inset-0 w-full h-full object-cover object-center"
			loading="lazy"
		/>
	{:else}
		<div class="absolute inset-0 flex items-center justify-center bg-charcoal-800">
			<span class="text-sm text-charcoal-500 font-medium uppercase tracking-wide">Video</span>
		</div>
	{/if}

	<!-- Play icon overlay -->
	<div class="absolute inset-0 flex items-center justify-center">
		<div class="play-icon w-14 h-14 rounded-full flex items-center justify-center bg-black/60 backdrop-blur-sm border border-white/20 transition-all">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" class="text-white ml-1">
				<path d="M8 5v14l11-7z" />
			</svg>
		</div>
	</div>

	<!-- Bottom gradient + info -->
	<div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3 pt-8">
		<div class="flex items-end justify-between">
			<span class="text-xs text-white/90 truncate mr-2">{clipLabel(index)}</span>
			{#if video.duration_seconds}
				<span class="text-[10px] text-white bg-black/60 px-1.5 py-0.5 rounded shrink-0 font-medium tabular-nums">
					{formatDuration(video.duration_seconds)}
				</span>
			{/if}
		</div>
	</div>
</button>

<style>
	.video-card {
		will-change: transform, border-color;
	}

	.video-card:hover,
	.video-card:focus-visible {
		transform: translateY(-4px) scale(1.02);
		border-color: rgba(212, 175, 55, 0.5);
		box-shadow: 0 12px 24px -6px rgba(0, 0, 0, 0.3);
	}

	.video-card:hover .play-icon {
		background-color: rgba(212, 175, 55, 0.8);
		border-color: rgba(212, 175, 55, 1);
	}

	.video-card:focus-visible {
		border-color: rgb(212, 175, 55);
		box-shadow:
			0 12px 24px -6px rgba(0, 0, 0, 0.3),
			0 0 0 2px rgba(212, 175, 55, 0.5);
	}

	@media (prefers-reduced-motion: reduce) {
		.video-card {
			transition: none !important;
		}
		.video-card:hover,
		.video-card:focus-visible {
			transform: none !important;
		}
	}
</style>
