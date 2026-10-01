<script lang="ts">
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import DownloadButton from '$lib/components/photo/DownloadButton.svelte';
	import { Link, Check } from 'lucide-svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import RelatedPhotosCarousel from '$lib/components/gallery/RelatedPhotosCarousel.svelte'; // NEW: Related photos
	import TagDisplay from '$lib/components/photo/TagDisplay.svelte'; // NEW: Player tags
	import { cfImageUrl, cfSrcSet, hasCFImage } from '$lib/utils/cloudflare-images';
	import { createHdrSource } from '$lib/utils/hdr-photo-url';
	import { formatSport, formatCategory } from '$lib/utils/format-metadata';
	import { trackEngagement, recordShare, trackAnalyticsEventV2 } from '$lib/analytics/client';
	import { flushMediaOutcome, observeMediaOutcome, reconcileMediaView, type MediaView, type MediaViewEvent } from '$lib/analytics/media-view';
	import { shareUrl } from '$lib/analytics/share';
	import type { PageData } from './$types';
	import type { Photo } from '$types/photo';
	import { SITE_URL } from '$lib/site-url';
	import { personSchema } from '$lib/aeo/person';
	import { photoPageTitle, photoAltText } from '$lib/seo/photo-title';

	let { data }: { data: PageData } = $props();

	let showModal = $state(true);
	let mediaView = $state<MediaView | null>(null);

	// Record the view here rather than in the server load. The load also runs on
	// prefetch (data-sveltekit-preload-data="hover"), so tracking there banked a view
	// for every photo a cursor passed over in an album grid. This effect runs only
	// when the page actually renders. Deduped per visitor/photo/day server-side, so a
	// re-visit or a re-render costs nothing.
	function recordMediaEvent(event: MediaViewEvent | null) {
		if (!event) return;
		if (event.name === 'photo_rendered') trackAnalyticsEventV2({ eventName: event.name, properties: { photo_id: event.photoId, album_key: event.albumKey, view_id: event.viewId, load_duration_ms: event.loadDurationMs! } });
		else trackAnalyticsEventV2({ eventName: event.name, properties: { photo_id: event.photoId, album_key: event.albumKey, view_id: event.viewId, error_code: event.errorCode! } });
	}

	$effect(() => {
		const next = reconcileMediaView(mediaView, showModal, { id: data.photo.id, albumKey: data.photo.album_key }, () => crypto.randomUUID(), () => performance.now());
		if (next.view !== mediaView) mediaView = next.view;
		if (!next.opened || !next.view) return;
		trackEngagement('view', { photoId: data.photo.id, albumKey: data.photo.album_key, source: data.viewSource });
		trackAnalyticsEventV2({ eventName: 'photo_opened', properties: { photo_id: data.photo.id, album_key: data.photo.album_key, view_id: next.view.viewId, entry_surface: 'photo_route' } });
	});

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
		if (next.view?.photoId === capture.photoId && hdrUrl && data.photo.id === capture.photoId) hdr.markFailed(data.photo);
		recordMediaEvent(next.event);
	}

	$effect(() => {
		const onVisibilityChange = () => {
			const next = flushMediaOutcome(mediaView, document.visibilityState === 'visible', () => performance.now());
			if (next.view !== mediaView) mediaView = next.view;
			recordMediaEvent(next.event);
		};
		document.addEventListener('visibilitychange', onVisibilityChange);
		return () => document.removeEventListener('visibilitychange', onVisibilityChange);
	});

	// Serve the web-sized HDR (gain-map) copy when one exists — it degrades gracefully to the
	// same SDR pixels Cloudflare Images would show on a browser that can't render the gain map, so
	// this is a strict upgrade, never a risk. `hdr.markFailed` is a defensive per-photo fallback for the case
	// hdr_web_available is stale (R2 object missing/deleted) — the <img> below calls it on error.
	const hdr = createHdrSource();
	const hdrUrl = $derived(hdr.url(data.photo));

	// Optimize image URL via CF Images (fallback when there's no HDR copy, or it failed to load)
	const optimizedImageUrl = $derived.by(() => {
		if (hdrUrl) return hdrUrl;
		if (hasCFImage(data.photo.cf_image_id)) {
			return cfImageUrl(data.photo.cf_image_id, 'large');
		}
		return data.photo.original_url || data.photo.image_url;
	});

	const imageSrcSet = $derived.by(() => {
		// The HDR copy is a single web-sized file (src/lib/ai/hdr-resize.ts), not a responsive set —
		// Cloudflare Images' srcset only applies once we've fallen back to it.
		if (hdrUrl) return undefined;
		if (hasCFImage(data.photo.cf_image_id)) {
			return cfSrcSet(data.photo.cf_image_id);
		}
		return undefined;
	});

	function handleClose() {
		// Navigate back if we have history, otherwise fallback to explore
		// Note: document.referrer is unreliable, use history.length instead
		if (window.history.length > 1) {
			history.back();
		} else {
			goto(`${base}/explore`);
		}
	}

	// NEW: Handle related photo click
	function handleRelatedPhotoClick(photo: Photo) {
		// Navigate to the new photo's detail page
		goto(`${base}/photo/${photo.image_key}`);
	}

	// Copy-link. Two things this used to get wrong, both silent:
	//
	// 1. It copied the bare canonical, with no `?src=` channel, so a visit arriving
	//    from a link copied here was indistinguishable from someone typing the URL.
	//    Every other share surface attributes; this one — the page a shared photo
	//    link actually lands on — did not.
	// 2. It recorded no engagement event, so the copy never reached
	//    `photo_popularity`, where 'share' carries the heaviest weight of any signal.
	//
	// The fallback that used to sit here was worse than useless: it built
	// `/photo/${image_key}`, and image_key is NOT unique (113 collisions across the
	// library) — which is exactly why the loader addresses this page by
	// `canonicalSegment` instead. It could only ever fire if `data.seo.canonical`
	// were absent, and the loader always sets it, so it was dead code that would
	// have handed out a link to the wrong photo. Gone.
	let linkCopied = $state(false);

	async function copyPhotoLink() {
		try {
			await navigator.clipboard.writeText(shareUrl(data.seo.canonical, 'copy'));
			recordShare({ photoId: data.photo.id, albumKey: data.photo.album_key }, 'copy', 'clipboard_succeeded');
			linkCopied = true;
			toast.success('Link copied to clipboard.');
			setTimeout(() => (linkCopied = false), 2000);
		} catch (err) {
			recordShare({ photoId: data.photo.id, albumKey: data.photo.album_key }, 'copy', 'failed');
			console.error('[PhotoDetail] Copy link failed:', err);
			toast.error('Could not copy link. Please try again.');
		}
	}

	// Generate enhanced Schema.org structured data for AEO
	const baseUrl = SITE_URL;

	let schemaData = $derived.by(() => {
	const imageUrl = data.photo.image_url || '';
	const thumbnailUrl = data.photo.thumbnail_url || imageUrl;
	const originalUrl = data.photo.original_url || imageUrl;
	const imageWidth = data.photo.exif?.width;
	const imageHeight = data.photo.exif?.height;

	return {
		'@context': 'https://schema.org',
		'@type': 'Photograph',
		'@id': data.seo.canonical,
		// Was the album name, so every Photograph in an album published the same schema.org
		// `name` while `description` carried the only per-photo text. `name` and `description`
		// have different jobs; give `name` the composed title the <title> tag uses.
		name: photoPageTitle(data.photo.title, data.photo.caption),
		description: data.photo.caption || data.seo.description,
		url: data.seo.canonical,
		dateCreated: data.photo.created_at,
		datePublished: data.photo.created_at,
		keywords: data.photo.keywords.join(', ') || `${data.photo.metadata.sport_type}, ${data.photo.metadata.photo_category}`,
		// Enhanced ImageObject with detailed properties
		image: {
			'@type': 'ImageObject',
			contentUrl: originalUrl,
			thumbnailUrl: thumbnailUrl,
			url: imageUrl,
			encodingFormat: 'image/jpeg',
			width: imageWidth || undefined,
			height: imageHeight || undefined,
			...(imageWidth && imageHeight ? { aspectRatio: `${imageWidth}/${imageHeight}` } : {})
		},
		// Enhanced Person (photographer) with complete profile
		creator: personSchema({
			knowsAbout: ['Action Photography', data.photo.metadata.sport_type]
		}),
		// Additional metadata
		sport: data.photo.metadata.sport_type,
		category: data.photo.metadata.photo_category,
		// Enhanced aggregateRating with more details
		aggregateRating: {
			'@type': 'AggregateRating',
			ratingValue: Math.round(
				(data.photo.metadata.sharpness +
					data.photo.metadata.exposure_accuracy +
					data.photo.metadata.composition_score +
					data.photo.metadata.emotional_impact) /
					4 * 10
			) / 10, // Round to 1 decimal
			bestRating: 10,
			worstRating: 0,
			ratingCount: 1, // Single photo rating
			reviewCount: 0
		},
		// Offer schema for licensing (if applicable)
		offers: {
			'@type': 'Offer',
			availability: 'https://schema.org/InStock',
			priceCurrency: 'USD',
			url: `${baseUrl}/photo/${data.photo.image_key}`,
			description: 'Professional sports photography licensing available. Contact for pricing.'
		}
	};
	});
</script>

<svelte:head>
	<!--
		Title/description/OG/Twitter tags are emitted once by the root layout from
		`data.seo` (returned by this route's +page.server.ts). Only the Schema.org
		JSON-LD is page-specific and stays here.
	-->
	{@html `<script type="application/ld+json">${JSON.stringify(schemaData)}</script>`}
</svelte:head>

{#if showModal && data.photo}
	<!-- CLS Fix: Use scrollable container with fixed structure to prevent layout shifts -->
	<div class="photo-viewer">
		<div class="photo-viewer__inner">
			<!-- Main Photo Card -->
			<article class="photo-stage">
				<header class="photo-stage__header">
					<button onclick={handleClose} class="photo-stage__back">← Back</button>
					<h1>{data.photo.title}</h1>
				</header>
				<!-- CLS Fix: Reserve space with aspect-ratio to prevent layout shifts -->
				<div
					class="photo-stage__image"
					style="aspect-ratio: {data.photo.exif?.width && data.photo.exif?.height
						? `${data.photo.exif.width} / ${data.photo.exif.height}`
						: '4 / 3'};"
				>
					<img
						data-analytics-photo-id={data.photo.id}
						data-analytics-view-id={mediaView?.viewId ?? ''}
						src={optimizedImageUrl}
						srcset={imageSrcSet}
						sizes="(max-width: 768px) 100vw, 896px"
						alt={photoAltText(data.photo.alt_text, data.photo.title, data.photo.caption)}
						class="absolute inset-0 w-full h-full object-contain"
						loading="eager"
						decoding="async"
						fetchpriority="high"
						onload={recordRendered}
						onerror={recordLoadFailed}
					/>
				</div>

				<!--
					No visible caption paragraph here. `data.photo.caption` is machine-generated search
					metadata (ADR 0006) — it names jersey numbers and reads like retrieval text, not prose
					a person wrote about the photo. Displaying it as if it were a caption misrepresents it
					(Nino, 2026-09-26). It stays wired into <meta description>, <img alt> (via
					photoAltText, preferring alt_text), and the Schema.org `description` above.
				-->

				<!-- Photo Metadata (formatted) -->
				<div class="photo-stage__metadata">
					{#if data.photo.metadata.sport_type}
						<span>Sport: {formatSport(data.photo.metadata.sport_type)}</span>
					{/if}
					{#if data.photo.metadata.photo_category}
						<span>Category: {formatCategory(data.photo.metadata.photo_category)}</span>
					{/if}
				</div>

				<!-- EXIF Data (technical specs) -->
				{#if data.photo.exif}
					<div class="photo-stage__exif">
						{#if data.photo.exif.width && data.photo.exif.height}
							<span>{data.photo.exif.width} × {data.photo.exif.height}</span>
						{/if}
						{#if data.photo.exif.aperture}
							<span>ƒ/{data.photo.exif.aperture}</span>
						{/if}
						{#if data.photo.exif.shutter_speed}
							<span>{data.photo.exif.shutter_speed}s</span>
						{/if}
						{#if data.photo.exif.iso}
							<span>ISO {data.photo.exif.iso}</span>
						{/if}
						{#if data.photo.exif.focal_length}
							<span>{data.photo.exif.focal_length}mm</span>
						{/if}
					</div>
				{/if}

				<!-- Player Tags (NEW - Week 3-4) -->
				{#if data.approvedTags && data.approvedTags.length > 0}
					<div class="photo-stage__tags">
						<h3 class="text-sm font-semibold text-charcoal-400 mb-2">Tagged Players:</h3>
						<TagDisplay tags={data.approvedTags} />
					</div>
				{/if}
				<div class="photo-stage__actions">
					<!-- Download (high-res via CF Images) -->
					{#if hasCFImage(data.photo.cf_image_id)}
						<DownloadButton photo={data.photo} variant="default" />
					{/if}

					<!-- Copy canonical link -->
					<button
						onclick={copyPhotoLink}
						class="photo-stage__copy"
						aria-label="Copy link to this photo"
					>
						{#if linkCopied}
							<Check class="w-5 h-5 text-green-500" />
							Link copied
						{:else}
							<Link class="w-5 h-5" />
							Copy link
						{/if}
					</button>
				</div>
			</article>

			<!-- Related Photos Section - Always reserve space to prevent CLS -->
			<div class="photo-related">
				<!-- Related Photos Carousel (NEW - Week 2) -->
				{#if data.relatedPhotos && data.relatedPhotos.length > 0}
					<div class="mb-8">
						<RelatedPhotosCarousel
							photos={data.relatedPhotos}
							title="More from this Album & Sport"
							onPhotoClick={handleRelatedPhotoClick}
						/>
					</div>
				{/if}
			</div>
		</div>
	</div>
{:else}
	<!-- Fallback if modal is closed but route still loaded -->
	<div class="min-h-screen flex items-center justify-center bg-charcoal-950">
		<div class="text-center">
			<h1 class="text-2xl font-bold text-white mb-4">{data.photo.title}</h1>
			<!-- No visible caption here either — see the note above the main card. -->
			<a
				href="{base}/explore"
				class="inline-flex px-6 py-3 bg-gold-500 text-charcoal-950 hover:bg-gold-400 transition-colors"
			>
				Back to Gallery
			</a>
		</div>
	</div>
{/if}

<style>
	.photo-viewer { position: fixed; inset: 64px 0 0; z-index: 50; overflow-y: auto; background: var(--color-charcoal-950); }
	.photo-viewer__inner { min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 24px 32px 48px; }
	.photo-stage { width: min(1180px, 100%); }
	.photo-stage__header { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 20px; padding-bottom: 16px; }
	.photo-stage__header h1 { margin: 0; color: var(--color-charcoal-50); font-family: Montserrat, sans-serif; font-size: 20px; font-weight: 700; line-height: 1.35; overflow-wrap: anywhere; }
	.photo-stage__back { min-height: 44px; padding: 0; background: transparent; color: var(--color-charcoal-300); font-size: 14px; }
	.photo-stage__back:hover { color: var(--color-gold-400); }
	.photo-stage__image { position: relative; width: 100%; height: min(60svh, 720px); overflow: hidden; background: var(--color-charcoal-900); }
	.photo-stage__metadata, .photo-stage__exif { display: flex; flex-wrap: wrap; gap: 10px 20px; padding-block: 16px; border-bottom: 1px solid var(--color-charcoal-800); color: var(--color-charcoal-300); font-size: 13px; }
	.photo-stage__exif { padding-top: 0; font-family: ui-monospace, monospace; }
	.photo-stage__tags { padding-block: 16px; border-bottom: 1px solid var(--color-charcoal-800); }
	.photo-stage__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding-top: 18px; }
	.photo-stage__copy { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 10px 16px; border: 1px solid var(--color-charcoal-700); border-radius: 0; background: transparent; color: white; }
	.photo-stage__copy:hover { border-color: var(--color-gold-500); }
	.photo-stage__back:focus-visible, .photo-stage__copy:focus-visible { outline: 2px solid var(--color-gold-500); outline-offset: 3px; }
	.photo-related { width: min(1180px, 100%); margin-top: 38px; }
	@media (max-width: 640px) {
		.photo-viewer__inner { padding: 12px 20px 40px; }
		.photo-stage__header { grid-template-columns: 1fr; gap: 4px; }
		.photo-stage__back { justify-self: start; }
		.photo-stage__header h1 { font-size: 18px; }
		.photo-stage__actions > :global(*) { flex: 1 1 auto; }
	}
	@media (max-width: 680px) { .photo-viewer { top: 60px; } }
</style>
