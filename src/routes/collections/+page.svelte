<script lang="ts">
	import { base } from '$app/paths';
	import { Sparkles } from 'lucide-svelte';
	import { cfImageUrl, hasCFImage } from '$lib/utils/cloudflare-images';
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
	<title>Curated Collections — Nino Chavez Photography</title>
	<meta name="description" content="Explore curated photography collections showcasing the best moments, emotions, and stories from volleyball tournaments and events." />

	<!-- Preload first 3 collection cover images for LCP optimization -->
	{#each data.collections.slice(0, 3) as collection, i}
		{@const preloadUrl = hasCFImage(collection.coverPhoto?.cf_image_id)
			? cfImageUrl(collection.coverPhoto!.cf_image_id!, 'medium')
			: null}
		{#if preloadUrl}
			<link
				rel="preload"
				as="image"
				href={preloadUrl}
				fetchpriority={i === 0 ? "high" : "low"}
			/>
		{/if}
	{/each}
</svelte:head>

<!-- PERFORMANCE: CSS animation instead of svelte-motion -->
<div class="collections-animate">
	<!-- Minimal Header - Content First Design -->
	<div class="sticky top-0 z-20 bg-charcoal-950/95 backdrop-blur-sm border-b border-charcoal-800/50">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
			<!-- Compact Header with Inline Stats -->
			<div class="flex items-center gap-3 flex-wrap">
				<Typography variant="h1" class="text-xl lg:text-2xl">Collections</Typography>

				<!-- Inline stats -->
				<div class="flex items-center gap-3 text-xs text-charcoal-400">
					<span class="flex items-center gap-1">
						<Sparkles class="w-3 h-3 text-gold-500" />
						<span class="text-gold-500 font-medium">{data.stats.totalCollections}</span>
					</span>
					<span>·</span>
					<span>{data.stats.totalPhotos} curated photos</span>
				</div>
			</div>
		</div>
	</div>

	<!-- Collections Content -->
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

		<!-- Collections Grid - 3x3 on desktop -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			{#each data.collections as collection, index}
				<div class="collection-card-animate" style="--delay: {index * 0.05}s">
					<CollectionCard
						{collection}
						href="{base}/collections/{collection.slug}"
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
<PhotoDetailModal bind:open={modalOpen} photo={selectedPhoto} />
