<!--
  PhotoDetailModal Component - Full photo detail view in a modal

  Features:
  - Full-screen overlay with backdrop blur
  - Photo metadata display
  - Quality score visualization
  - Close on ESC key or backdrop click
  - Smooth animations

  Usage:
  <PhotoDetailModal bind:open {photo} />
-->

<script lang="ts">
	import { fade, slide } from 'svelte/transition';
	import { X, Camera, Calendar, MapPin, Award, Zap, ChevronDown, ChevronUp, Sparkles } from 'lucide-svelte';
	import { getPhotoQualityScore } from '$lib/photo-utils';
	import Typography from '$lib/components/ui/Typography.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import SocialShareButtons from '$lib/components/social/SocialShareButtons.svelte';
	import DownloadButton from '$lib/components/photo/DownloadButton.svelte';
	import FavoriteButton from '$lib/components/photo/FavoriteButton.svelte';
	import { cfImageUrl, cfSrcSet, hasCFImage } from '$lib/utils/cloudflare-images';
	import { createHdrSource } from '$lib/utils/hdr-photo-url';
	import { trackEngagement, trackAnalyticsEventV2 } from '$lib/analytics/client';
	import { flushMediaOutcome, observeMediaOutcome, reconcileMediaView, type MediaView, type MediaViewEvent } from '$lib/analytics/media-view';
	import { photoShareUrl } from '$lib/utils/share-url';
	import type { Photo } from '$types/photo';

	interface Props {
		open?: boolean;
		photo: Photo | null;
		onclose?: () => void;
		// Where this modal is opened from — carried onto the 'view' engagement
		// event so album-reach/popularity attribution reflects the real context.
		viewSource?: 'explore' | 'collection' | 'album' | 'direct' | 'search' | 'timeline' | 'favorites';
	}

	let { open = $bindable(false), photo, onclose, viewSource = 'direct' }: Props = $props();

	// Canonical share URL, or null when the item has no image_key to address it by.
	// This built `window.location.origin + '/photo/<key>'`, which had two faults: it
	// dropped the `/photography` base path the app is actually mounted under, and a
	// null image_key produced a literal `/photo/null` — which the Facebook share
	// button below then handed to Facebook's scraper for good.
	const photoUrl = $derived(photoShareUrl(photo?.image_key));

	let qualityScore = $derived(photo ? getPhotoQualityScore(photo) : 0);
	let metadata = $derived(photo?.metadata);

	// AI Insights collapsed by default (progressive disclosure)
	let showAIInsights = $state(false);
	let mediaView = $state<MediaView | null>(null);
	let openedPhotoId = $state<string | null>(null);
	
	// Track viewport for responsive image loading
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
		updateViewport();
		
		return () => {
			window.removeEventListener('resize', updateViewport);
		};
	});

	function recordMediaEvent(event: MediaViewEvent | null) {
		if (!event) return;
		if (event.name === 'photo_rendered') trackAnalyticsEventV2({ eventName: event.name, properties: { photo_id: event.photoId, album_key: event.albumKey, view_id: event.viewId, load_duration_ms: event.loadDurationMs! } });
		else trackAnalyticsEventV2({ eventName: event.name, properties: { photo_id: event.photoId, album_key: event.albumKey, view_id: event.viewId, error_code: event.errorCode! } });
	}

	function recordRendered(event: Event) {
		const image = event.currentTarget as HTMLImageElement;
		const next = observeMediaOutcome(mediaView, { photoId: image.dataset.analyticsPhotoId ?? '', viewId: image.dataset.analyticsViewId ?? '' }, 'rendered', document.visibilityState === 'visible', () => performance.now());
		if (next.view !== mediaView) mediaView = next.view;
		recordMediaEvent(next.event);
	}
	function recordLoadFailed(event: Event) {
		const image = event.currentTarget as HTMLImageElement;
		const capture = { photoId: image.dataset.analyticsPhotoId ?? '', viewId: image.dataset.analyticsViewId ?? '' };
		const next = observeMediaOutcome(mediaView, capture, 'load_failed', document.visibilityState === 'visible', () => performance.now());
		if (next.view !== mediaView) mediaView = next.view;
		if (next.view?.photoId === capture.photoId && hdrUrl && photo?.id === capture.photoId) hdr.markFailed(photo);
		recordMediaEvent(next.event);
	}
	
	// Serve the web-sized HDR (gain-map) copy when one exists (see /photo/[id]/+page.svelte for
	// the full rationale — same logic, same graceful CF fallback on any load failure).
	const hdr = createHdrSource();
	const hdrUrl = $derived(hdr.url(photo));

	// Get optimized image URL via CF Images (fallback when there's no HDR copy, or it failed)
	const optimizedImageUrl = $derived.by(() => {
		if (!photo) return null;
		if (hdrUrl) return hdrUrl;
		if (hasCFImage(photo.cf_image_id)) {
			return cfImageUrl(photo.cf_image_id, 'large');
		}
		return photo.original_url || photo.image_url;
	});

	// Get srcset for responsive loading
	const imageSrcSet = $derived.by(() => {
		if (!photo) return undefined;
		if (hdrUrl) return undefined; // single web-sized HDR file, no responsive variants
		if (hasCFImage(photo.cf_image_id)) return cfSrcSet(photo.cf_image_id);
		return undefined;
	});

	const imageSizes = $derived('(max-width: 1024px) 100vw, 50vw');

	function handleClose(event?: MouseEvent) {
		event?.stopPropagation();
		open = false;
		onclose?.();
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			handleClose();
		}
	}

	function handleBackdropKeyDown(event: KeyboardEvent) {
		// Allow closing modal with Enter/Space on backdrop
		if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
			event.preventDefault();
			handleClose();
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			handleClose();
		}
	}

	function toggleAIInsights(event?: MouseEvent) {
		event?.stopPropagation();
		showAIInsights = !showAIInsights;
	}

	$effect(() => {
		if (open) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = '';
		}

		return () => {
			document.body.style.overflow = '';
		};
	});

	// Record a view for whatever photo this modal is showing — see Lightbox.svelte
	// for why this is the only "the visitor looked at this" signal on routes that
	// never navigate to /photo/[id].
	$effect(() => {
		const next = reconcileMediaView(mediaView, open, photo ? { id: photo.id, albumKey: photo.album_key } : null, () => crypto.randomUUID(), () => performance.now());
		if (next.view !== mediaView) mediaView = next.view;
		if (!open) openedPhotoId = null;
		if (!next.opened || !next.view || !photo) return;
		openedPhotoId = photo.id;
		trackEngagement('view', { photoId: photo.id, albumKey: photo.album_key, source: viewSource });
		trackAnalyticsEventV2({ eventName: 'photo_opened', properties: { photo_id: photo.id, album_key: photo.album_key, view_id: next.view.viewId, entry_surface: viewSource } });
	});

	$effect(() => {
		const onVisibilityChange = () => {
			const next = flushMediaOutcome(mediaView, document.visibilityState === 'visible', () => performance.now());
			if (next.view !== mediaView) mediaView = next.view;
			recordMediaEvent(next.event);
		};
		document.addEventListener('visibilitychange', onVisibilityChange);
		return () => document.removeEventListener('visibilitychange', onVisibilityChange);
	});
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if open && photo}
	<!-- Backdrop -->
	<div
		transition:fade={{ duration: 200 }}
		class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-8"
		role="dialog"
		aria-modal="true"
		aria-labelledby="photo-detail-title"
		tabindex="-1"
		onclick={handleBackdropClick}
		onkeydown={handleBackdropKeyDown}
	>
		<!-- Modal Content -->
		<div class="w-full max-w-6xl max-h-[90vh] overflow-auto" style="animation: fade-scale-in 0.25s ease-out forwards">
						<Card padding="none" class="bg-charcoal-950/95 backdrop-blur-lg">
							<!-- Header -->
							<div class="flex items-center justify-between p-6 border-b border-charcoal-800">
								<Typography variant="h2" id="photo-detail-title" class="text-2xl">
									Photo Details
								</Typography>
								<Button variant="ghost" size="md" onclick={handleClose} aria-label="Close modal" class="min-w-[44px] min-h-[44px]">
									<X class="w-5 h-5" />
								</Button>
							</div>

							<!-- Content Grid -->
							<div class="grid grid-cols-1 lg:grid-cols-2 gap-8 p-6">
								<!-- Photo Display -->
								<div class="relative flex items-center justify-center bg-charcoal-900 rounded-lg aspect-[4/3] border border-charcoal-800 overflow-hidden">
									{#if optimizedImageUrl || photo.image_url}
										<img
											data-analytics-photo-id={photo.id}
											data-analytics-view-id={mediaView?.viewId ?? ''}
											src={optimizedImageUrl || photo.image_url}
											srcset={imageSrcSet}
											sizes={imageSizes}
											alt={photo.alt_text || photo.caption || photo.title || 'Photo'}
											class="absolute inset-0 w-full h-full object-contain"
											loading="eager"
											decoding="async"
											onload={recordRendered}
											onerror={recordLoadFailed}
										/>
									{:else}
										<Camera class="w-24 h-24 text-charcoal-600" aria-hidden="true" />
									{/if}
								</div>

								<!-- Info Panel -->
								<div class="space-y-6">
									<!-- Basic Info (Always Visible) -->
									<div class="space-y-4">
										<!-- Title -->
										{#if photo.title}
											<div>
												<Typography variant="h3" class="text-xl mb-2">
													{photo.title}
												</Typography>
											</div>
										{/if}

										<!--
											No visible caption paragraph. `photo.caption` is machine-generated search
											metadata (ADR 0006) — it names jersey numbers and reads like retrieval text,
											not prose a person wrote about the photo. Displaying it as if it were a
											caption misrepresents it (Nino, 2026-09-26). It stays wired into the <img
											alt> above (preferring alt_text) and into meta description/schema markup
											elsewhere.
										-->
									</div>

									<!-- Download, Favorite & Social Sharing (NEW - Week 3) -->
									<div class="border-t border-charcoal-800 pt-6 space-y-6">
										<!-- Action Buttons -->
										<div class="flex items-center gap-3">
											<DownloadButton photo={photo} variant="default" />
											<FavoriteButton {photo} surface={viewSource} variant="default" class="flex-1" />
										</div>

										<!-- Social Sharing — hidden when the item has no addressable URL -->
										{#if photoUrl}
											<SocialShareButtons photo={photo} url={photoUrl} />
										{/if}
									</div>

									<!-- AI Insights Toggle -->
									<div class="border-t border-charcoal-800 pt-6">
										<button
											type="button"
											onclick={toggleAIInsights}
											class="w-full flex items-center justify-between group hover:bg-charcoal-900/50 p-3 rounded-lg transition-colors"
											aria-expanded={showAIInsights}
										>
											<div class="flex items-center gap-3">
												<div class="p-2 rounded-lg bg-purple-500/10 group-hover:bg-purple-500/20 transition-colors">
													<Sparkles class="w-5 h-5 text-purple-500" aria-hidden="true" />
												</div>
												<Typography variant="h3">AI Insights</Typography>
											</div>
											{#if showAIInsights}
												<ChevronUp class="w-5 h-5 text-charcoal-400" />
											{:else}
												<ChevronDown class="w-5 h-5 text-charcoal-400" />
											{/if}
										</button>
									</div>

									<!-- Collapsible AI Insights -->
									{#if showAIInsights}
										<div transition:slide={{ duration: 200 }} class="space-y-6 overflow-hidden">
												<!-- Quality Score -->
												<div>
													<Typography variant="caption" class="text-charcoal-400 mb-2">
														Overall Quality Score
													</Typography>
													<div class="flex items-center gap-4">
														<div class="text-4xl font-bold text-gold-500">
															{qualityScore.toFixed(1)}
														</div>
														<div class="flex-1 bg-charcoal-800 rounded-full h-3 overflow-hidden">
															<div
																class="bg-gradient-to-r from-gold-500 to-gold-400 h-full transition-all duration-300"
																style="width: {qualityScore * 10}%"
															></div>
														</div>
													</div>
												</div>

												<!-- Metadata Grid -->
												<div class="space-y-4">
													<!-- Play Type -->
													{#if metadata?.play_type}
														<div class="flex items-start gap-3">
															<Zap class="w-5 h-5 text-charcoal-400 mt-1" aria-hidden="true" />
															<div class="flex-1">
																<Typography variant="caption" class="text-charcoal-400 block mb-1">
																	Play Type
																</Typography>
																<Typography variant="body" class="capitalize">
																	{metadata.play_type}
																</Typography>
															</div>
														</div>
													{/if}

													<!-- Technical Scores -->
													<div class="pt-4 border-t border-charcoal-800 space-y-3">
														<Typography variant="h3" class="text-sm">Technical Analysis</Typography>

														{#if metadata?.sharpness !== undefined}
															<div class="flex items-center justify-between">
																<Typography variant="caption" class="text-charcoal-400">
																	Sharpness
																</Typography>
																<Typography variant="body" class="font-medium">
																	{metadata.sharpness.toFixed(1)}/10
																</Typography>
															</div>
														{/if}

														{#if metadata?.exposure_accuracy !== undefined}
															<div class="flex items-center justify-between">
																<Typography variant="caption" class="text-charcoal-400">
																	Exposure
																</Typography>
																<Typography variant="body" class="font-medium">
																	{metadata.exposure_accuracy.toFixed(1)}/10
																</Typography>
															</div>
														{/if}

														{#if metadata?.composition_score !== undefined}
															<div class="flex items-center justify-between">
																<Typography variant="caption" class="text-charcoal-400">
																	Composition
																</Typography>
																<Typography variant="body" class="font-medium">
																	{metadata.composition_score.toFixed(1)}/10
																</Typography>
															</div>
														{/if}

														{#if metadata?.emotional_impact !== undefined}
															<div class="flex items-center justify-between">
																<Typography variant="caption" class="text-charcoal-400">
																	Emotional Impact
																</Typography>
																<Typography variant="body" class="font-medium">
																	{metadata.emotional_impact.toFixed(1)}/10
																</Typography>
															</div>
														{/if}
													</div>
												</div>
											</div>
									{/if}
								</div>
							</div>
						</Card>
					</div>
			</div>
	{/if}
