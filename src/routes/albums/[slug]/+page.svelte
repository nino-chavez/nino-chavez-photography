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

	// Cross-page lightbox accumulation. `lightboxPhotos` grows beyond the
	// current server page as the user navigates past its boundary; the lightbox
	// reads from this list (when not searching) so navigation flows across pages.
	let lightboxPhotos = $state(data.photos);
	let loadedThroughPage = $state(data.currentPage);
	let loadingMore = $state(false);

	// Track the last server page we synced from so the reset $effect fires ONLY
	// when the page actually changes (e.g. user paginates / lands via ?page=),
	// not on every reactive tick — which would wipe the accumulated list.
	let lastPage = data.currentPage;
	$effect(() => {
		if (data.currentPage !== lastPage) {
			lastPage = data.currentPage;
			lightboxPhotos = data.photos;
			loadedThroughPage = data.currentPage;
		}
	});

	// Index of the first photo on the current server page within the album.
	const indexOffset = $derived((data.currentPage - 1) * data.pageSize);

	// Video player state
	let activeVideo = $state<Video | null>(null);
	let videoPlayerOpen = $state(false);
	let activeVideoIndex = $state(0);

	let hasVideos = $derived(data.videos.length > 0);
	let hasPhotos = $derived(data.photos.length > 0);

	// Section nav: with many videos the photos sit far down the page, so offer a
	// jump bar + a collapsible videos section to reach photos in one click.
	let videosCollapsed = $state(false);
	function scrollToSection(id: string) {
		document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

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

	// The lightbox's photo source. While searching, stay page-local (search
	// filters only the current page). When NOT searching, use the accumulated
	// cross-page list. When not searching, displayPhotos === data.photos ===
	// lightboxPhotos[0..pageSize], so the click-to-open index maps correctly.
	const lightboxSource = $derived(searchQuery.trim() ? displayPhotos : lightboxPhotos);

	// Only enable cross-page loading when not searching and there are more
	// album photos beyond what we've accumulated.
	const hasMore = $derived(
		!searchQuery.trim() && indexOffset + lightboxPhotos.length < data.totalCount
	);

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

	// Fetch the next album page and append it to the accumulated list so the
	// lightbox can advance into it without closing.
	async function loadNextPage() {
		if (loadingMore) return;
		loadingMore = true;
		try {
			const nextPage = loadedThroughPage + 1;
			const res = await fetch(
				`${base}/api/album-photos?albumKey=${encodeURIComponent(data.albumKey)}&page=${nextPage}`
			);
			if (!res.ok) return;

			const { photos } = (await res.json()) as { photos: Photo[] };
			if (photos && photos.length > 0) {
				lightboxPhotos = [...lightboxPhotos, ...photos];
				loadedThroughPage = nextPage;
			}
		} catch (err) {
			console.error('[album] loadNextPage failed', err);
		} finally {
			loadingMore = false;
		}
	}

	// Contextual close: land the user on the server page that holds the
	// last-viewed photo, not the page they opened the lightbox from.
	function handleLightboxClose() {
		lightboxOpen = false;

		// Searching stays page-local — no cross-page navigation on close.
		if (searchQuery.trim()) return;

		const globalIndex = indexOffset + selectedPhotoIndex;
		const targetPage = Math.floor(globalIndex / data.pageSize) + 1;

		if (targetPage !== data.currentPage) {
			goto(`${base}/albums/${data.slug}?page=${targetPage}`);
		}
	}

	function handlePageChange(page: number) {
		goto(`${base}/albums/${data.slug}?page=${page}`);
	}

	function handleVideoClick(video: Video) {
		const i = data.videos.findIndex((v) => v.cf_stream_id === video.cf_stream_id);
		activeVideoIndex = i < 0 ? 0 : i;
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

		<!-- Section jump bar (only when both videos and photos exist) -->
		{#if hasVideos && hasPhotos}
			<div class="sticky top-0 z-20 -mx-4 mb-4 flex items-center gap-2 bg-charcoal-900/85 px-4 py-2 text-xs backdrop-blur">
				<button
					type="button"
					onclick={() => scrollToSection('videos-section')}
					class="rounded-full bg-charcoal-800 px-3 py-1 text-charcoal-200 transition-colors hover:bg-charcoal-700"
				>
					Videos ({data.videos.length})
				</button>
				<button
					type="button"
					onclick={() => scrollToSection('photos-section')}
					class="rounded-full bg-charcoal-800 px-3 py-1 text-charcoal-200 transition-colors hover:bg-charcoal-700"
				>
					Photos ({data.totalCount.toLocaleString()})
				</button>
				<button
					type="button"
					onclick={() => (videosCollapsed = !videosCollapsed)}
					class="ml-auto rounded-full px-3 py-1 text-charcoal-300 transition-colors hover:text-white"
				>
					{videosCollapsed ? 'Show' : 'Hide'} videos
				</button>
			</div>
		{/if}

		<!-- Video Grid -->
		{#if hasVideos}
			<div id="videos-section" class="mb-8 scroll-mt-16">
				{#if hasPhotos}
					<Typography variant="caption" class="text-charcoal-400 text-xs uppercase tracking-wider mb-4 block">
						Videos
					</Typography>
				{/if}
				{#if !videosCollapsed}
					<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
						{#each data.videos as video, index}
							<VideoCard {video} {index} onclick={handleVideoClick} />
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Photo Grid -->
		{#if displayPhotos.length > 0}
			<div id="photos-section" class="scroll-mt-16"></div>
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

<!-- Lightbox (same component as explore page; cross-page nav when not searching) -->
<Lightbox
	bind:open={lightboxOpen}
	photo={lightboxSource[selectedPhotoIndex] || null}
	photos={lightboxSource}
	currentIndex={selectedPhotoIndex}
	onClose={handleLightboxClose}
	onNavigate={handleLightboxNavigate}
	hasMore={hasMore}
	onLoadMore={loadNextPage}
	loadingMore={loadingMore}
	totalCount={searchQuery.trim() ? undefined : data.totalCount}
	indexOffset={searchQuery.trim() ? 0 : indexOffset}
/>

<!-- Video Player -->
{#if activeVideo}
	<VideoPlayer
		videos={data.videos}
		bind:index={activeVideoIndex}
		bind:open={videoPlayerOpen}
		onclose={() => { activeVideo = null; }}
	/>
{/if}
