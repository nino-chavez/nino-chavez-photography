<script lang="ts">
	import { base } from '$app/paths';
	import { ArrowLeft, Award, Sparkles } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Typography from '$lib/components/ui/Typography.svelte';
	import PhotoCard from '$lib/components/gallery/PhotoCard.svelte';
	import Lightbox from '$lib/components/gallery/Lightbox.svelte';
	import Pagination from '$lib/components/ui/Pagination.svelte';
	import type { PageData } from './$types';
	import type { Photo } from '$types/photo';

	// Svelte 5 Runes: $props to receive server data
	let { data }: { data: PageData } = $props();

	// Lightbox state (same pattern as explore/albums pages)
	let lightboxOpen = $state(false);
	let selectedPhotoIndex = $state(0);

	// The visible grid + Pagination stay bound to exactly one server page (`data.photos`) —
	// same reasoning as the share page: a numbered pager and a growing grid don't mix (the
	// per-card `animation-delay: index * 50ms` above would replay on every appended card, and
	// the pager's page count would stop matching what's on screen). Only the lightbox gets its
	// own growing list, seeded from this page, so Next can walk past the page boundary.
	//
	// Reseeded on every `data` change (an $effect, not a one-time `untrack`): handlePageChange
	// below navigates with `goto()` — no full reload — so this component instance stays alive
	// across a page change and a one-time seed would keep the lightbox showing the PREVIOUS
	// page's photos after clicking to page 2.
	let loadedPhotos = $state<Photo[]>([]);
	let nextPage = $state(1);
	let loadingMore = $state(false);
	// Plain variable, not $state — it's read/written only inside loadMore's own async flow,
	// never rendered, so it doesn't need reactivity. Bumped every reseed so a page-N fetch
	// that was still in flight when the visitor changed pages (closed the lightbox, clicked
	// a DIFFERENT pager link before the fetch returned) can tell it's stale and drop its
	// result instead of appending onto the now-reseeded list.
	let loadGeneration = 0;
	$effect(() => {
		loadedPhotos = data.photos;
		nextPage = data.currentPage + 1;
		loadingMore = false;
		loadGeneration++;
	});

	const precedingCount = $derived((data.currentPage - 1) * data.pageSize);
	const hasMore = $derived(precedingCount + loadedPhotos.length < data.totalCount);

	function handlePhotoClick(photo: Photo) {
		// `id`, not `image_key` — a collection spans every album, and image_key values repeat
		// across different albums' camera rolls (confirmed: 120 values collide table-wide).
		const index = loadedPhotos.findIndex((p) => p.id === photo.id);

		if (index !== -1) {
			selectedPhotoIndex = index;
			lightboxOpen = true;
		}
	}

	function handleLightboxNavigate(newIndex: number) {
		selectedPhotoIndex = newIndex;
	}

	async function fetchPage(pageNum: number): Promise<Photo[]> {
		const res = await fetch(
			`${base}/api/collection-photos?slug=${encodeURIComponent(data.collection.slug)}&page=${pageNum}`
		);
		if (!res.ok) return [];
		const { photos } = (await res.json()) as { photos: Photo[] };
		return photos ?? [];
	}

	async function loadMore(): Promise<void> {
		if (loadingMore || !hasMore) return;
		loadingMore = true;
		const gen = loadGeneration;
		const pageToFetch = nextPage;
		try {
			const photos = await fetchPage(pageToFetch);
			if (gen !== loadGeneration) return; // reseeded (page/sort/month changed) — drop it
			if (photos.length > 0) {
				loadedPhotos = [...loadedPhotos, ...photos];
				nextPage = pageToFetch + 1;
			}
		} catch (err) {
			console.error('[collections] loadMore failed', err);
		} finally {
			if (gen === loadGeneration) loadingMore = false;
		}
	}

	// Determine if this is Portfolio Excellence for special styling
	let isPortfolio = $derived(data.collection.slug === 'portfolio-excellence');

	// Pagination handler
	function handlePageChange(newPage: number) {
		const url = new URL($page.url);
		url.searchParams.set('page', newPage.toString());
		goto(url.toString(), { keepFocus: true });
	}
</script>


<!-- Page Header -->
<div class="collection-header-animate bg-charcoal-950/95 backdrop-blur-sm border-b border-charcoal-800/50">
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
		<!-- Back Navigation -->
		<a
			href="{base}/collections"
			class="inline-flex items-center gap-2 text-sm text-charcoal-400 hover:text-gold-500 transition-colors mb-4"
		>
			<ArrowLeft class="w-4 h-4" />
			<span>Back to Collections</span>
		</a>

		<!-- Collection Header -->
		<div class="mb-4">
			<div class="flex items-center gap-3 mb-2">
				{#if isPortfolio}
					<div class="bg-gold-500/10 border border-gold-500/20 text-gold-500 px-3 py-1 rounded-full flex items-center gap-2 text-xs font-medium">
						<Award class="w-3.5 h-3.5" />
						<span>Excellence</span>
					</div>
				{:else}
					<Sparkles class="w-5 h-5 text-gold-500" />
				{/if}
				<Typography variant="caption" class="text-charcoal-400 text-xs">
					{data.collection.photoCount} photos
				</Typography>
			</div>

			<Typography variant="h1" class="text-2xl lg:text-3xl mb-3">
				{data.collection.title}
			</Typography>

			<Typography variant="body" class="text-charcoal-400 text-base mb-2 italic">
				{data.collection.narrative}
			</Typography>

			<Typography variant="body" class="text-charcoal-400 text-sm max-w-3xl">
				{data.collection.description}
			</Typography>
		</div>
	</div>
</div>

<!-- Photo Grid -->
<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
	{#if data.photos.length > 0}
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
			{#each data.photos as photo, index}
				<div class="collection-card-animate" style="animation-delay: {index * 50}ms">
					<PhotoCard {photo} {index} onclick={handlePhotoClick} />
				</div>
			{/each}
		</div>
	{:else}
		<!-- Empty State -->
		<div class="collection-header-animate text-center py-16">
			<Sparkles class="w-16 h-16 text-charcoal-600 mx-auto mb-4" aria-hidden="true" />
			<Typography variant="h3" class="mb-2">No Photos Yet</Typography>
			<Typography variant="body" class="text-charcoal-400 text-sm">
				Photos will appear once they match this collection's criteria
			</Typography>
		</div>
	{/if}

	<!-- Pagination -->
	{#if data.totalCount > data.pageSize}
		<div class="collection-header-animate mt-8">
			<Pagination
				currentPage={data.currentPage}
				totalCount={data.totalCount}
				pageSize={data.pageSize}
				onPageChange={handlePageChange}
			/>
		</div>
	{/if}
</div>

<!-- Lightbox — its own growing list past the SSR page; grid/pager above are untouched. -->
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
	viewSource="collection"
/>

<style>
	/* PERFORMANCE: CSS animations instead of svelte-motion (saves 89KB bundle) */
	@keyframes collection-fade-in {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes collection-card-in {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.collection-header-animate {
		animation: collection-fade-in 0.3s ease-out forwards;
	}

	.collection-card-animate {
		animation: collection-card-in 0.3s ease-out forwards;
		opacity: 0;
	}

	/* Reduce motion for accessibility */
	@media (prefers-reduced-motion: reduce) {
		.collection-header-animate,
		.collection-card-animate {
			animation: none;
			opacity: 1;
		}
	}
</style>
