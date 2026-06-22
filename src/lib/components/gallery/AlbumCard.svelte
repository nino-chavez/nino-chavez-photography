<!--
  AlbumCard Component - Display album with photo count

  Usage:
  <AlbumCard {album} index={0} onclick={handleClick} />
-->

<script lang="ts">
	import { base } from '$app/paths';
	import { Folder, Camera } from 'lucide-svelte';
	import Typography from '$lib/components/ui/Typography.svelte';
	import { SIZES_PRESETS } from '$lib/photo-utils';
	import { createAlbumSlug } from '$lib/utils';
	import { cfImageUrl, cfSrcSet } from '$lib/utils/cloudflare-images';

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
		onclick?: (album: Album) => void; // Deprecated: Use href navigation instead
		priority?: boolean; // For above-fold images - disables lazy loading
	}

	let { album, index = 0, onclick, priority = false }: Props = $props();

	// Image loading state
	let imageLoaded = $state(false);
	let imageError = $state(false);

	// Generate album URL for navigation (using friendly slug)
	let albumUrl = $derived(`${base}/albums/${createAlbumSlug(album.albumName, album.albumKey)}`);

	// CF Images for album cover
	let coverSrcset = $derived(album.coverCfImageId ? cfSrcSet(album.coverCfImageId) : '');
	let optimizedCoverUrl = $derived(
		album.coverCfImageId ? cfImageUrl(album.coverCfImageId, 'medium') : album.coverImageUrl
	);
	let hasCover = $derived(!!(album.coverCfImageId || album.coverImageUrl));
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

	function handleImageError() {
		imageError = true;
		imageLoaded = false;
	}

	// Sport emojis for badges
	const sportEmojis: Record<string, string> = {
		volleyball: '🏐',
		basketball: '🏀',
		soccer: '⚽',
		softball: '🥎',
		football: '🏈',
		baseball: '⚾',
		track: '🏃',
		portrait: '📸'
	};

	// Calculate album count tier for visual differentiation (50-photo increments)
	interface CountTier {
		label: string;
		bgColor: string;
		textColor: string;
		borderColor: string;
	}

	function getCountTier(count: number): CountTier | null {
		if (count < 51) return null;
		if (count <= 100) return {
			label: '51-100',
			bgColor: 'bg-emerald-500/20',
			textColor: 'text-emerald-400',
			borderColor: 'border-emerald-500/30'
		};
		if (count <= 150) return {
			label: '101-150',
			bgColor: 'bg-blue-500/20',
			textColor: 'text-blue-400',
			borderColor: 'border-blue-500/30'
		};
		if (count <= 200) return {
			label: '151-200',
			bgColor: 'bg-purple-500/20',
			textColor: 'text-purple-400',
			borderColor: 'border-purple-500/30'
		};
		if (count <= 250) return {
			label: '201-250',
			bgColor: 'bg-amber-500/20',
			textColor: 'text-amber-400',
			borderColor: 'border-amber-500/30'
		};
		return {
			label: '251+',
			bgColor: 'bg-gold-500/20',
			textColor: 'text-gold-400',
			borderColor: 'border-gold-500/30'
		};
	}

	let countTier = $derived(getCountTier(album.photoCount));
	let isVideoOnly = $derived(album.photoCount === 0 && (album.videoCount ?? 0) > 0);
	let contentLabel = $derived.by(() => {
		const parts: string[] = [];
		if (album.photoCount > 0) parts.push(`${album.photoCount.toLocaleString()} ${album.photoCount === 1 ? 'photo' : 'photos'}`);
		if ((album.videoCount ?? 0) > 0) parts.push(`${album.videoCount} ${album.videoCount === 1 ? 'video' : 'videos'}`);
		return parts.join(' · ') || '0 photos';
	});
</script>

<a
	href={albumUrl}
	data-sveltekit-preload="hover"
	style="animation: fade-scale-in 0.3s ease-out {index * 0.05}s both"
	class="group relative aspect-[4/3] bg-charcoal-900 rounded-lg overflow-hidden border border-charcoal-800 hover:border-gold-500/50 focus-visible:border-gold-500 focus-visible:ring-2 focus-visible:ring-gold-500/50 hover:scale-105 hover:-translate-y-1 transition-transform duration-200 transition-colors cursor-pointer outline-none block"
	aria-label={`Album: ${album.albumName}, ${contentLabel}`}
	onclick={handleClick}
>
	<!-- Loading/Fallback State -->
	{#if !imageLoaded || imageError || !hasCover}
		<div
			class="absolute inset-0 bg-gradient-to-br from-charcoal-800 to-charcoal-900 flex items-center justify-center"
			aria-hidden="true"
		>
			{#if !hasCover}
				<Folder class="w-24 h-24 text-charcoal-700 group-hover:text-gold-500/50 transition-colors" />
			{:else}
				<Camera class="w-16 h-16 text-charcoal-600" />
			{/if}
		</div>
	{/if}

	<!-- Cover Image with Responsive srcset -->
	{#if hasCover && !imageError}
		<img
			src={optimizedCoverUrl || album.coverImageUrl}
			srcset={coverSrcset || undefined}
			sizes={albumCardSizes}
			alt={`${album.albumName} cover`}
			width="400"
			height="300"
			loading={priority ? 'eager' : 'lazy'}
			decoding={priority ? 'sync' : 'async'}
			fetchpriority={priority ? 'high' : 'auto'}
			class="absolute inset-0 w-full h-full object-cover transition-opacity duration-300 {imageLoaded || priority
				? 'opacity-100'
				: 'opacity-0'}"
			onload={handleImageLoad}
			onerror={handleImageError}
		/>
	{/if}

	<!-- Album Info Overlay -->
	<div
		class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-between p-4"
	>
		<!-- Top Badges -->
		<div class="flex items-start justify-start gap-2">
			<!-- Sport Badge -->
			{#if album.primarySport && album.primarySport !== 'unknown'}
				<div
					class="px-2 py-1 rounded-full text-xs font-medium bg-charcoal-900/80 text-white border border-charcoal-700 backdrop-blur-sm"
				>
					{sportEmojis[album.primarySport] || '🏆'}
					<span class="capitalize ml-1">{album.primarySport}</span>
				</div>
			{/if}
		</div>

		<!-- Bottom Info -->
		<div>
			<Typography variant="h3" class="text-xl font-semibold text-white mb-2 line-clamp-2">
				{album.albumName}
			</Typography>
			<div class="flex items-center justify-between gap-2">
				<Typography variant="caption" class="text-charcoal-300">
					{contentLabel}
				</Typography>
				<!-- Count Tier Badge - Visual differentiation by 50-photo increments -->
				{#if countTier}
					<div
						class="px-2 py-0.5 rounded text-xs font-medium {countTier.bgColor} {countTier.textColor} border {countTier.borderColor}"
						title="Album contains {album.photoCount} photos ({countTier.label} tier)"
					>
						{countTier.label}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Hover Effect Border -->
	<div
		class="absolute inset-0 border-2 border-gold-500/0 group-hover:border-gold-500/30 rounded-lg transition-colors pointer-events-none"
		aria-hidden="true"
	></div>
</a>
