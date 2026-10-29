<!--
  AlbumCard Component - Display album with photo count

  Usage:
  <AlbumCard {album} index={0} onclick={handleClick} />
-->

<script lang="ts">
	import { base } from '$app/paths';
	import { Folder, Camera, ArrowRight } from 'lucide-svelte';
	import Typography from '$lib/components/ui/Typography.svelte';
	import { SIZES_PRESETS } from '$lib/photo-utils';
	import { createAlbumSlug } from '$lib/utils';
	import { cfImageUrl, cfSrcSet } from '$lib/utils/cloudflare-images';
	import { exposure } from '$lib/analytics/exposure';
	import { exposeExperiment, trackAnalyticsEventV2 } from '$lib/analytics/client';
	import { ALBUM_CARD_EXPERIMENT_SURFACE, hasAlbumCardCta, type PhotographyExperimentAssignment } from '$lib/analytics/experiments';

	interface Album {
		albumKey: string;
		albumName: string;
		photoCount: number;
		videoCount?: number;
		coverImageUrl: string | null;
		coverCfImageId?: string | null; // Cloudflare Images ID for cover
		sports?: string[];
		categories?: string[];
		primarySport?: string;
		primaryCategory?: string;
	}

	interface Props {
		album: Album;
		index?: number;
		resultSetId?: string;
		onclick?: (album: Album) => void; // Deprecated: Use href navigation instead
		priority?: boolean; // For above-fold images - disables lazy loading
		experiment?: PhotographyExperimentAssignment | null;
	}

	let { album, index = 0, resultSetId = crypto.randomUUID(), onclick, priority = false, experiment = null }: Props = $props();

	// Image loading state
	let imageLoaded = $state(false);
	let imageError = $state(false);
	let previousCoverIdentity = $state('');

	// Generate album URL for navigation (using friendly slug)
	let albumUrl = $derived(`${base}/albums/${createAlbumSlug(album.albumName, album.albumKey)}`);

	// CF Images for album cover
	let coverSrcset = $derived(album.coverCfImageId ? cfSrcSet(album.coverCfImageId) : '');
	let optimizedCoverUrl = $derived(
		album.coverCfImageId ? cfImageUrl(album.coverCfImageId, 'medium') : album.coverImageUrl
	);
	let hasCover = $derived(!!(album.coverCfImageId || album.coverImageUrl));
	let coverIdentity = $derived(`${album.albumKey}:${album.coverCfImageId ?? album.coverImageUrl ?? 'coverless'}`);
	let exposureIdentity = $derived(`${resultSetId}:${album.albumKey}`);
	let exposureLoaded = $derived(hasCover ? imageLoaded : true);
	const albumCardSizes = SIZES_PRESETS.albumCard;

	function handleClick(event: MouseEvent) {
		// If onclick callback provided, prevent default navigation and use callback instead
		if (onclick) {
			event.preventDefault();
			event.stopPropagation();
			onclick(album);
		}
		// Otherwise, let the anchor tag navigate naturally
	}

	function handleImageLoad() {
		imageLoaded = true;
		imageError = false;
	}
	function recordExposure() {
		trackAnalyticsEventV2({ eventName: 'album_exposed', properties: { album_key: album.albumKey, position: index, result_set_id: resultSetId } });
		exposeExperiment(experiment, ALBUM_CARD_EXPERIMENT_SURFACE);
	}

	function handleImageError() {
		imageError = true;
		imageLoaded = false;
	}

	$effect(() => {
		if (previousCoverIdentity === coverIdentity) return;
		previousCoverIdentity = coverIdentity;
		imageLoaded = false;
		imageError = false;
	});

	let contentLabel = $derived.by(() => {
		const parts: string[] = [];
		if (album.photoCount > 0) parts.push(`${album.photoCount.toLocaleString()} ${album.photoCount === 1 ? 'photo' : 'photos'}`);
		if ((album.videoCount ?? 0) > 0) parts.push(`${album.videoCount} ${album.videoCount === 1 ? 'video' : 'videos'}`);
		return parts.join(' · ') || '0 photos';
	});
	let showExperimentCta = $derived(hasAlbumCardCta(experiment));
</script>

<a
	href={albumUrl}
	data-sveltekit-preload="hover"
	style="animation: fade-scale-in 0.3s ease-out {index * 0.05}s both"
	class="album-card"
	aria-label={`Album: ${album.albumName}, ${contentLabel}`}
	onclick={handleClick}
	use:exposure={{ loaded: exposureLoaded, onExpose: recordExposure, identity: exposureIdentity }}
>
	<!-- Loading/Fallback State -->
	{#if !imageLoaded || imageError || !hasCover}
		<div class="album-card__fallback"
			aria-hidden="true"
		>
			{#if !hasCover}
				<Folder class="w-20 h-20 text-charcoal-700" />
			{:else}
				<Camera class="w-16 h-16 text-charcoal-600" />
			{/if}
		</div>
	{/if}

	<!-- Cover Image with Responsive srcset -->
	{#if hasCover && !imageError}
		{#key coverIdentity}<img
			src={optimizedCoverUrl || album.coverImageUrl}
			srcset={coverSrcset || undefined}
			sizes={albumCardSizes}
			alt={`${album.albumName} cover`}
			width="400"
			height="300"
			loading={priority ? 'eager' : 'lazy'}
			decoding={priority ? 'sync' : 'async'}
			fetchpriority={priority ? 'high' : 'auto'}
			class="album-card__image {imageLoaded ||
			priority
				? 'opacity-100'
				: 'opacity-0'}"
			onload={handleImageLoad}
			onerror={handleImageError}
		/>
		{/key}
	{/if}

	<!-- Album Info Overlay -->
	<div class="album-card__overlay">
		<div class="album-card__copy">
			{#if album.primarySport && album.primarySport !== 'unknown'}
				<p class="album-card__sport">{album.primarySport}</p>
			{/if}
			<!-- element="h2": album cards are the items under the page h1; h3 skipped a level.
			     The h3 styling is the design, only the semantics were wrong. -->
			<Typography variant="h3" element="h2" class="album-card__title line-clamp-2">
				{album.albumName}
			</Typography>
			<div class="album-card__meta">
				<Typography variant="caption" class="text-charcoal-200">
					{contentLabel}
				</Typography>
			</div>
			{#if showExperimentCta}
				<span class="album-card__cta">
					View event <ArrowRight class="h-4 w-4" aria-hidden="true" />
				</span>
			{/if}
		</div>
	</div>

</a>

<style>
	.album-card { position: relative; display: block; aspect-ratio: 4 / 3; overflow: hidden; border: 1px solid var(--color-charcoal-800); border-radius: 0; background: var(--color-charcoal-900); color: inherit; outline: none; }
	.album-card:hover { border-color: var(--color-charcoal-700); }
	.album-card:focus-visible { outline: 2px solid var(--color-gold-500); outline-offset: 4px; }
	.album-card__fallback { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: var(--color-charcoal-900); }
	.album-card__image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: opacity .2s ease, transform .2s ease; }
	.album-card:hover .album-card__image { transform: scale(1.025); }
	.album-card__overlay { position: absolute; inset: 0; display: flex; align-items: end; padding: 16px; background: linear-gradient(to top, rgba(0,0,0,.94), rgba(0,0,0,.1) 72%); }
	.album-card__copy { min-width: 0; width: 100%; }
	.album-card__sport { margin-bottom: 6px; color: var(--color-gold-400); font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
	.album-card__copy :global(.album-card__title) { margin-bottom: 8px; color: white; font-family: Montserrat, sans-serif; font-size: 18px; font-weight: 700; line-height: 1.2; overflow-wrap: anywhere; }
	.album-card__meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	.album-card__cta { display: inline-flex; align-items: center; gap: 4px; margin-top: 10px; color: var(--color-gold-400); font-size: 13px; font-weight: 650; }
	@media (max-width: 480px) { .album-card__overlay { padding: 16px; } .album-card__copy :global(.album-card__title) { display: block; font-size: 18px; -webkit-line-clamp: unset; overflow: visible; } }
</style>
