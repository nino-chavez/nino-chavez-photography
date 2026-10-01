<script lang="ts">
	import { base } from '$app/paths';
	import { ArrowLeft, Sparkles } from 'lucide-svelte';
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


<div class="collection-page">
	<header class="collection-opening collection-header-animate">
		<!-- Back Navigation -->
		<a
			href="{base}/collections"
			class="collection-back"
		>
			<ArrowLeft class="w-4 h-4" />
			<span>Back to Collections</span>
		</a>

		<!-- Collection Header -->
		<div class="collection-copy">
			<p class="collection-eyebrow">{isPortfolio ? 'Portfolio collection' : 'Curated collection'}</p>
			<Typography variant="h1" class="collection-title">
				{data.collection.title}
			</Typography>

			<Typography variant="body" class="collection-narrative">
				{data.collection.narrative}
			</Typography>

			<Typography variant="body" class="collection-description">
				{data.collection.description}
			</Typography>
			<p class="collection-count">{data.collection.photoCount} photos</p>
		</div>
	</header>

<!-- Photo Grid -->
<section class="collection-results" aria-labelledby="collection-results-title">
	<div class="collection-results-heading">
		<h2 id="collection-results-title">All photographs</h2>
		<p>Page {data.currentPage}</p>
	</div>
	{#if data.photos.length > 0}
		<div class="collection-photo-grid">
			{#each data.photos as photo, index}
				<div class="collection-card-animate" style="animation-delay: {index * 50}ms">
					<PhotoCard {photo} {index} favoriteSurface="collection" onclick={handlePhotoClick} />
				</div>
			{/each}
		</div>
	{:else}
		<!-- Empty State -->
		<div class="collection-empty collection-header-animate">
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
</section>
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
	.collection-page { color: var(--color-charcoal-50); }
	.collection-opening, .collection-results { width: min(1320px, calc(100% - 64px)); margin-inline: auto; }
	.collection-opening { padding-block: 24px 34px; }
	.collection-back { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; margin-bottom: 18px; color: var(--color-charcoal-300); font-size: 14px; }
	.collection-back:hover { color: var(--color-gold-500); }
	.collection-copy { max-width: 780px; }
	.collection-eyebrow { margin-bottom: 14px; color: var(--color-gold-500); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
	.collection-copy :global(.collection-title) { margin-bottom: 18px; color: var(--color-charcoal-50); font-family: Montserrat, sans-serif; font-size: clamp(32px, 3.2vw, 46px); font-weight: 750; line-height: 1.08; letter-spacing: -.035em; overflow-wrap: anywhere; }
	.collection-copy :global(.collection-narrative) { margin-bottom: 8px; color: var(--color-charcoal-200); font-size: 17px; line-height: 1.5; }
	.collection-copy :global(.collection-description) { max-width: 680px; color: var(--color-charcoal-300); font-size: 14px; line-height: 1.6; }
	.collection-count { margin-top: 18px; color: var(--color-charcoal-300); font-size: 14px; }
	.collection-results { padding-block: 26px 72px; border-top: 1px solid var(--color-charcoal-800); }
	.collection-results-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 12px 20px; margin-bottom: 22px; }
	.collection-results-heading h2 { font-family: Montserrat, sans-serif; font-size: 24px; font-weight: 700; letter-spacing: -.025em; }
	.collection-results-heading p { color: var(--color-charcoal-300); font-size: 14px; }
	.collection-photo-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
	.collection-photo-grid :global(.photo-card) { border: 0; border-radius: 0; transform: none; box-shadow: none; }
	.collection-empty { padding-block: 64px; text-align: center; }
	@media (max-width: 900px) { .collection-photo-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	@media (max-width: 640px) {
		.collection-opening, .collection-results { width: calc(100% - 40px); }
		.collection-opening { padding-block: 8px 28px; }
		.collection-copy :global(.collection-title) { font-size: 32px; }
		.collection-results-heading h2 { font-size: 22px; }
		.collection-photo-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
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
