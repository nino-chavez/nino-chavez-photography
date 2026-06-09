<script lang="ts">
	import { base } from '$app/paths';
	import {
		X,
		ChevronLeft,
		ChevronRight,
		ZoomIn,
		ZoomOut,
		Download,
		Share2,
		Sparkles
	} from 'lucide-svelte';
	import { swipe, type SwipeEvent, isTouchDevice } from '$lib/utils/gestures';
	import Typography from '$lib/components/ui/Typography.svelte';
	import DownloadButton from '$lib/components/photo/DownloadButton.svelte';
	import ShareMenu from '$lib/components/social/ShareMenu.svelte';
	import { generatePhotoTitle, generatePhotoCaption, generateMetadataSummary } from '$lib/photo-utils';
	import { cfImageUrl, cfSrcSet, hasCFImage } from '$lib/utils/cloudflare-images';
	import type { Photo } from '$types/photo';

	interface Props {
		open?: boolean;
		photo: Photo | null;
		photos?: Photo[]; // Array for navigation
		currentIndex?: number;
		onClose?: () => void;
		onNavigate?: (index: number) => void;
	}

	let {
		open = $bindable(false),
		photo,
		photos = [],
		currentIndex = 0,
		onClose,
		onNavigate
	}: Props = $props();

	let zoomLevel = $state(1);
	let isDragging = $state(false);
	let dragStart = $state({ x: 0, y: 0 });
	let imagePosition = $state({ x: 0, y: 0 });

	// Image transition state
	let imageLoading = $state(false);
	let navDirection = $state<'left' | 'right' | null>(null);

	// Track viewport size for responsive image loading
	let viewportWidth = $state(typeof window !== 'undefined' ? window.innerWidth : 1920);
	let devicePixelRatio = $state(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

	// Update viewport on resize
	$effect(() => {
		if (typeof window === 'undefined') return;

		function updateViewport() {
			viewportWidth = window.innerWidth;
			devicePixelRatio = window.devicePixelRatio || 1;
		}

		window.addEventListener('resize', updateViewport);
		updateViewport(); // Initial call

		return () => {
			window.removeEventListener('resize', updateViewport);
		};
	});

	// Get optimized image URL based on viewport
	const optimizedImageUrl = $derived.by(() => {
		if (!photo) return null;
		if (hasCFImage(photo.cf_image_id)) {
			if (viewportWidth <= 800) return cfImageUrl(photo.cf_image_id, 'medium');
			return cfImageUrl(photo.cf_image_id, 'large');
		}
		return photo.original_url || photo.image_url;
	});

	// Get srcset for responsive loading
	const imageSrcSet = $derived.by(() => {
		if (!photo) return undefined;
		if (hasCFImage(photo.cf_image_id)) return cfSrcSet(photo.cf_image_id);
		return undefined;
	});

	// Sizes attribute for responsive images
	const imageSizes = $derived('100vw');

	// Touch gesture state
	let isTouch = $state(false);
	let initialDistance = $state(0);
	let initialScale = $state(1);
	let lastTapTime = $state(0);

	// Navigation availability
	const canGoNext = $derived(photos.length > 0 && currentIndex < photos.length - 1);
	const canGoPrev = $derived(photos.length > 0 && currentIndex > 0);

	// Detect touch device
	$effect(() => {
		isTouch = isTouchDevice();
	});

	// "Find Similar" functionality — keyed by image_key (vector similarity), no longer
	// emotion-styled (the emotion column is being dropped at the schema cutover).
	const findSimilarUrl = $derived(
		photo?.image_key ? `${base}/explore?similar_to=${photo.image_key}` : null
	);

	// Share target for ShareMenu
	const shareTarget = $derived.by(() => {
		if (!photo) return null;
		const baseUrl = 'https://photography.ninochavez.co';
		return {
			title: generatePhotoTitle(photo),
			url: `${baseUrl}/photo/${photo.image_key}`,
			imageUrl: hasCFImage(photo.cf_image_id)
				? cfImageUrl(photo.cf_image_id, 'public')
				: photo.original_url || photo.image_url
		};
	});

	// Generate user-friendly display text
	const displayTitle = $derived(photo ? generatePhotoTitle(photo) : 'Sports Photo');
	const displayCaption = $derived(photo ? generatePhotoCaption(photo) : '');
	const metadataSummary = $derived(photo ? generateMetadataSummary(photo) : []);

	function handleClose() {
		open = false;
		zoomLevel = 1;
		imagePosition = { x: 0, y: 0 };
		onClose?.();
	}

	function handleNext(event?: MouseEvent) {
		event?.stopPropagation();
		if (canGoNext) {
			zoomLevel = 1;
			imagePosition = { x: 0, y: 0 };
			navDirection = 'right';
			imageLoading = true;
			onNavigate?.(currentIndex + 1);
		}
	}

	function handlePrev(event?: MouseEvent) {
		event?.stopPropagation();
		if (canGoPrev) {
			zoomLevel = 1;
			imagePosition = { x: 0, y: 0 };
			navDirection = 'left';
			imageLoading = true;
			onNavigate?.(currentIndex - 1);
		}
	}

	function handleZoomIn(event?: MouseEvent) {
		event?.stopPropagation();
		zoomLevel = Math.min(zoomLevel + 0.5, 3);
	}

	function handleZoomOut(event?: MouseEvent) {
		event?.stopPropagation();
		zoomLevel = Math.max(zoomLevel - 0.5, 1);
		if (zoomLevel === 1) {
			imagePosition = { x: 0, y: 0 };
		}
	}

	// Touch gesture handlers
	function handleSwipe(event: SwipeEvent) {
		// Only allow navigation when not zoomed
		if (zoomLevel === 1) {
			if (event.direction === 'left' && canGoNext) {
				handleNext();
			} else if (event.direction === 'right' && canGoPrev) {
				handlePrev();
			} else if (event.direction === 'down' && Math.abs(event.distance) > 100) {
				// Pull down to close
				handleClose();
			}
		}
	}

	function handleDoubleTap(e: TouchEvent) {
		const now = Date.now();
		const timeSinceLastTap = now - lastTapTime;

		if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
			// Double tap detected - toggle zoom
			if (zoomLevel === 1) {
				zoomLevel = 2.5;
				// Center on tap point
				const touch = e.touches?.[0] || e.changedTouches?.[0];
				if (touch) {
					const target = e.currentTarget as HTMLElement;
					const rect = target.getBoundingClientRect();
					const x = touch.clientX - rect.left;
					const y = touch.clientY - rect.top;
					const centerX = rect.width / 2;
					const centerY = rect.height / 2;

					imagePosition = {
						x: -(x - centerX) * 1.5,
						y: -(y - centerY) * 1.5
					};
				}
			} else {
				// Reset zoom
				zoomLevel = 1;
				imagePosition = { x: 0, y: 0 };
			}
		}

		lastTapTime = now;
	}

	function handleTouchStart(e: TouchEvent) {
		if (e.touches.length === 2) {
			// Pinch gesture starting
			const touch1 = e.touches[0];
			const touch2 = e.touches[1];
			initialDistance = getDistance(touch1, touch2);
			initialScale = zoomLevel;
		}
	}

	function handleTouchMove(e: TouchEvent) {
		if (e.touches.length === 2) {
			e.preventDefault();
			const touch1 = e.touches[0];
			const touch2 = e.touches[1];
			const currentDistance = getDistance(touch1, touch2);

			if (initialDistance > 0) {
				const newScale = initialScale * (currentDistance / initialDistance);
				zoomLevel = Math.max(1, Math.min(4, newScale)); // Limit 1x-4x
			}
		}
	}

	function getDistance(touch1: Touch, touch2: Touch): number {
		const dx = touch2.clientX - touch1.clientX;
		const dy = touch2.clientY - touch1.clientY;
		return Math.sqrt(dx * dx + dy * dy);
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (!open) return;

		switch (event.key) {
			case 'Escape':
				handleClose();
				break;
			case 'ArrowLeft':
				event.preventDefault();
				handlePrev();
				break;
			case 'ArrowRight':
				event.preventDefault();
				handleNext();
				break;
			case '+':
			case '=':
				event.preventDefault();
				handleZoomIn();
				break;
			case '-':
			case '_':
				event.preventDefault();
				handleZoomOut();
				break;
		}
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			handleClose();
		}
	}

	function handleMouseDown(event: MouseEvent) {
		if (zoomLevel > 1) {
			isDragging = true;
			dragStart = { x: event.clientX - imagePosition.x, y: event.clientY - imagePosition.y };
		}
	}

	function handleMouseMove(event: MouseEvent) {
		if (isDragging && zoomLevel > 1) {
			imagePosition = {
				x: event.clientX - dragStart.x,
				y: event.clientY - dragStart.y
			};
		}
	}

	function handleMouseUp() {
		isDragging = false;
	}

	// Lock body scroll when lightbox is open
	$effect(() => {
		if (open) {
			document.body.style.overflow = 'hidden';
			return () => {
				document.body.style.overflow = '';
			};
		}
	});

	// Reset loading state when photo changes
	$effect(() => {
		if (!photo) return;
		// Reading image_key to track photo changes
		const _key = photo.image_key;
		imageLoading = true;
	});

	function handleImageLoad() {
		imageLoading = false;
	}

	// Preload adjacent images
	$effect(() => {
		if (!open || photos.length === 0) return;
		const toPreload: number[] = [];
		if (currentIndex + 1 < photos.length) toPreload.push(currentIndex + 1);
		if (currentIndex - 1 >= 0) toPreload.push(currentIndex - 1);

		for (const idx of toPreload) {
			const p = photos[idx];
			if (hasCFImage(p.cf_image_id)) {
				const img = new Image();
				img.src = cfImageUrl(p.cf_image_id, viewportWidth <= 800 ? 'medium' : 'large');
			}
		}
	});
</script>

<svelte:window
	onkeydown={handleKeyDown}
	onmousemove={handleMouseMove}
	onmouseup={handleMouseUp}
/>

{#if open && photo}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 bg-black/95 flex items-center justify-center animate-lightbox-open"
		style="z-index: 9999;"
		onclick={handleBackdropClick}
		onkeydown={(e) => e.key === 'Enter' && handleBackdropClick(e as any)}
		role="dialog"
		aria-modal="true"
		aria-label="Photo lightbox"
		tabindex="0"
	>
				<!-- Top Controls -->
				<div class="absolute top-0 left-0 right-0 z-10 p-3 md:p-4 bg-gradient-to-b from-black/50 to-transparent">
					<div class="max-w-7xl mx-auto flex items-center justify-between">
						<!-- Photo Info - Hidden on mobile, shown on desktop -->
						<div class="flex-1 hidden md:block">
							<Typography variant="h3" class="text-white text-lg">
								{displayTitle}
							</Typography>
							{#if displayCaption}
								<Typography variant="body" class="text-white/70 text-sm mt-1 italic">
									{displayCaption}
								</Typography>
							{/if}
							{#if photos.length > 0}
								<Typography variant="caption" class="text-white/60">
									{currentIndex + 1} / {photos.length}
								</Typography>
							{/if}
						</div>

						<!-- Mobile: Just counter and close -->
						<div class="flex-1 md:hidden">
							{#if photos.length > 0}
								<Typography variant="caption" class="text-white/80 text-sm">
									{currentIndex + 1} / {photos.length}
								</Typography>
							{/if}
						</div>

						<!-- Zoom Controls - Desktop only -->
						<div class="hidden md:flex items-center gap-2 mr-4">
							<button
								onclick={handleZoomOut}
								disabled={zoomLevel <= 1}
								class="p-3 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-gold-500"
								aria-label="Zoom out"
								title="Zoom out (-)"
							>
								<ZoomOut class="w-5 h-5 text-white" />
							</button>
							<Typography variant="caption" class="text-white/80 w-12 text-center">
								{Math.round(zoomLevel * 100)}%
							</Typography>
							<button
								onclick={handleZoomIn}
								disabled={zoomLevel >= 3}
								class="p-3 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-gold-500"
								aria-label="Zoom in"
								title="Zoom in (+)"
							>
								<ZoomIn class="w-5 h-5 text-white" />
							</button>
						</div>

						<!-- Download Button -->
						<div class="mr-2 md:mr-4">
							<DownloadButton {photo} variant="compact" />
						</div>

						<!-- Share Button -->
						{#if shareTarget}
							<div class="mr-2 md:mr-4">
								<ShareMenu target={shareTarget} variant="toolbar" />
							</div>
						{/if}

						<!-- Close Button -->
						<button
							onclick={handleClose}
							class="p-2 md:p-3 rounded-lg bg-white/10 hover:bg-white/20 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-gold-500"
							aria-label="Close lightbox"
							title="Close (ESC)"
						>
							<X class="w-5 md:w-6 h-5 md:h-6 text-white" />
						</button>
					</div>
				</div>

				<!-- Main Image Container -->
				<div
					use:swipe={{ onSwipe: handleSwipe }}
					class="relative w-full h-full flex items-center justify-center p-0 md:p-20"
					onmousedown={handleMouseDown}
					ontouchstart={handleTouchStart}
					ontouchmove={handleTouchMove}
					ontouchend={handleDoubleTap}
					role="presentation"
					style="cursor: {zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'}"
				>
					{#if imageLoading}
						<div class="absolute inset-0 flex items-center justify-center z-[1] pointer-events-none">
							<div class="w-8 h-8 border-2 border-white/30 border-t-white/80 rounded-full animate-spin"></div>
						</div>
					{/if}
					<img
						src={optimizedImageUrl || photo.image_url}
						srcset={imageSrcSet}
						sizes={imageSizes}
						alt={displayTitle}
						class="max-w-full max-h-full object-contain select-none transition-[opacity,transform] duration-300 ease-out touch-none {imageLoading ? 'opacity-0' : 'opacity-100'}"
						style="transform: scale({zoomLevel}) translate({imagePosition.x / zoomLevel}px, {imagePosition.y / zoomLevel}px) translateX({imageLoading ? (navDirection === 'right' ? '20px' : navDirection === 'left' ? '-20px' : '0px') : '0px'})"
						draggable="false"
						loading="eager"
						decoding="async"
						onload={handleImageLoad}
					/>
				</div>

				<!-- Navigation Arrows -->
				{#if photos.length > 1}
					<!-- Previous -->
					{#if canGoPrev}
						<button
							onclick={handlePrev}
							class="absolute left-4 top-1/2 -translate-y-1/2 p-4 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-colors z-10 min-h-[56px] min-w-[56px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-gold-500"
							aria-label="Previous photo"
							title="Previous (←)"
						>
							<ChevronLeft class="w-8 h-8 text-white" />
						</button>
					{/if}

					<!-- Next -->
					{#if canGoNext}
						<button
							onclick={handleNext}
							class="absolute right-4 top-1/2 -translate-y-1/2 p-4 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-colors z-10 min-h-[56px] min-w-[56px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-gold-500"
							aria-label="Next photo"
							title="Next (→)"
						>
							<ChevronRight class="w-8 h-8 text-white" />
						</button>
					{/if}
				{/if}

				<!-- Bottom Info/Metadata Bar - Desktop only -->
				<div
					class="hidden md:block absolute bottom-0 left-0 right-0 z-10 p-4 bg-gradient-to-t from-black/50 to-transparent"
				>
					<div class="max-w-7xl mx-auto flex items-center justify-between">
						<div class="flex items-center gap-6 text-white/80 text-sm">
							{#each metadataSummary as tag}
								<span class="capitalize">{tag}</span>
							{/each}

							<!-- "Find Similar" Button (vector similarity, keyed by image_key) -->
							{#if findSimilarUrl}
								<a
									href={findSimilarUrl}
									class="px-3 py-1.5 rounded-full text-xs font-medium
									       bg-white/10 hover:bg-white/20 backdrop-blur-sm
									       transition-colors flex items-center gap-1.5
									       border border-white/20 hover:border-white/40
									       focus:outline-none focus:ring-2 focus:ring-gold-500 text-white/90"
									aria-label="Find similar photos"
									title="Find more photos like this one"
								>
									<Sparkles class="w-3.5 h-3.5" aria-hidden="true" />
									<span>Similar Photos</span>
								</a>
							{/if}
						</div>

						<!-- Desktop Hints -->
						<Typography variant="caption" class="text-white/40">
							Use arrow keys to navigate • +/- to zoom • ESC to close
						</Typography>
					</div>
				</div>
			</div>
	{/if}

<style>
	@keyframes lightbox-open {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	:global(.animate-lightbox-open) {
		animation: lightbox-open 200ms ease-out both;
	}
</style>
