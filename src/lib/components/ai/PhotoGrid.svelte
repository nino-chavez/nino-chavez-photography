<script lang="ts">
	import { base } from '$app/paths';
	import type { ChatPhotoResult } from '$lib/ai/chat-photo-result';

	interface Props {
		/** Shaped by the chat endpoint: thumbnail and link are built server-side (see chat-photo-result). */
		photos: ChatPhotoResult[];
	}

	let { photos }: Props = $props();

	/** What a visitor recognizes a result by: the event, not the search facets. */
	function label(photo: ChatPhotoResult): string {
		return photo.album_name || 'Photo';
	}

	/** The caption is one factual sentence about the frame, which is what alt text should be. */
	function altText(photo: ChatPhotoResult): string {
		return photo.caption || label(photo);
	}
</script>

<div class="mt-3 pt-3 border-t border-white/10 dark:border-black/10">
	<p class="text-xs opacity-70 mb-2">
		{photos.length} photo{photos.length !== 1 ? 's' : ''}. Tap one to open it.
	</p>
	<div class="grid grid-cols-2 md:grid-cols-3 gap-2">
		{#each photos as photo, i (photo.url)}
			<a
				href={`${base}${photo.url}`}
				target="_blank"
				rel="noopener noreferrer"
				class="group relative aspect-square bg-black/20 rounded-lg overflow-hidden border border-white/10 hover:border-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 transition-colors duration-200 animate-grid-item-in"
				style="animation-delay: {i * 50}ms"
				title={label(photo)}
			>
				{#if photo.thumbnail_url}
					<img
						src={photo.thumbnail_url}
						alt={altText(photo)}
						width="200"
						height="200"
						class="w-full h-full object-cover transition-transform duration-200 ease-out group-hover:scale-105"
						loading="lazy"
						decoding="async"
					/>
					<!-- Overlay with metadata -->
					<div
						class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity flex items-end p-2"
					>
						<span class="text-white text-xs font-medium truncate">
							{label(photo)}
						</span>
					</div>
				{:else}
					<div
						class="w-full h-full flex items-center justify-center text-xs text-white/40"
					>
						No Preview
					</div>
				{/if}
			</a>
		{/each}
	</div>
</div>

<style>
	@keyframes grid-item-in {
		from {
			opacity: 0;
			transform: scale(0.9);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	.animate-grid-item-in {
		animation: grid-item-in 0.3s ease-out both;
	}
</style>
