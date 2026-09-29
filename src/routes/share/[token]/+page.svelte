<script lang="ts">
	import { untrack } from 'svelte';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { FolderOpen, Camera } from 'lucide-svelte';
	import Typography from '$lib/components/ui/Typography.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import PhotoCard from '$lib/components/gallery/PhotoCard.svelte';
	import Lightbox from '$lib/components/gallery/Lightbox.svelte';
	import Pagination from '$lib/components/ui/Pagination.svelte';
	import BulkDownloadButton from '$lib/components/album/BulkDownloadButton.svelte';
	import type { PageData } from './$types';
	import type { Photo } from '$types/photo';

	let { data }: { data: PageData } = $props();

	let lightboxOpen = $state(false);
	let selectedPhotoIndex = $state(0);

	// The visible grid stays exactly one server page (`data.photos`) — Pagination's ?page=
	// links keep working unchanged. The lightbox gets its OWN growing list, seeded from that
	// same page, so Next can walk past the page boundary without closing. `untrack` makes the
	// "seed once, then this is a mutable snapshot, not a mirror of `data.photos`" intent
	// explicit — same pattern as the public album page's `loadedPhotos`. A full page
	// navigation (see handlePageChange) reloads the whole app, so this re-seeds correctly.
	let loadedPhotos = $state(untrack(() => data.photos));
	let nextPage = $state(untrack(() => data.currentPage + 1));
	let loadingMore = $state(false);

	// How many photos precede this page in the whole album — the lightbox's counter offset,
	// and the baseline `hasMore` counts up from as `loadedPhotos` grows.
	const precedingCount = $derived((data.currentPage - 1) * data.pageSize);
	const hasMore = $derived(precedingCount + loadedPhotos.length < data.totalCount);

	function handlePhotoClick(photo: Photo) {
		// `id`, not `image_key` — a share link's album is one album, but a visitor could still
		// land here after browsing a cross-album page in the same session; keying by the
		// camera's own filename risks matching the wrong photo (DSC numbers reset per card and
		// repeat across albums — confirmed non-unique globally, though not within one album).
		const index = loadedPhotos.findIndex((p) => p.id === photo.id);
		if (index !== -1) {
			selectedPhotoIndex = index;
			lightboxOpen = true;
		}
	}

	function handleLightboxNavigate(newIndex: number) {
		selectedPhotoIndex = newIndex;
	}

	// Fetch one album page and append it to the lightbox's list. Reuses /api/album-photos'
	// page mode — the same endpoint the public album page's lightbox uses — scoped by
	// albumKey with a service_role read, so it serves this UNLISTED album correctly.
	async function fetchPage(pageNum: number): Promise<Photo[]> {
		const res = await fetch(
			`${base}/api/album-photos?albumKey=${encodeURIComponent(data.albumKey)}&page=${pageNum}`
		);
		if (!res.ok) return [];
		const { photos } = (await res.json()) as { photos: Photo[] };
		return photos ?? [];
	}

	async function loadMore(): Promise<void> {
		if (loadingMore || !hasMore) return;
		loadingMore = true;
		try {
			const photos = await fetchPage(nextPage);
			if (photos.length > 0) {
				loadedPhotos = [...loadedPhotos, ...photos];
				nextPage += 1;
			}
		} catch (err) {
			console.error('[share] loadMore failed', err);
		} finally {
			loadingMore = false;
		}
	}

	function handlePageChange(newPage: number) {
		const url = new URL($page.url);
		url.searchParams.set('page', String(newPage));
		window.location.href = url.toString();
	}
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
	<title>{data.albumName} | Shared Album</title>
</svelte:head>

<!-- Clean Header for Shared Albums -->
<div style="animation: fade-slide-up 0.3s ease-out forwards">
	<div class="sticky top-0 z-20 bg-charcoal-950/95 backdrop-blur-sm border-b border-charcoal-800/50">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
			<div class="flex items-center justify-between gap-4">
				<div class="flex items-center gap-3 min-w-0">
					<Camera class="w-5 h-5 text-gold-500 shrink-0" />
					<div class="min-w-0">
						<Typography variant="h1" class="text-xl lg:text-2xl truncate">{data.albumName}</Typography>
						<Typography variant="caption" class="text-charcoal-400 text-xs">
							{data.totalCount.toLocaleString()} {data.totalCount === 1 ? 'photo' : 'photos'}
						</Typography>
					</div>
				</div>
				<BulkDownloadButton
					albumKey={data.albumKey}
					albumName={data.albumName}
					photoCount={data.totalCount}
				/>
			</div>
		</div>
	</div>

	<!-- Photo Grid -->
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
		{#if data.photos.length > 0}
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
				{#each data.photos as photo, index}
					<PhotoCard {photo} {index} favoriteSurface="shared_link" onclick={handlePhotoClick} />
				{/each}
			</div>

			<div class="mt-8">
				<Pagination
					currentPage={data.currentPage}
					totalCount={data.totalCount}
					pageSize={data.pageSize}
					onPageChange={handlePageChange}
				/>
			</div>
		{:else}
				<div style="animation: fade-in 0.3s ease-out forwards">
					<Card padding="lg" class="text-center">
						<FolderOpen class="w-16 h-16 text-charcoal-600 mx-auto mb-4" aria-hidden="true" />
						<Typography variant="h3" class="mb-2">No photos found</Typography>
						<Typography variant="body" class="text-charcoal-400 text-sm">
							This album is empty.
						</Typography>
					</Card>
				</div>
		{/if}
	</div>
</div>

<!--
	This page paginates server-side, so `data.photos` is one page (48) of a larger album. Without
	`totalCount`/`indexOffset` the lightbox counts within that slice — a client on page 2 of a
	100-photo album opened the first thumbnail and read "1 / 48", the same numbers as page 1.
	The grid and Pagination's ?page= links stay bound to `data.photos` (one server page) —
	only the lightbox is bound to `loadedPhotos`, which grows past the page boundary via
	`loadMore` so Next doesn't dead-end at the last photo of a page (it used to: hasMore/
	onLoadMore were never wired here, so canGoNext went false with no way back in except
	closing the lightbox and using the pager).
-->
<Lightbox
	bind:open={lightboxOpen}
	photo={loadedPhotos[selectedPhotoIndex] || null}
	photos={loadedPhotos}
	currentIndex={selectedPhotoIndex}
	onNavigate={handleLightboxNavigate}
	hasMore={hasMore}
	onLoadMore={loadMore}
	loadingMore={loadingMore}
	totalCount={data.totalCount}
	indexOffset={precedingCount}
	viewSource="direct"
/>
