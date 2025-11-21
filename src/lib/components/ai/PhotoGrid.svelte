<script lang="ts">
	import { Motion } from 'svelte-motion';
	import { MOTION } from '$lib/motion-tokens';

	interface Photo {
		image_key: string;
		thumbnail_url: string | null;
		sport_type?: string;
		play_type?: string;
		photo_category?: string;
	}

	interface Props {
		photos: Photo[];
	}

	let { photos }: Props = $props();

	// Format display label for photo
	function getPhotoLabel(photo: Photo): string {
		const parts = [];
		if (photo.sport_type) parts.push(photo.sport_type);
		if (photo.play_type) parts.push(photo.play_type);
		if (photo.photo_category) parts.push(photo.photo_category);
		return parts.join(' • ') || 'Photo';
	}
</script>

<div class="mt-3 pt-3 border-t border-white/10 dark:border-black/10">
	<p class="text-xs opacity-70 mb-2">Found {photos.length} photo{photos.length !== 1 ? 's' : ''}</p>
	<div class="grid grid-cols-2 md:grid-cols-3 gap-2">
		{#each photos as photo, i}
			<Motion
				let:motion
				initial={{ opacity: 0, scale: 0.9 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ ...MOTION.spring.gentle, delay: i * 0.05 }}
			>
				<a
					use:motion
					href={`/photo/{photo.image_key}`}
					target="_blank"
					rel="noopener noreferrer"
					class="group relative aspect-square bg-black/20 rounded-lg overflow-hidden border border-white/10 hover:border-white/30 transition-all hover:scale-105"
					title={getPhotoLabel(photo)}
				>
					{#if photo.thumbnail_url}
						<img
							src={photo.thumbnail_url}
							alt={getPhotoLabel(photo)}
							class="w-full h-full object-cover"
							loading="lazy"
						/>
						<!-- Overlay with metadata -->
						<div
							class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2"
						>
							<span class="text-white text-xs font-medium truncate">
								{getPhotoLabel(photo)}
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
			</Motion>
		{/each}
	</div>
</div>
