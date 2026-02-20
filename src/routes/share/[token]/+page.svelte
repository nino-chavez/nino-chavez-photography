<script lang="ts">
	import { page } from '$app/stores';
	import { Motion } from 'svelte-motion';
	import { FolderOpen, Camera } from 'lucide-svelte';
	import { MOTION } from '$lib/motion-tokens';
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

	function handlePhotoClick(photo: Photo) {
		const index = data.photos.findIndex((p) => p.image_key === photo.image_key);
		if (index !== -1) {
			selectedPhotoIndex = index;
			lightboxOpen = true;
		}
	}

	function handleLightboxNavigate(newIndex: number) {
		selectedPhotoIndex = newIndex;
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
<Motion let:motion initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
	<div use:motion class="sticky top-0 z-20 bg-charcoal-950/95 backdrop-blur-sm border-b border-charcoal-800/50">
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
	<div use:motion class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
		{#if data.photos.length > 0}
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
				{#each data.photos as photo, index}
					<PhotoCard {photo} {index} onclick={handlePhotoClick} />
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
			<Motion
				let:motion
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={MOTION.spring.gentle}
			>
				<div use:motion>
					<Card padding="lg" class="text-center">
						<FolderOpen class="w-16 h-16 text-charcoal-600 mx-auto mb-4" aria-hidden="true" />
						<Typography variant="h3" class="mb-2">No photos found</Typography>
						<Typography variant="body" class="text-charcoal-400 text-sm">
							This album is empty.
						</Typography>
					</Card>
				</div>
			</Motion>
		{/if}
	</div>
</Motion>

<Lightbox
	bind:open={lightboxOpen}
	photo={data.photos[selectedPhotoIndex] || null}
	photos={data.photos}
	currentIndex={selectedPhotoIndex}
	onNavigate={handleLightboxNavigate}
/>
