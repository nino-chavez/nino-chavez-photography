<!--
  CollectionCard Component - Elegant card with reveal hover effect

  Features:
  - Smooth gradient reveal on hover
  - Content slides up with image zoom
  - Gold accent shine effect
  - Optimized image loading with Cloudflare Images
  - Fully accessible with keyboard navigation
  - Adheres to design system (charcoal/gold theme)

  Usage:
  <CollectionCard
    collection={collection}
    href="/collections/{collection.slug}"
  />
-->

<script lang="ts">
	import { ArrowRight } from 'lucide-svelte';
	import Typography from '$lib/components/ui/Typography.svelte';
	import { cfImageUrl, hasCFImage } from '$lib/utils/cloudflare-images';
	import type { CoverPhotoRow } from '$types/database';

	interface CollectionWithPhotos {
		slug: string;
		title: string;
		narrative: string;
		description: string;
		photoCount: number;
		coverPhoto: CoverPhotoRow | null;
	}

	interface Props {
		collection: CollectionWithPhotos;
		href: string;
		priority?: boolean; // Above-the-fold cards: eager-load so the LCP cover isn't lazy-deferred
	}

	let { collection, href, priority = false }: Props = $props();

	// CF Images for cover
	let coverImageUrl = $derived(
		hasCFImage(collection.coverPhoto?.cf_image_id)
			? cfImageUrl(collection.coverPhoto!.cf_image_id!, 'medium')
			: ''
	);
</script>

<a
	{href}
	data-sveltekit-preload="hover"
	class="collection-card"
	aria-label="View {collection.title} collection with {collection.photoCount} photos"
>
	<!-- Cover Image with Zoom Effect -->
	{#if coverImageUrl}
		<div class="collection-card__media">
			<img
				src={coverImageUrl}
				sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
				alt="{collection.title} cover"
				width="300"
				height="400"
				class="collection-card__image"
				loading={priority ? 'eager' : 'lazy'}
				decoding={priority ? 'sync' : 'async'}
				fetchpriority={priority ? 'high' : 'auto'}
			/>
			<!-- Gradient Overlay - darkens on hover for better text readability -->
			<div class="collection-card__shade"></div>
		</div>
	{:else}
		<!-- Fallback gradient -->
		<div class="collection-card__fallback"></div>
	{/if}

	<!-- Content - Always visible, no sliding -->
	<div class="collection-card__content">
		<p class="collection-card__count">{collection.photoCount} photos</p>

		<!-- Title -->
		<!-- element="h2": collection cards are the items under the page h1; h3 skipped a
		     level. The h3 styling is the design, only the semantics were wrong. -->
		<Typography
			variant="h3"
			element="h2"
			class="collection-card__title line-clamp-2"
		>
			{collection.title}
		</Typography>

		<!-- Description - always visible, no animation -->
		<Typography
			variant="body"
			class="collection-card__description line-clamp-2"
		>
			{collection.description}
		</Typography>

		<!-- View Collection CTA - fades in on hover -->
		<div class="collection-card__cta"><span>View collection</span><ArrowRight class="w-4 h-4" aria-hidden="true" /></div>
	</div>
</a>

<style>
	.collection-card { position: relative; display: block; aspect-ratio: 3 / 4; overflow: hidden; border: 1px solid var(--color-charcoal-800); border-radius: 0; background: var(--color-charcoal-900); outline: none; }
	.collection-card:hover { border-color: var(--color-charcoal-700); }
	.collection-card:focus-visible { outline: 2px solid var(--color-gold-500); outline-offset: 4px; }
	.collection-card__media, .collection-card__fallback { position: absolute; inset: 0; }
	.collection-card__fallback { background: var(--color-charcoal-900); }
	.collection-card__image { width: 100%; height: 100%; object-fit: cover; transition: transform .2s ease; }
	.collection-card:hover .collection-card__image { transform: scale(1.025); }
	.collection-card__shade { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,.95), rgba(0,0,0,.08) 74%); }
	.collection-card__content { position: absolute; inset-inline: 0; bottom: 0; padding: 18px; }
	.collection-card__count { margin-bottom: 8px; color: var(--color-gold-400); font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
	.collection-card__content :global(.collection-card__title) { margin-bottom: 7px; color: white; font-family: Montserrat, sans-serif; font-size: 19px; font-weight: 700; line-height: 1.2; overflow-wrap: anywhere; }
	.collection-card__content :global(.collection-card__description) { margin-bottom: 12px; color: var(--color-charcoal-200); font-size: 13px; line-height: 1.45; }
	.collection-card__cta { display: inline-flex; align-items: center; gap: 6px; color: var(--color-gold-400); font-size: 13px; font-weight: 650; }
</style>
