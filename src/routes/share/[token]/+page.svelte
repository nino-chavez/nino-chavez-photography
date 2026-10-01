<script lang="ts">
	import { untrack } from 'svelte';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { FolderOpen } from 'lucide-svelte';
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

<div class="shared-page" style="animation: fade-slide-up 0.3s ease-out forwards">
	<header class="shared-opening">
		<div class="shared-title-row">
				<div class="shared-copy">
					<p class="shared-eyebrow">Shared album</p>
						<Typography variant="h1" class="shared-title">{data.albumName}</Typography>
						<Typography variant="caption" class="shared-count">
							{data.totalCount.toLocaleString()} {data.totalCount === 1 ? 'photo' : 'photos'}
						</Typography>
				</div>

		</div>
	</header>

	<div class="shared-tools">
				<BulkDownloadButton
					albumKey={data.albumKey}
					albumName={data.albumName}
					photoCount={data.totalCount}
				/>
	</div>

	<!-- Photo Grid -->
	<div class="shared-results">
		{#if data.photos.length > 0}
			<div class="shared-grid">
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

<style>
	.shared-tools { position: sticky; top: var(--gallery-header-height); z-index: 30; padding-block: 10px; background: var(--color-charcoal-950); }
	.shared-page { color: var(--color-charcoal-50); }
	.shared-opening, .shared-tools, .shared-results { width: min(1320px, calc(100% - 64px)); margin-inline: auto; }
	.shared-opening { padding-block: 40px 28px; border-bottom: 1px solid var(--color-charcoal-800); }
	.shared-title-row { display: flex; align-items: end; justify-content: space-between; gap: 24px; }
	.shared-copy { min-width: 0; }
	.shared-eyebrow { margin-bottom: 14px; color: var(--color-gold-500); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
	.shared-copy :global(.shared-title) { color: var(--color-charcoal-50); font-family: Montserrat, sans-serif; font-size: clamp(32px, 3.2vw, 46px); font-weight: 750; line-height: 1.08; letter-spacing: -.035em; overflow-wrap: anywhere; }
	.shared-copy :global(.shared-count) { display: block; margin-top: 12px; color: var(--color-charcoal-300); font-size: 14px; }
	.shared-results { padding-block: 24px 72px; }
	.shared-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
	.shared-grid :global(.photo-card) { border: 0; border-radius: 0; transform: none; box-shadow: none; }
	@media (max-width: 900px) { .shared-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	@media (max-width: 640px) {
		.shared-opening, .shared-tools, .shared-results { width: calc(100% - 40px); }
		.shared-opening { padding-block: 24px 22px; }
		.shared-title-row { align-items: stretch; flex-direction: column; }
		.shared-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
	}
</style>
