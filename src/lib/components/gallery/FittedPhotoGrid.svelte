<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Photo } from '$types/photo';
	import { createFittedPhotoLayout } from '$lib/gallery/photo-row-layout';

	interface Props {
		photos: Photo[];
		children: Snippet<[Photo, number, string]>;
		mobileColumns?: 1 | 2;
		gap?: number;
		mobileGap?: number;
		class?: string;
	}

	let {
		photos,
		children,
		mobileColumns = 2,
		gap = 6,
		mobileGap = 4,
		class: className = ''
	}: Props = $props();

	let layout = $derived(createFittedPhotoLayout(photos));

	function imageSizes(shares: Record<1 | 2 | 3 | 4, number>): string {
		// The viewport bounds the grid width. Per-row shares also cover wide mixed-row images.
		return `(max-width: 639px) ${shares[mobileColumns] * 100}vw, (max-width: 900px) ${shares[3] * 100}vw, ${shares[4] * 100}vw`;
	}
</script>

<div
	class={[
		'fitted-photo-grid',
		className,
		{ 'fitted-photo-grid--mobile-one': mobileColumns === 1 }
	]}
	style:--fitted-gap={`${gap}px`}
	style:--fitted-mobile-gap={`${mobileGap}px`}
	role="list"
	aria-label="Photo gallery"
>
	{#each layout as item (item.photo.id)}
		<div
			class="fitted-photo-grid__item"
			style:--fitted-aspect-ratio={item.aspectRatio}
			style:--fitted-share-1={item.shares[1]}
			style:--fitted-share-2={item.shares[2]}
			style:--fitted-share-3={item.shares[3]}
			style:--fitted-share-4={item.shares[4]}
			role="listitem"
		>
			{@render children(item.photo, item.index, imageSizes(item.shares))}
		</div>
	{/each}
</div>

<style>
	.fitted-photo-grid {
		--fitted-row-gap: var(--fitted-mobile-gap);
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--fitted-mobile-gap);
	}

	.fitted-photo-grid__item {
		--fitted-share: var(--fitted-share-2);
		min-width: 0;
		flex: 0 0 calc((100% - var(--fitted-row-gap)) * var(--fitted-share) - 0.02px);
		aspect-ratio: var(--fitted-aspect-ratio);
	}

	@media (max-width: 639px) {
		.fitted-photo-grid--mobile-one .fitted-photo-grid__item {
			--fitted-share: var(--fitted-share-1);
			--fitted-row-gap: 0px;
		}
	}

	@media (min-width: 640px) {
		.fitted-photo-grid {
			--fitted-row-gap: calc(var(--fitted-gap) * 2);
			gap: var(--fitted-gap);
		}
		.fitted-photo-grid__item { --fitted-share: var(--fitted-share-3); }
	}

	@media (min-width: 901px) {
		.fitted-photo-grid {
			--fitted-row-gap: calc(var(--fitted-gap) * 3);
		}
		.fitted-photo-grid__item { --fitted-share: var(--fitted-share-4); }
	}
</style>
