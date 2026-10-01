<script lang="ts">
	import { untrack } from 'svelte';
	import { base } from '$app/paths';
	import { FolderOpen } from 'lucide-svelte';
	import Typography from '$lib/components/ui/Typography.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import PhotoCard from '$lib/components/gallery/PhotoCard.svelte';
	import PopularityRail from '$lib/components/gallery/PopularityRail.svelte';
	import VideoCard from '$lib/components/gallery/VideoCard.svelte';
	import VideoPlayer from '$lib/components/gallery/VideoPlayer.svelte';
	import Lightbox from '$lib/components/gallery/Lightbox.svelte';
	import LoadMoreButton from '$lib/components/ui/LoadMoreButton.svelte';
	import BulkDownloadButton from '$lib/components/album/BulkDownloadButton.svelte';
	import ShareMenu from '$lib/components/social/ShareMenu.svelte';
	import { splitAlbumNameForDisplay, albumNameDateLabel } from '$lib/utils/canonical-album-naming';
	import { trackAnalyticsEventV2, trackEngagement } from '$lib/analytics/client';
	import { ALBUM_PHOTO_PAGE_SIZE } from '$lib/albums/pagination';
	import type { PageData } from './$types';
	import type { Photo, Video } from '$types/photo';

	// Svelte 5 Runes: $props to receive server data
	let { data }: { data: PageData } = $props();

	// Report only after the album page actually renders. The server load also runs
	// on global hover-prefetch, which would turn a cursor passing over an album link
	// into an album open. The API dedups re-renders per visitor/album/day.
	$effect(() => {
		trackEngagement('album_open', { albumKey: data.albumKey });
		trackAnalyticsEventV2({ eventName: 'album_opened', properties: { album_key: data.albumKey, view_id: crypto.randomUUID(), entry_surface: 'album_route' } });
	});

	// Lightbox state (same pattern as explore page). `lightboxSource` picks which list the
	// lightbox is currently walking: the album grid's growing `loadedPhotos`, or a curated
	// rail list (trending / fan favorites) captured at the moment the rail was clicked. The
	// rail is a curated set and must never be spliced into the grid's list — it gets its own
	// slot instead, and the lightbox switches which one it reads from.
	let lightboxOpen = $state(false);
	let selectedPhotoIndex = $state(0);
	let lightboxSource = $state<'grid' | 'rail'>('grid');
	let railLightboxPhotos = $state<Photo[]>([]);

	// One growing photo list feeds the grid AND the lightbox. The first page is
	// server-rendered; "Load more" appends each subsequent page client-side, so
	// the video grid above never re-renders and the lightbox walks past page
	// boundaries without a navigation. (The API paginates at the same size as the
	// server's initial fetch, so page N is a clean continuation.)
	// Seed once from the server page — this is a mutable snapshot, not a mirror of
	// `data.photos`, so untrack makes the "initial value only" intent explicit.
	let loadedPhotos = $state(untrack(() => data.photos));
	let nextPage = $state(2);
	let loadingMore = $state(false);
	let loadingAll = $state(false);

	// Video player state
	let activeVideo = $state<Video | null>(null);
	let videoPlayerOpen = $state(false);
	let activeVideoIndex = $state(0);

	let hasVideos = $derived(data.videos.length > 0);
	// Gates the photo-only affordances in the header, not just the grid. Two live albums hold
	// only video, and both offered a "Search photos…" box that filtered an empty set and a
	// "Download All" button whose menu read "Download 0 photos" and, when clicked, did nothing
	// at all — the worker returns "empty" and the client-side fallback returns on a zero-length
	// manifest, so the spinner flashed and stopped. Same rule the count label and the share card
	// already follow: a segment with nothing behind it is omitted, not rendered as zero.
	//
	// Keyed on the photos actually read from the base table, not `totalCount`, which comes from
	// `albums_summary` and can lead it — offering a download of photos that no query returns is
	// the failure this guard exists to prevent.
	let hasPhotos = $derived(data.photos.length > 0);

	// Header count. A segment is omitted entirely when its count is zero, rather than
	// rendered as "0 photos" — the video-only albums have no photos at all, and telling
	// a visitor there are none of a thing they never asked about is noise. This matches
	// what the album list already does for the same albums ("94 videos", no photo count).
	let countLabel = $derived.by(() => {
		const parts = [];
		if (data.totalCount > 0) {
			parts.push(`${data.totalCount.toLocaleString()} ${data.totalCount === 1 ? 'photo' : 'photos'}`);
		}
		if (data.videos.length > 0) {
			parts.push(`${data.videos.length} video${data.videos.length === 1 ? '' : 's'}`);
		}
		return parts.join(' · ');
	});

	// Section nav: with many videos the photos sit far down the page, so offer a
	// jump bar + a collapsible videos section to reach photos in one click.
	let videosCollapsed = $state(false);
	function scrollToSection(id: string) {
		document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
	}

	// Client-side search filters the full loaded set. When a query goes active we
	// pull any not-yet-loaded pages first (see $effect below), so search always
	// covers the whole album rather than just the first page.
	let searchQuery = $state('');

	let displayPhotos = $derived.by(() => {
		if (!searchQuery.trim()) return loadedPhotos;

		const query = searchQuery.toLowerCase();
		return loadedPhotos.filter((photo) =>
			photo.title?.toLowerCase().includes(query) ||
			photo.caption?.toLowerCase().includes(query) ||
			photo.image_key?.toLowerCase().includes(query)
		);
	});

	const albumDateLabel = $derived(albumNameDateLabel(data.albumName));
	const albumDisplay = $derived(splitAlbumNameForDisplay(data.albumName));
	// More album photos exist beyond what's been loaded.
	const hasMore = $derived(loadedPhotos.length < data.totalCount);
	const remaining = $derived(data.totalCount - loadedPhotos.length);

	// What the lightbox is actually bound to right now — the grid's growing list by default,
	// or the rail's own list while `lightboxSource === 'rail'`. `id` is the lookup key (not
	// `image_key`, which repeats across different albums' camera rolls — irrelevant to a
	// single-album grid, but the rail's list here is scoped to this album too, so either would
	// work; `id` is used throughout for consistency with the cross-album pages that need it).
	const lightboxPhotos = $derived(lightboxSource === 'rail' ? railLightboxPhotos : displayPhotos);
	const lightboxHasMore = $derived(lightboxSource !== 'rail' && !searchQuery.trim() && hasMore);
	const lightboxTotalCount = $derived(
		lightboxSource === 'rail'
			? railLightboxPhotos.length
			: (!searchQuery.trim() ? data.totalCount : undefined)
	);
	const lightboxOnLoadMore = $derived(lightboxSource === 'rail' ? undefined : loadMore);

	function handlePhotoClick(photo: Photo) {
		// Find the index of the clicked photo in displayPhotos
		const index = displayPhotos.findIndex((p) => p.id === photo.id);

		if (index !== -1) {
			lightboxSource = 'grid';
			selectedPhotoIndex = index;
			lightboxOpen = true;
		}
	}

	// "Popular in this album" rail — opens the SAME lightbox, walking the rail's own list
	// (whichever of trending/fan-favorites is toggled on) in rail order rather than the grid's.
	function handleRailPhotoClick(photo: Photo, activeList: Photo[]) {
		const index = activeList.findIndex((p) => p.id === photo.id);
		if (index !== -1) {
			lightboxSource = 'rail';
			railLightboxPhotos = activeList;
			selectedPhotoIndex = index;
			lightboxOpen = true;
		}
	}

	function handleLightboxNavigate(newIndex: number) {
		selectedPhotoIndex = newIndex;
	}

	// Fetch one album page in order and append it to the loaded list. Returns the
	// fetched photos (empty on failure) so loadAllRemaining can drain the album.
	async function fetchPage(page: number): Promise<Photo[]> {
		const res = await fetch(
			`${base}/api/album-photos?albumKey=${encodeURIComponent(data.albumKey)}&page=${page}`
		);
		if (!res.ok) return [];
		const { photos } = (await res.json()) as { photos: Photo[] };
		return photos ?? [];
	}

	// "Load more" — append the next page in place. The lightbox also calls this at
	// its boundary so it can advance into the next page without closing.
	async function loadMore() {
		if (loadingMore || !hasMore) return;
		loadingMore = true;
		try {
			const photos = await fetchPage(nextPage);
			if (photos.length > 0) {
				loadedPhotos = [...loadedPhotos, ...photos];
				nextPage += 1;
			}
		} catch (err) {
			console.error('[album] loadMore failed', err);
		} finally {
			loadingMore = false;
		}
	}

	// Pull every remaining page so a search covers the whole album, not just the
	// pages already loaded. Albums top out in the low hundreds, so this is a few
	// requests at most.
	async function loadAllRemaining() {
		if (loadingAll || !hasMore) return;
		loadingAll = true;
		try {
			let page = nextPage;
			const acc: Photo[] = [];
			while (loadedPhotos.length + acc.length < data.totalCount) {
				const photos = await fetchPage(page);
				if (photos.length === 0) break;
				acc.push(...photos);
				page += 1;
			}
			if (acc.length > 0) {
				loadedPhotos = [...loadedPhotos, ...acc];
				nextPage = page;
			}
		} catch (err) {
			console.error('[album] loadAllRemaining failed', err);
		} finally {
			loadingAll = false;
		}
	}

	// When a search goes active, make sure the whole album is loaded so the filter
	// can't silently miss matches on not-yet-loaded pages.
	$effect(() => {
		if (searchQuery.trim() && hasMore && !loadingAll) {
			void loadAllRemaining();
		}
	});

	function handleLightboxClose() {
		lightboxOpen = false;
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

</script>

<!--
	Title/description/OG/Twitter tags are emitted once by the root layout from
	`data.seo` (returned by this route's +page.server.ts). Don't re-declare them
	here — duplicate og:image tags let crawlers pick the wrong card.
-->

<!-- Event identity stays compact so a referred visitor can start browsing immediately. -->
<div class="album-page">
	<section class="album-opening" aria-labelledby="album-title">
		<a class="album-back" href="{base}/albums">← All events</a>
		<h1 id="album-title">{albumDisplay.title}</h1>
		<div class="album-details">
			{#if albumDisplay.levelLabel}<span>{albumDisplay.levelLabel}</span>{/if}
			{#if albumDateLabel}<span>{albumDateLabel}</span>{/if}
		</div>
		<div class="album-credits">
			<span>{countLabel}</span><a href="/about" data-sveltekit-reload>By Nino Chavez</a>
			{#if albumShareTarget.imageUrl}<span class="album-share"><ShareMenu target={albumShareTarget} variant="inline" albumKey={data.albumKey} /></span>{/if}
		</div>
	</section>

	<section class="album-collection" id="album-content" aria-labelledby="album-content-title">
		<div class="collection-heading sr-only">
			<h2 id="album-content-title">{hasPhotos && hasVideos ? 'Photos and videos' : hasPhotos ? 'All photographs' : 'All videos'}</h2>
			<p>{countLabel}</p>
		</div>
		{#if hasPhotos}
			<div class="collection-tools">
				<div class="album-search">
					<label for="album-photo-search">Photo number or description</label>
					<input id="album-photo-search" type="search" placeholder="Search this album" bind:value={searchQuery} />
				</div>
				<BulkDownloadButton albumKey={data.albumKey} albumName={data.albumName} photoCount={data.totalCount} />
			</div>
			{#if searchQuery.trim()}
				<p class="search-status" aria-live="polite">
					{#if loadingAll}Loading all {data.totalCount.toLocaleString()} photos to search…
					{:else}{displayPhotos.length.toLocaleString()} {displayPhotos.length === 1 ? 'photo' : 'photos'} found{/if}
				</p>
			{/if}
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
						{#each data.videos as video, index (video.cf_stream_id)}
							<VideoCard {video} {index} onclick={handleVideoClick} />
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Popular in this album (engagement-ranked highlights; hides if no data) -->
		{#if data.popularInAlbum && data.popularInAlbum.length > 2}
			<div class="mb-12">
				<PopularityRail
					title="Popular in this album"
					trending={data.popularInAlbum}
					onPhotoClick={handleRailPhotoClick}
				/>
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
			<div class="album-photo-grid">
				{#each displayPhotos as photo, index (photo.image_key)}
					<PhotoCard {photo} {index} favoriteSurface="album" onclick={handlePhotoClick} priority={index < 4} />
				{/each}
			</div>

			<!-- Load more — appends in place; videos above never re-render. Hidden
			     during search since the $effect loads the whole album to filter. -->
			{#if hasMore && !searchQuery.trim()}
				<div class="mt-8">
					<LoadMoreButton
						hasMore={hasMore}
						remaining={remaining}
						batchSize={ALBUM_PHOTO_PAGE_SIZE}
						loading={loadingMore}
						onLoadMore={loadMore}
					/>
				</div>
			{/if}
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


	</section>
</div>

<!-- Lightbox (same component as explore page). Walks the grid's full loaded list, pulling
     the next page at its boundary when not searching — or, when opened from the "Popular in
     this album" rail, walks that curated list instead (see lightboxSource above). -->
<Lightbox
	bind:open={lightboxOpen}
	photo={lightboxPhotos[selectedPhotoIndex] || null}
	photos={lightboxPhotos}
	currentIndex={selectedPhotoIndex}
	onClose={handleLightboxClose}
	onNavigate={handleLightboxNavigate}
	hasMore={lightboxHasMore}
	onLoadMore={lightboxOnLoadMore}
	loadingMore={loadingMore}
	totalCount={lightboxTotalCount}
	indexOffset={0}
	viewSource="album"
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


<style>
	.album-page { color: var(--color-charcoal-50); }
	.album-opening, .album-collection { width: min(1320px, calc(100% - 64px)); margin-inline: auto; }
	.album-opening { padding-block: 8px 16px; }
	.album-back { display: inline-flex; align-items: center; min-height: 44px; color: var(--color-charcoal-300); font-size: 14px; margin-bottom: 8px; }
	.album-back:hover, .album-credits a:hover { color: var(--color-gold-500); }
	h1 { margin: 0; color: var(--color-charcoal-50); font-family: Montserrat, sans-serif; font-size: clamp(28px, 2.5vw, 36px); font-weight: 750; line-height: 1.12; letter-spacing: -.025em; overflow-wrap: anywhere; }
	.album-details { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 10px; color: var(--color-charcoal-300); font-size: 14px; }
	.album-credits { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 20px; margin-top: 8px; min-height: 44px; font-size: 14px; }
	.album-credits a { color: inherit; text-underline-offset: 4px; }
	.album-share { margin-left: auto; }
	.album-share :global(button) { min-height: 44px; }
	.album-collection { padding-block: 16px 72px; border-top: 1px solid var(--color-charcoal-800); scroll-margin-top: 116px; }
	.collection-heading { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px 24px; }
	.collection-heading h2 { font-family: Montserrat, sans-serif; font-size: 24px; font-weight: 700; letter-spacing: -.025em; }
	.collection-heading p { color: var(--color-charcoal-300); font-size: 14px; }
	.collection-tools { position: sticky; top: var(--gallery-header-height); z-index: 30; background: var(--color-charcoal-950); display: flex; align-items: end; flex-wrap: wrap; gap: 16px; margin-block: 12px 20px; padding-block: 12px; border-block: 1px solid var(--color-charcoal-800); }
	.collection-tools :global(.bulk-download-container > button) { min-height: 44px; }
	.collection-tools :global(.bulk-download-container > button > span) { display: inline; }
	.album-search { flex: 1 1 300px; min-width: 0; }
	.album-search label { display: block; margin-bottom: 8px; font-size: 14px; font-weight: 650; }
	.album-search input { display: block; width: 100%; min-height: 44px; padding: 10px 14px; border: 1px solid var(--color-charcoal-700); background: var(--color-charcoal-950); color: var(--color-charcoal-50); border-radius: 0; font-size: 16px; }
	.album-search input::placeholder { color: var(--color-charcoal-300); }
	.search-status { margin-bottom: 18px; color: var(--color-charcoal-300); font-size: 14px; }
	.album-photo-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
	.album-photo-grid :global(.photo-card) { border: 0; border-radius: 0; transform: none; box-shadow: none; }
	.album-collection :global(.photo-card:focus-visible), .album-page :global(a:focus-visible), .album-page :global(button:focus-visible), .album-search input:focus-visible { outline: 2px solid var(--color-gold-500); outline-offset: 4px; }
	@media (max-width: 900px) {
		.album-photo-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
	}
	@media (max-width: 640px) {
		.album-opening, .album-collection { width: calc(100% - 40px); }
		.album-back { font-size: 13px; }
		.album-credits { gap: 8px 16px; }
		.collection-heading h2 { font-size: 22px; }
		.album-search { flex: 1 1 120px; }
		.collection-tools { gap: 8px; }
		.collection-tools :global(.bulk-download-menu) { left: 0; right: auto; max-width: calc(100vw - 40px); }
		.album-photo-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
	}
</style>
