<script lang="ts">
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { FolderOpen, ChevronRight } from 'lucide-svelte';
	import Typography from '$lib/components/ui/Typography.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import PhotoCard from '$lib/components/gallery/PhotoCard.svelte';
	import VideoCard from '$lib/components/gallery/VideoCard.svelte';
	import VideoPlayer from '$lib/components/gallery/VideoPlayer.svelte';
	import Lightbox from '$lib/components/gallery/Lightbox.svelte';
	import Pagination from '$lib/components/ui/Pagination.svelte';
	import BulkDownloadButton from '$lib/components/album/BulkDownloadButton.svelte';
	import ShareMenu from '$lib/components/social/ShareMenu.svelte';
	import { cfImageUrl, hasCFImage } from '$lib/utils/cloudflare-images';
	import type { PageData } from './$types';
	import type { Photo, Video } from '$types/photo';

	// Svelte 5 Runes: $props to receive server data
	let { data }: { data: PageData } = $props();

	// Lightbox state (same pattern as explore page)
	let lightboxOpen = $state(false);
	let selectedPhotoIndex = $state(0);

	// Video player state
	let activeVideo = $state<Video | null>(null);
	let videoPlayerOpen = $state(false);

	let hasVideos = $derived(data.videos.length > 0);
	let hasPhotos = $derived(data.photos.length > 0);

	// Simple search (client-side filtering of current page)
	let searchQuery = $state('');

	// Filter photos by search (client-side for current page only)
	let displayPhotos = $derived.by(() => {
		if (!searchQuery.trim()) return data.photos;

		const query = searchQuery.toLowerCase();
		return data.photos.filter((photo) =>
			photo.title?.toLowerCase().includes(query) ||
			photo.caption?.toLowerCase().includes(query) ||
			photo.image_key?.toLowerCase().includes(query)
		);
	});

	function handlePhotoClick(photo: Photo) {
		// Find the index of the clicked photo in displayPhotos
		const index = displayPhotos.findIndex((p) => p.image_key === photo.image_key);

		if (index !== -1) {
			selectedPhotoIndex = index;
			lightboxOpen = true;
		}
	}

	function handleLightboxNavigate(newIndex: number) {
		selectedPhotoIndex = newIndex;
	}

	function handlePageChange(page: number) {
		goto(`${base}/albums/${data.slug}?page=${page}`);
	}

	function handleVideoClick(video: Video) {
		activeVideo = video;
		videoPlayerOpen = true;
	}

	// Share target for album sharing
	const albumShareTarget = $derived({
		title: data.albumName,
		url: data.seo.canonical,
		imageUrl: data.seo.ogImage || ''
	});

	function goBackToAlbums() {
		goto(`${base}/albums`);
	}
</script>

<svelte:head>
	<title>{data.seo.title}</title>
	<meta name="description" content={data.seo.description} />
	<link rel="canonical" href={data.seo.canonical} />

	<meta property="og:type" content="website" />
	<meta property="og:url" content={data.seo.canonical} />
	<meta property="og:title" content={data.seo.title} />
	<meta property="og:description" content={data.seo.description} />
	{#if data.seo.ogImage}
		<meta property="og:image" content={data.seo.ogImage} />
		<meta property="og:image:alt" content={data.albumName} />
	{/if}
	<meta property="og:site_name" content="Nino Chavez Photography" />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={data.seo.title} />
	<meta name="twitter:description" content={data.seo.description} />
	{#if data.seo.ogImage}
		<meta name="twitter:image" content={data.seo.ogImage} />
	{/if}
</svelte:head>

<!-- Minimal Header - Content First Design -->
<div style="animation: fade-slide-up 0.3s ease-out forwards">
	<div class="sticky top-0 z-20 bg-charcoal-950/95 backdrop-blur-sm border-b border-charcoal-800/50">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">

			<!-- Compact Breadcrumb Navigation -->
			<nav aria-label="Breadcrumb" class="mb-2">
				<ol class="flex items-center gap-1 text-xs text-charcoal-400">
					<li>
						<button
							type="button"
							onclick={() => goto(`${base}/`)}
							class="hover:text-gold-500 transition-colors"
							aria-label="Navigate to home"
						>
							Home
						</button>
					</li>
					<li aria-hidden="true">
						<ChevronRight class="w-3 h-3" />
					</li>
					<li>
						<button
							type="button"
							onclick={goBackToAlbums}
							class="hover:text-gold-500 transition-colors"
							aria-label="Navigate to albums list"
						>
							Albums
						</button>
					</li>
					<li aria-hidden="true">
						<ChevronRight class="w-3 h-3" />
					</li>
					<li>
						<span class="text-white font-medium truncate max-w-[200px] md:max-w-none" aria-current="page">
							{data.albumName}
						</span>
					</li>
				</ol>
			</nav>

			<!-- Compact Header: Title + Count + Search -->
			<div class="flex items-center justify-between gap-4">
				<div class="flex items-center gap-2 min-w-0 flex-1">
					<Typography variant="h1" class="text-xl lg:text-2xl truncate">{data.albumName}</Typography>
					<Typography variant="caption" class="text-charcoal-400 text-xs whitespace-nowrap">
						{data.totalCount.toLocaleString()}{#if hasVideos}{' '}&middot; {data.videos.length} video{data.videos.length !== 1 ? 's' : ''}{/if}
					</Typography>
				</div>

				<!-- Desktop search + download -->
				<div class="hidden md:flex items-center gap-2">
					<button
						type="button"
						onclick={goBackToAlbums}
						class="px-2 py-1 text-xs text-charcoal-400 hover:text-gold-500 transition-colors whitespace-nowrap"
						aria-label="Back to albums"
					>
						← Back
					</button>
					<div class="flex-1 max-w-md">
						<input
							type="search"
							placeholder="Search photos..."
							bind:value={searchQuery}
							class="w-full px-4 py-2 text-sm rounded-lg bg-charcoal-900 border border-charcoal-800 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/50 transition-colors text-white placeholder-charcoal-400"
						/>
					</div>
					<BulkDownloadButton
						albumKey={data.albumKey}
						albumName={data.albumName}
						photoCount={data.totalCount}
					/>
					{#if albumShareTarget.imageUrl}
						<ShareMenu target={albumShareTarget} variant="inline" />
					{/if}
				</div>
			</div>

			<!-- Mobile search -->
			<div class="md:hidden mt-3">
				<input
					type="search"
					placeholder="Search photos..."
					bind:value={searchQuery}
					class="w-full px-4 py-2 text-sm rounded-lg bg-charcoal-900 border border-charcoal-800 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/50 transition-colors text-white placeholder-charcoal-400"
				/>
			</div>
		</div>
	</div>

	<!-- Photo Grid Content -->
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

		<!-- Search results indicator -->
		{#if searchQuery && displayPhotos.length > 0}
			<div class="mb-4">
				<Typography variant="caption" class="text-charcoal-400 text-xs">
					{displayPhotos.length.toLocaleString()} {displayPhotos.length === 1 ? 'photo' : 'photos'} found
				</Typography>
			</div>
		{/if}

		<!-- Video Grid -->
		{#if hasVideos}
			<div class="mb-8">
				{#if hasPhotos}
					<Typography variant="caption" class="text-charcoal-400 text-xs uppercase tracking-wider mb-4 block">
						Videos
					</Typography>
				{/if}
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{#each data.videos as video, index}
						<VideoCard {video} {index} onclick={handleVideoClick} />
					{/each}
				</div>
			</div>
		{/if}

		<!-- Photo Grid -->
		{#if displayPhotos.length > 0}
			{#if hasVideos}
				<Typography variant="caption" class="text-charcoal-400 text-xs uppercase tracking-wider mb-4 block">
					Photos
				</Typography>
			{/if}
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
				{#each displayPhotos as photo, index}
					<PhotoCard {photo} {index} onclick={handlePhotoClick} priority={index < 4} />
				{/each}
			</div>

			<!-- Pagination -->
			<div class="mt-8">
				<Pagination
					currentPage={data.currentPage}
					totalCount={data.totalCount}
					pageSize={data.pageSize}
					onPageChange={handlePageChange}
				/>
			</div>
		{:else if !hasVideos}
			<!-- Empty State (only show if no videos either) -->
				<div style="animation: fade-in 0.3s ease-out forwards">
					<Card padding="lg" class="text-center">
						<FolderOpen class="w-16 h-16 text-charcoal-600 mx-auto mb-4" aria-hidden="true" />
						<Typography variant="h3" class="mb-2">No content found</Typography>
						<Typography variant="body" class="text-charcoal-400 text-sm">
							{searchQuery ? 'Try adjusting your search' : 'This album is empty'}
						</Typography>
					</Card>
				</div>
		{/if}
	</div>
</div>

<!-- Lightbox (same component as explore page) -->
<Lightbox
	bind:open={lightboxOpen}
	photo={displayPhotos[selectedPhotoIndex] || null}
	photos={displayPhotos}
	currentIndex={selectedPhotoIndex}
	onNavigate={handleLightboxNavigate}
/>

<!-- Video Player -->
{#if activeVideo}
	<VideoPlayer
		video={activeVideo}
		bind:open={videoPlayerOpen}
		onclose={() => { activeVideo = null; }}
	/>
{/if}
