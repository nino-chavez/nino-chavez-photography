<script lang="ts">
	import { Heart } from 'lucide-svelte';
	import { favorites } from '$lib/stores/favorites.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import type { Photo } from '$types/photo';

	interface Props {
		photo: Photo;
		variant?: 'default' | 'compact' | 'icon-only';
		class?: string;
	}

	let { photo, variant = 'default', class: className = '' }: Props = $props();

	// Reactive favorite status
	const isFavorited = $derived(favorites.isFavorite(photo.image_key));

	function handleClick(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();

		try {
			favorites.toggleFavorite(photo);
		} catch (error) {
			if (error instanceof Error) {
				toast.error(error.message); // Show limit error to user
			}
		}
	}
</script>

{#if variant === 'icon-only'}
	<!-- Icon Only (for overlays) -->
	<button
		onclick={handleClick}
		class="favorite-btn-icon p-2 rounded-full min-w-[44px] min-h-[44px] flex items-center justify-center {isFavorited
			? 'bg-red-500/90'
			: 'bg-white/10 hover:bg-white/20'} backdrop-blur-sm transition-colors {className}"
		aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
		title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
	>
		<Heart
			class="w-5 h-5 {isFavorited ? 'text-white fill-white' : 'text-white'}"
		/>
	</button>
{:else if variant === 'compact'}
	<!-- Compact Button (for toolbars) -->
	<button
		onclick={handleClick}
		class="favorite-btn p-2.5 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center {isFavorited
			? 'bg-red-500 hover:bg-red-600'
			: 'bg-charcoal-900 border border-charcoal-800 hover:border-red-500/50 hover:bg-red-500/10'} transition-colors group {className}"
		aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
		title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
	>
		<Heart
			class="w-4 h-4 {isFavorited ? 'text-white fill-white' : 'text-charcoal-300 group-hover:text-red-500'}"
		/>
	</button>
{:else}
	<!-- Default Full Button -->
	<button
		onclick={handleClick}
		class="favorite-btn flex items-center gap-2 px-4 py-2.5 rounded-lg {isFavorited
			? 'bg-red-500 hover:bg-red-600 text-white'
			: 'bg-charcoal-900 border border-charcoal-800 hover:border-red-500/50 hover:bg-red-500/10 text-charcoal-300 hover:text-red-500'} font-medium transition-colors {className}"
		aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
	>
		<Heart
			class="w-5 h-5 {isFavorited ? 'fill-white' : ''}"
		/>
		<span>{isFavorited ? 'Favorited' : 'Add to Favorites'}</span>
	</button>
{/if}

<style>
	.favorite-btn {
		transition: transform 0.15s ease-out;
	}
	.favorite-btn:hover {
		transform: scale(1.05);
	}
	.favorite-btn:active {
		transform: scale(0.95);
	}
	.favorite-btn-icon {
		transition: transform 0.15s ease-out;
	}
	.favorite-btn-icon:hover {
		transform: scale(1.1);
	}
	.favorite-btn-icon:active {
		transform: scale(0.9);
	}
</style>
