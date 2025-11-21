<script lang="ts">
	type Photo = {
		image_key: string;
		thumbnail_url: string | null;
        sport_type?: string;
        play_type?: string;
	};

	export let photos: Photo[];
</script>

<div class="my-2 grid grid-cols-2 md:grid-cols-3 gap-2">
	{#each photos as photo}
		<a
			href={`/photo/${photo.image_key}`}
			target="_blank"
			rel="noopener noreferrer"
			class="aspect-square bg-gray-700/50 rounded-md overflow-hidden hover:opacity-80 transition-opacity"
			title={`View photo ${photo.image_key}`}
		>
			{#if photo.thumbnail_url}
				<img
					src={photo.thumbnail_url}
					alt={`Thumbnail for ${photo.play_type || photo.sport_type || 'photo'}`}
					class="w-full h-full object-cover"
				/>
			{:else}
                <div class="w-full h-full flex items-center justify-center text-xs text-gray-400">
                    No Preview
                </div>
            {/if}
		</a>
	{/each}
</div>
