<script lang="ts">
	import { Camera } from 'lucide-svelte';
	import { generateSmugMugSrcset, getSmugMugUrl, getProxiedImageUrl, type SmugMugSize } from '$lib/photo-utils';

	interface Props {
		src: string;
		alt: string;
		thumbnailSrc?: string;
		class?: string;
		aspectRatio?: string; // e.g., "4/3", "16/9"
		width?: number; // Explicit width for CLS prevention
		height?: number; // Explicit height for CLS prevention
		sizes?: string; // Responsive sizes attribute (e.g., "(max-width: 640px) 100vw, 25vw")
		priority?: boolean; // Disable lazy loading for above-fold images
		quality?: 'low' | 'medium' | 'high'; // Image quality preset
		onLoad?: () => void;
		onError?: () => void;
	}

	let {
		src,
		alt,
		thumbnailSrc,
		class: className = '',
		aspectRatio = '4/3',
		width,
		height,
		sizes,
		priority = false,
		quality = 'medium',
		onLoad,
		onError
	}: Props = $props();

	// All images now served via Cloudflare proxy (no local optimized images)
	let isLocalOptimized = $derived(false);

	// Proxy thumbnail URLs to eliminate third-party cookies
	let proxiedThumbnailSrc = $derived(
		thumbnailSrc && thumbnailSrc.includes('smugmug.com')
			? getProxiedImageUrl(thumbnailSrc)
			: thumbnailSrc
	);

	// Quality presets determine srcset sizes
	const qualityPresets: Record<string, SmugMugSize[]> = {
		low: ['S', 'M'],           // Thumbnails, small cards
		medium: ['M', 'L', 'XL'],  // Gallery cards, album covers
		high: ['L', 'XL', 'X2', 'X3'], // Hero images, lightbox
	};

	// Generate responsive srcset for SmugMug images (skip for local images)
	let srcset = $derived(isLocalOptimized ? null : generateSmugMugSrcset(src, qualityPresets[quality]));

	// Use largest size from preset as main src (skip transformation for local images)
	let optimizedSrc = $derived(() => {
		if (isLocalOptimized) return src;
		const preset = qualityPresets[quality];
		const largestSize = preset[preset.length - 1];
		return getSmugMugUrl(src, largestSize) || src;
	});

	// PERFORMANCE: Calculate dimensions from aspectRatio if not provided
	// This prevents CLS (Cumulative Layout Shift)
	let computedWidth = $derived(width || 400);
	let computedHeight = $derived(() => {
		if (height) return height;
		if (aspectRatio) {
			const [w, h] = aspectRatio.split('/').map(Number);
			return Math.round(computedWidth * (h / w));
		}
		return 300; // fallback
	});

	let imageLoaded = $state(false);
	let imageError = $state(false);
	let imageElement: HTMLImageElement | undefined = $state();
	// Intersection state for lazy loading. Priority images use template condition instead.
	let isIntersecting = $state(false);
	let container: HTMLDivElement | undefined = $state();

	// PERFORMANCE: Intersection Observer for true lazy loading
	$effect(() => {
		if (!container || priority) {
			isIntersecting = true; // Load immediately if priority
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						isIntersecting = true;
						observer.disconnect(); // Stop observing once visible
					}
				});
			},
			{
				rootMargin: '50px', // Start loading 50px before visible
				threshold: 0.01
			}
		);

		observer.observe(container);

		return () => {
			observer.disconnect();
		};
	});

	// Handle image load
	function handleLoad() {
		imageLoaded = true;
		onLoad?.();
	}

	// Handle image error
	function handleError() {
		console.error('[OptimizedImage] Failed to load image:', {
			src,
			thumbnailSrc,
			alt: alt.substring(0, 50)
		});
		imageError = true;
		onError?.();
	}

	// Check if image is already cached
	$effect(() => {
		if (imageElement?.complete && imageElement?.naturalHeight !== 0) {
			imageLoaded = true;
		}
	});
</script>

<div
	bind:this={container}
	class="relative overflow-hidden bg-charcoal-900 {className}"
	style="aspect-ratio: {aspectRatio}"
>
	<!-- Blur Placeholder (thumbnail or gradient) -->
	{#if !imageLoaded && !imageError}
		<div class="absolute inset-0">
			{#if proxiedThumbnailSrc}
				<!-- Blurred thumbnail (proxied to eliminate third-party cookies) -->
				<img
					src={proxiedThumbnailSrc}
					alt=""
					class="absolute inset-0 w-full h-full object-cover blur-lg scale-110"
					aria-hidden="true"
				/>
			{:else}
				<!-- Gradient placeholder -->
				<div
					class="absolute inset-0 bg-gradient-to-br from-charcoal-800 to-charcoal-900 animate-pulse"
					aria-hidden="true"
				></div>
			{/if}

			<!-- Loading spinner overlay -->
			<div class="absolute inset-0 flex items-center justify-center">
				<div class="relative">
					<Camera class="w-12 h-12 text-charcoal-700 animate-pulse" aria-hidden="true" />
				</div>
			</div>
		</div>
	{/if}

	<!-- Error State -->
	{#if imageError}
		<div class="absolute inset-0 flex flex-col items-center justify-center bg-charcoal-900">
			<Camera class="w-16 h-16 text-charcoal-600 mb-2" aria-hidden="true" />
			<p class="text-sm text-charcoal-400">Failed to load image</p>
		</div>
	{/if}

	<!-- Main Image - Only load when intersecting or priority -->
	<!-- PERFORMANCE: Pure CSS transition instead of svelte-motion (saves ~30KB JS) -->
	{#if !imageError && (isIntersecting || priority)}
		<img
			bind:this={imageElement}
			src={optimizedSrc()}
			srcset={srcset || undefined}
			{alt}
			{sizes}
			width={computedWidth}
			height={computedHeight()}
			loading={priority ? 'eager' : 'lazy'}
			decoding="async"
			fetchpriority={priority ? 'high' : 'auto'}
			class="absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ease-out"
			class:opacity-0={!imageLoaded}
			class:opacity-100={imageLoaded}
			onload={handleLoad}
			onerror={handleError}
		/>
	{/if}
</div>

<style>
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.animate-pulse {
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}
</style>
