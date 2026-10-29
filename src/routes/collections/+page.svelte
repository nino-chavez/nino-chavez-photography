<script lang="ts">
	import { base } from '$app/paths';
	import { Sparkles } from 'lucide-svelte';
	import { cfImageUrl, cfSrcSet, hasCFImage } from '$lib/utils/cloudflare-images';
	import Typography from '$lib/components/ui/Typography.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import PhotoDetailModal from '$lib/components/gallery/PhotoDetailModal.svelte';
	import CollectionCard from '$lib/components/gallery/CollectionCard.svelte';
	import type { PageData } from './$types';
	import type { Photo } from '$types/photo';

	// Svelte 5 Runes: $props to receive server data
	let { data }: { data: PageData } = $props();

	// Modal state
	let modalOpen = $state(false);
	let selectedPhoto = $state<Photo | null>(null);

	function handlePhotoClick(photo: Photo) {
		selectedPhoto = photo;
		modalOpen = true;
	}

	// $effect for side effects
	$effect(() => {
		console.log('[Collections] Loaded:', {
			totalCollections: data.collections.length,
			totalPhotos: data.stats.totalPhotos,
		});
	});
</script>

<svelte:head>

	<!-- Preload first 3 collection cover images for LCP optimization -->
	{#each data.collections.slice(0, 3) as collection, i}
		{#if hasCFImage(collection.coverPhoto?.cf_image_id)}
			<link
				rel="preload"
				as="image"
				imagesrcset={cfSrcSet(collection.coverPhoto!.cf_image_id!)}
				imagesizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
				fetchpriority={i === 0 ? "high" : "low"}
			/>
		{/if}
	{/each}
</svelte:head>

<div class="collections-page collections-animate">
	<header class="collections-opening">
		<p class="collections-eyebrow">Selected work</p>
		<div class="collections-title-row">
			<div>
				<h1>Collections</h1>
				<p>Browse photographs grouped by a shared moment, style, or point of view.</p>
			</div>
			<p class="collections-count">{data.stats.totalCollections} collections · {data.stats.totalPhotos} photos</p>
		</div>
	</header>

	<!-- Collections Content -->
	<div class="collections-content">

		<!-- Collections Grid - 3x3 on desktop -->
		<div class="collections-grid">
			{#each data.collections as collection, index}
				<div class="collection-card-animate" style="--delay: {index * 0.05}s">
					<CollectionCard
						{collection}
						href="{base}/collections/{collection.slug}"
						priority={index < 3}
					/>
				</div>
			{/each}
		</div>

		<!-- Empty State -->
		{#if data.collections.length === 0}
			<Card padding="lg" class="text-center collections-animate">
				<Sparkles class="w-16 h-16 text-charcoal-600 mx-auto mb-4" aria-hidden="true" />
				<Typography variant="h3" class="mb-2">No Collections Yet</Typography>
				<Typography variant="body" class="text-charcoal-400 text-sm">
					Collections appear once photos are enriched
				</Typography>
			</Card>
		{/if}
	</div>
</div>

<style>
	/* PERFORMANCE: CSS animation instead of svelte-motion */
	@keyframes collections-slide-in {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes card-slide-in {
		from {
			opacity: 0;
			transform: translateY(30px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.collections-animate {
		animation: collections-slide-in 0.3s ease-out forwards;
	}

	.collection-card-animate {
		animation: card-slide-in 0.3s ease-out forwards;
		animation-delay: var(--delay, 0s);
		opacity: 0;
	}
	.collections-opening, .collections-content { width: min(1320px, calc(100% - 64px)); margin-inline: auto; }
	.collections-opening { padding-block: 40px 30px; border-bottom: 1px solid var(--color-charcoal-800); }
	.collections-eyebrow { margin-bottom: 14px; color: var(--color-gold-500); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
	.collections-title-row { display: flex; align-items: end; justify-content: space-between; gap: 24px; }
	.collections-title-row h1 { margin: 0; color: var(--color-charcoal-50); font-family: Montserrat, sans-serif; font-size: clamp(32px, 3.2vw, 46px); font-weight: 750; line-height: 1.08; letter-spacing: -.035em; }
	.collections-title-row > div > p { max-width: 620px; margin-top: 12px; color: var(--color-charcoal-300); font-size: 16px; }
	.collections-count { color: var(--color-charcoal-300); font-size: 14px; white-space: nowrap; }
	.collections-content { padding-block: 24px 72px; }
	.collections-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
	@media (max-width: 860px) { .collections-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
	@media (max-width: 600px) {
		.collections-opening, .collections-content { width: calc(100% - 40px); }
		.collections-opening { padding-block: 24px 22px; }
		.collections-title-row { align-items: start; flex-direction: column; gap: 12px; }
		.collections-count { white-space: normal; }
		.collections-grid { grid-template-columns: 1fr; gap: 8px; }
	}

	/* Reduce motion for accessibility */
	@media (prefers-reduced-motion: reduce) {
		.collections-animate,
		.collection-card-animate {
			animation: none;
			opacity: 1;
		}
	}
</style>

<!-- Photo Detail Modal -->
<PhotoDetailModal bind:open={modalOpen} photo={selectedPhoto} viewSource="collection" />
