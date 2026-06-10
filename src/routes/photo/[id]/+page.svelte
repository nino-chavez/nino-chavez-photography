<script lang="ts">
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import DownloadButton from '$lib/components/photo/DownloadButton.svelte';
	import { Link, Check } from 'lucide-svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import RelatedPhotosCarousel from '$lib/components/gallery/RelatedPhotosCarousel.svelte'; // NEW: Related photos
	import TagDisplay from '$lib/components/photo/TagDisplay.svelte'; // NEW: Player tags
	import { cfImageUrl, cfSrcSet, hasCFImage } from '$lib/utils/cloudflare-images';
	import { formatSport, formatCategory } from '$lib/utils/format-metadata';
	import type { PageData } from './$types';
	import type { Photo } from '$types/photo';

	let { data }: { data: PageData } = $props();

	let showModal = $state(true);

	// Optimize image URL via CF Images
	const optimizedImageUrl = $derived.by(() => {
		if (hasCFImage(data.photo.cf_image_id)) {
			return cfImageUrl(data.photo.cf_image_id, 'large');
		}
		return data.photo.original_url || data.photo.image_url;
	});

	const imageSrcSet = $derived.by(() => {
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

	// Copy-link: prefer the canonical URL computed for SEO/OG; fall back to a
	// runtime-built URL if it is ever absent.
	let linkCopied = $state(false);

	async function copyPhotoLink() {
		const url =
			data.seo.canonical ||
			`${typeof window !== 'undefined' ? window.location.origin : ''}${base}/photo/${data.photo.image_key}`;
		try {
			await navigator.clipboard.writeText(url);
			linkCopied = true;
			toast.success('Link copied to clipboard.');
			setTimeout(() => (linkCopied = false), 2000);
		} catch (err) {
			console.error('[PhotoDetail] Copy link failed:', err);
			toast.error('Could not copy link. Please try again.');
		}
	}

	// Generate enhanced Schema.org structured data for AEO
	const baseUrl = 'https://photography.ninochavez.co';

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
		name: data.photo.title,
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
		creator: {
			'@type': 'Person',
			name: 'Nino Chavez',
			jobTitle: 'Professional Sports Photographer',
			url: `${baseUrl}/about`,
			sameAs: [
				'https://www.instagram.com/ninochavez',
				'https://twitter.com/ninochavez'
			],
			knowsAbout: [
				'Sports Photography',
				'Action Photography',
				'Event Photography',
				data.photo.metadata.sport_type
			].filter(Boolean)
		},
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
	<!-- Primary Meta Tags -->
	<title>{data.seo.title}</title>
	<meta name="title" content={data.seo.title} />
	<meta name="description" content={data.seo.description} />
	<meta name="keywords" content={data.seo.keywords} />
	<link rel="canonical" href={data.seo.canonical} />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content={data.seo.ogType} />
	<meta property="og:url" content={data.seo.canonical} />
	<meta property="og:title" content={data.seo.title} />
	<meta property="og:description" content={data.seo.description} />
	<meta property="og:image" content={data.seo.ogImage} />
	<meta property="og:image:alt" content={data.photo.title} />
	<meta property="og:site_name" content="Nino Chavez Photography" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:url" content={data.seo.canonical} />
	<meta name="twitter:title" content={data.seo.title} />
	<meta name="twitter:description" content={data.seo.description} />
	<meta name="twitter:image" content={data.seo.ogImage} />
	<meta name="twitter:image:alt" content={data.photo.title} />

	<!-- Schema.org Structured Data -->
	{@html `<script type="application/ld+json">${JSON.stringify(schemaData)}</script>`}
</svelte:head>

{#if showModal && data.photo}
	<!-- CLS Fix: Use scrollable container with fixed structure to prevent layout shifts -->
	<div class="fixed inset-0 bg-black/90 z-50 overflow-y-auto">
		<div class="min-h-screen flex flex-col items-center py-8 px-4">
			<!-- Main Photo Card -->
			<div class="bg-charcoal-900 rounded-lg max-w-4xl w-full p-6">
				<h1 class="text-2xl font-bold text-white mb-4">{data.photo.title}</h1>
				<!-- CLS Fix: Reserve space with aspect-ratio to prevent layout shifts -->
				<div
					class="relative w-full rounded-lg overflow-hidden mb-4 bg-charcoal-800"
					style="aspect-ratio: {data.photo.exif?.width && data.photo.exif?.height
						? `${data.photo.exif.width} / ${data.photo.exif.height}`
						: '4 / 3'};"
				>
					<img
						src={optimizedImageUrl}
						srcset={imageSrcSet}
						sizes="(max-width: 768px) 100vw, 896px"
						alt={data.photo.title}
						class="absolute inset-0 w-full h-full object-cover"
						loading="eager"
						decoding="async"
						fetchpriority="high"
					/>
				</div>
				<p class="text-charcoal-300 mb-4">{data.photo.caption}</p>

				<!-- Photo Metadata (formatted) -->
				<div class="flex flex-wrap gap-3 text-sm text-charcoal-400 mb-4">
					{#if data.photo.metadata.sport_type}
						<span>Sport: {formatSport(data.photo.metadata.sport_type)}</span>
					{/if}
					{#if data.photo.metadata.photo_category}
						<span>Category: {formatCategory(data.photo.metadata.photo_category)}</span>
					{/if}
				</div>

				<!-- EXIF Data (technical specs) -->
				{#if data.photo.exif}
					<div class="flex flex-wrap gap-4 text-sm text-charcoal-400 mb-4 font-mono">
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
					<div class="mb-4">
						<h3 class="text-sm font-semibold text-charcoal-400 mb-2">Tagged Players:</h3>
						<TagDisplay tags={data.approvedTags} />
					</div>
				{/if}
				<div class="flex flex-wrap items-center gap-4">
					<button
						onclick={handleClose}
						class="px-6 py-3 bg-gold-500 text-charcoal-950 rounded-md hover:bg-gold-400 transition-colors"
					>
						Close
					</button>

					<!-- Download (high-res via CF Images) -->
					{#if hasCFImage(data.photo.cf_image_id)}
						<DownloadButton photo={data.photo} variant="default" />
					{/if}

					<!-- Copy canonical link -->
					<button
						onclick={copyPhotoLink}
						class="inline-flex items-center gap-2 px-6 py-3 bg-charcoal-800 text-white rounded-md border border-charcoal-700 hover:border-gold-500/50 hover:bg-charcoal-700 transition-colors"
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
					<a
						href="{base}/photo/{data.photo.image_key}/tag"
						class="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors inline-flex items-center gap-2"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
							/>
						</svg>
						Tag Players
					</a>
				</div>
			</div>

			<!-- Related Photos Section - Always reserve space to prevent CLS -->
			<div class="max-w-6xl w-full mt-8">
				<!-- Similar Photos - Vector Similarity (Initiative 3.2) -->
				{#if data.similarPhotos && data.similarPhotos.length > 0}
					<div class="mb-8">
						<RelatedPhotosCarousel
							photos={data.similarPhotos}
							title="Visually Similar Photos"
							onPhotoClick={handleRelatedPhotoClick}
						/>
					</div>
				{/if}

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
			<p class="text-charcoal-300 mb-6">{data.photo.caption}</p>
			<button
				onclick={() => goto(`${base}/explore`)}
				class="px-6 py-3 bg-gold-500 text-charcoal-950 rounded-md hover:bg-gold-400 transition-colors"
			>
				Back to Gallery
			</button>
		</div>
	</div>
{/if}
