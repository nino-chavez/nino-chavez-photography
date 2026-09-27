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
	import { canGoNext as computeCanGoNext, canGoPrev as computeCanGoPrev, isValidIndex, shouldPrefetchNextPage, resolveLoadMoreOutcome } from '$lib/gallery/lightbox-nav';
	import Typography from '$lib/components/ui/Typography.svelte';
	import DownloadButton from '$lib/components/photo/DownloadButton.svelte';
	import ShareMenu from '$lib/components/social/ShareMenu.svelte';
	import { generatePhotoTitle, generateMetadataSummary } from '$lib/photo-utils';
	import { cfImageUrl, cfSrcSet, hasCFImage } from '$lib/utils/cloudflare-images';
	import { trackEngagement } from '$lib/analytics/client';
	import { photoShareUrl } from '$lib/utils/share-url';
	import type { Photo } from '$types/photo';

	interface Props {
		open?: boolean;
		photo: Photo | null;
		photos?: Photo[]; // Array for navigation
		currentIndex?: number;
		onClose?: () => void;
		onNavigate?: (index: number) => void;
		// Cross-page navigation (optional — defaults preserve single-page behavior).
		// `onLoadMore` should append to the SAME array passed as `photos` (mutate the caller's
		// state, e.g. `loadedPhotos = [...loadedPhotos, ...next]`) and may be called more than
		// once concurrently-in-spirit — this component calls it both to prefetch ahead of the
		// boundary and, as a fallback, at the boundary itself, and treats "did `photos.length`
		// grow" as the only signal of success (see lightbox-nav.ts's resolveLoadMoreOutcome).
		// It should not throw for an expected empty/end-of-data result — return normally and
		// simply don't grow `photos`; a thrown error is caught and treated the same way.
		hasMore?: boolean;
		onLoadMore?: () => Promise<void>;
		loadingMore?: boolean;
		totalCount?: number;
		indexOffset?: number;
		// Where this lightbox is opened from — carried onto the 'view' engagement
		// event so album-reach/popularity attribution reflects the real context.
		viewSource?: 'explore' | 'collection' | 'album' | 'direct' | 'search' | 'timeline' | 'favorites';
	}

	let {
		open = $bindable(false),
		photo,
		photos = [],
		currentIndex = 0,
		onClose,
		onNavigate,
		hasMore = false,
		onLoadMore,
		loadingMore = false,
		totalCount,
		indexOffset = 0,
		viewSource = 'direct'
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

	// Navigation availability. `hasMore` extends "next" past the loaded list:
	// at the boundary, advancing triggers onLoadMore to append the next page.
	const canGoNext = $derived(computeCanGoNext(currentIndex, photos.length, hasMore));
	const canGoPrev = $derived(computeCanGoPrev(currentIndex));

	// `loadingMore` goes true for the background prefetch too (see below), which starts several
	// photos before the boundary — an ordinary in-list Next during that window must stay instant
	// and clickable. Only show the "loading" affordance on Next when it is actually the thing the
	// click is waiting on: standing at the last loaded photo with a fetch in flight.
	const waitingOnLoadMore = $derived(loadingMore && currentIndex >= photos.length - 1);

	// A page fetch plus a cold CDN image fetch can take seconds, and doing both serially only
	// after the visitor clicks Next at the boundary is what made crossing feel like a hang.
	// Start fetching the next page a few photos early — hasMore/loadingMore make this
	// idempotent — so by the time the visitor reaches the last loaded photo the data is
	// already there and the adjacent-image preload effect below has had time to warm it.
	const PREFETCH_LOOKAHEAD = 5;
	$effect(() => {
		if (!open || !onLoadMore) return;
		if (shouldPrefetchNextPage(currentIndex, photos.length, hasMore, PREFETCH_LOOKAHEAD)) {
			void triggerLoadMore();
		}
	});

	// Dedups the prefetch and the boundary fallback onto the SAME in-flight call, so a visitor
	// who reaches the boundary before the prefetch resolves waits for it rather than the two
	// racing (or the boundary attempt bailing out on the parent's own re-entrancy guard and
	// reading as a failure). `onLoadMore` itself decides success by whether `photos` grew.
	let pendingLoadMore: Promise<void> | null = null;
	function triggerLoadMore(): Promise<void> {
		if (!onLoadMore) return Promise.resolve();
		if (!pendingLoadMore) {
			pendingLoadMore = onLoadMore()
				.catch((err) => {
					console.error('[Lightbox] onLoadMore failed', err);
				})
				.finally(() => {
					pendingLoadMore = null;
				});
		}
		return pendingLoadMore;
	}

	// Set when a boundary-crossing load resolved without producing a next photo (an error, or
	// an empty page). Cleared on the next successful navigation or retry attempt.
	let loadMoreFailed = $state(false);

	// Detect touch device
	$effect(() => {
		isTouch = isTouchDevice();
	});

	// "Find Similar" functionality — keyed by image_key (vector similarity), no longer
	// emotion-styled (the emotion column is being dropped at the schema cutover).
	const findSimilarUrl = $derived(
		photo?.image_key ? `${base}/explore?similar_to=${photo.image_key}` : null
	);

	// Share target for ShareMenu. An item with no image_key has no shareable URL —
	// photoShareUrl returns null and the toolbar's `{#if shareTarget}` hides the
	// control, rather than handing out a link to /photo/null.
	const shareTarget = $derived.by(() => {
		if (!photo) return null;
		const url = photoShareUrl(photo.image_key);
		if (!url) return null;
		return {
			title: generatePhotoTitle(photo),
			url,
			imageUrl: hasCFImage(photo.cf_image_id)
				? cfImageUrl(photo.cf_image_id, 'public')
				: photo.original_url || photo.image_url
		};
	});

	// Generate user-friendly display text
	const displayTitle = $derived(photo ? generatePhotoTitle(photo) : 'Sports Photo');
	const metadataSummary = $derived(photo ? generateMetadataSummary(photo) : []);

	// Counter: prefer cross-page totals when provided, else fall back to the
	// loaded-list position so single-page usages are unchanged.
	const counterCurrent = $derived(indexOffset + currentIndex + 1);
	const counterTotal = $derived(typeof totalCount === 'number' ? totalCount : photos.length);

	function handleClose() {
		open = false;
		zoomLevel = 1;
		imagePosition = { x: 0, y: 0 };
		loadMoreFailed = false;
		onClose?.();
	}

	// The only path that may call onNavigate — never with an index the parent hasn't loaded.
	// Without this guard, a load-more call that resolved to nothing still let `goNext` advance
	// into an index past the end of `photos`, which made `photo` undefined and the whole
	// lightbox vanish while `open` stayed true (see lightbox-nav.ts).
	function navigateTo(index: number) {
		if (!isValidIndex(index, photos.length)) return;
		onNavigate?.(index);
	}

	// Advance to the next photo. At the boundary of the loaded list, if more pages are
	// available, load the next page first, then advance into it — unless the prefetch effect
	// above already did, in which case this is just an ordinary in-list navigation.
	async function goNext() {
		if (currentIndex < photos.length - 1) {
			zoomLevel = 1;
			imagePosition = { x: 0, y: 0 };
			navDirection = 'right';
			imageLoading = true;
			navigateTo(currentIndex + 1);
			return;
		}

		// At the last loaded photo — fetch + append the next page, then advance. If the
		// prefetch effect above already started this fetch, triggerLoadMore reuses it.
		if (hasMore && onLoadMore) {
			loadMoreFailed = false;
			zoomLevel = 1;
			imagePosition = { x: 0, y: 0 };
			navDirection = 'right';

			const startIndex = currentIndex;
			const loadedCountBefore = photos.length;
			await triggerLoadMore();

			// A load the LIGHTBOX did not start (the grid's own "Load more" button, the
			// timeline's scroll sentinel) can still be running when ours resolves — the
			// parent's own re-entrancy guard (`if (loadingMore) return`) makes onLoadMore()
			// resolve immediately with nothing new added, which would otherwise read as a
			// failure. Bail out quietly instead of showing a false "couldn't load" banner;
			// the real load's own completion is what makes the next Next press succeed.
			if (loadingMore) return;

			const outcome = resolveLoadMoreOutcome({
				startIndex,
				currentIndexNow: currentIndex,
				loadedCountBefore,
				loadedCountAfter: photos.length
			});
			if (outcome.type === 'advance') {
				imageLoading = true;
				navigateTo(outcome.index);
			} else if (outcome.type === 'failed') {
				// Stay on the current photo — never leave the visitor on a blank lightbox.
				loadMoreFailed = true;
			}
			// 'stale': the visitor already moved on (e.g. pressed Prev) — do nothing.
		}
	}

	function handleNext(event?: MouseEvent) {
		event?.stopPropagation();
		if (canGoNext) {
			void goNext();
		}
	}

	function retryLoadMore() {
		loadMoreFailed = false;
		void goNext();
	}

	function handlePrev(event?: MouseEvent) {
		event?.stopPropagation();
		if (canGoPrev) {
			zoomLevel = 1;
			imagePosition = { x: 0, y: 0 };
			navDirection = 'left';
			imageLoading = true;
			loadMoreFailed = false;
			navigateTo(currentIndex - 1);
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
				if (canGoNext) void goNext();
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

	function handleBackdropClick(event: MouseEvent | KeyboardEvent) {
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
		loadMoreFailed = false;
	});

	// Record a view for whatever photo is on screen while the lightbox is open.
	// This is the only "the visitor actually looked at this photo" signal for
	// every route that opens photos in-place instead of navigating to
	// /photo/[id] (album grids, explore, timeline, favorites, collections,
	// share links) — without it, downloading/favoriting/sharing a photo here
	// could happen with zero recorded views, which is exactly what fed the
	// "0 views · 1 dl" readout on the analytics dashboard.
	$effect(() => {
		if (!open || !photo) return;
		trackEngagement('view', { photoId: photo.id, albumKey: photo.album_key, source: viewSource });
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
		onkeydown={(e) => e.key === 'Enter' && handleBackdropClick(e)}
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
							<!--
								No visible caption paragraph here either — same decision as /photo/[id] and
								PhotoDetailModal (Nino, 2026-09-26): `photo.caption` is machine-generated search
								metadata, not prose a person wrote about the photo. It stays wired into the
								<img alt> below (displayTitle stays as-is; alt/meta/search uses are untouched).
							-->
							{#if photos.length > 0}
								<Typography variant="caption" class="text-white/60">
									{counterCurrent} / {counterTotal}
								</Typography>
							{/if}
						</div>

						<!-- Mobile: Just counter and close -->
						<div class="flex-1 md:hidden">
							{#if photos.length > 0}
								<Typography variant="caption" class="text-white/80 text-sm">
									{counterCurrent} / {counterTotal}
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
								<ShareMenu target={shareTarget} variant="toolbar" photoId={photo?.id} albumKey={photo?.album_key} />
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
							disabled={waitingOnLoadMore}
							class="absolute right-4 top-1/2 -translate-y-1/2 p-4 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-colors z-10 min-h-[56px] min-w-[56px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:cursor-wait {waitingOnLoadMore ? 'animate-pulse' : ''}"
							aria-label={waitingOnLoadMore ? 'Loading more photos' : 'Next photo'}
							title="Next (→)"
						>
							{#if waitingOnLoadMore}
								<div class="w-7 h-7 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
							{:else}
								<ChevronRight class="w-8 h-8 text-white" />
							{/if}
						</button>
					{/if}
				{/if}

				<!-- Load-more failure — stay on the current photo, offer a retry, never vanish. -->
				{#if loadMoreFailed}
					<div
						class="absolute bottom-24 md:bottom-28 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2 rounded-full bg-charcoal-900/95 border border-charcoal-700 backdrop-blur-sm text-sm text-white/90"
						role="status"
					>
						<span>Couldn't load more photos.</span>
						<button
							onclick={retryLoadMore}
							class="text-gold-400 hover:text-gold-300 font-medium focus:outline-none focus:ring-2 focus:ring-gold-500 rounded"
						>
							Retry
						</button>
					</div>
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
