<script lang="ts">
	/*
	  PopularityRail — horizontal carousel of popular photos.
	  Mirrors RelatedPhotosCarousel's scroll mechanics; adds an optional
	  Trending <-> Fan Favorites toggle and a subtle gold rank badge on the top
	  few. Renders nothing when the active list is empty (no sad empty state).
	*/
	import { ChevronLeft, ChevronRight, Flame, Star } from 'lucide-svelte';
	import Typography from '$lib/components/ui/Typography.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import PhotoCard from '$lib/components/gallery/PhotoCard.svelte';
	import type { Photo } from '$types/photo';

	interface Props {
		title?: string;
		/** Primary (trending) list. */
		trending: Photo[];
		/** Optional all-time list; presence enables the Trending<->Fan Favorites toggle. */
		favorites?: Photo[];
		/** Number of leading cards that get a rank badge. */
		badgeTopN?: number;
	}

	let { title = 'Trending', trending, favorites, badgeTopN = 3 }: Props = $props();

	let mode = $state<'trending' | 'all_time'>('trending');
	const hasToggle = $derived(!!favorites && favorites.length > 0);
	const photos = $derived(mode === 'all_time' && favorites ? favorites : trending);

	let scrollContainer: HTMLUListElement | undefined = $state();
	let canScrollLeft = $state(false);
	let canScrollRight = $state(true);
	const scrollAmount = 900;

	function scrollLeft() {
		scrollContainer?.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
	}
	function scrollRight() {
		scrollContainer?.scrollBy({ left: scrollAmount, behavior: 'smooth' });
	}
	function updateScrollButtons() {
		if (!scrollContainer) return;
		canScrollLeft = scrollContainer.scrollLeft > 0;
		canScrollRight =
			scrollContainer.scrollLeft < scrollContainer.scrollWidth - scrollContainer.clientWidth - 10;
	}

	$effect(() => {
		// Re-evaluate when the active list changes (toggle) or on mount.
		void photos;
		if (scrollContainer) {
			scrollContainer.scrollLeft = 0;
			updateScrollButtons();
		}
	});
</script>

{#if photos.length > 0}
	<section class="relative" aria-label={title}>
		<!-- Header: title + optional toggle + scroll controls -->
		<div class="flex items-center justify-between mb-4 gap-4 flex-wrap">
			<Typography variant="h3" class="text-2xl">{title}</Typography>

			<div class="flex items-center gap-3">
				{#if hasToggle}
					<div class="flex rounded-lg border border-charcoal-800 overflow-hidden" role="group" aria-label="Sort popularity">
						<button
							onclick={() => (mode = 'trending')}
							aria-pressed={mode === 'trending'}
							class="px-3 py-1.5 text-sm font-medium transition-colors {mode === 'trending'
								? 'bg-gold-500 text-charcoal-950'
								: 'bg-charcoal-900 text-charcoal-300 hover:text-white'}"
						>
							Trending
						</button>
						<button
							onclick={() => (mode = 'all_time')}
							aria-pressed={mode === 'all_time'}
							class="px-3 py-1.5 text-sm font-medium transition-colors {mode === 'all_time'
								? 'bg-gold-500 text-charcoal-950'
								: 'bg-charcoal-900 text-charcoal-300 hover:text-white'}"
						>
							Fan Favorites
						</button>
					</div>
				{/if}

				<div class="flex items-center gap-2">
					<button
						onclick={scrollLeft}
						disabled={!canScrollLeft}
						class="p-2 rounded-lg bg-charcoal-900 border border-charcoal-800 hover:border-gold-500/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
						aria-label="Scroll left"
					>
						<ChevronLeft class="w-5 h-5" />
					</button>
					<button
						onclick={scrollRight}
						disabled={!canScrollRight}
						class="p-2 rounded-lg bg-charcoal-900 border border-charcoal-800 hover:border-gold-500/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
						aria-label="Scroll right"
					>
						<ChevronRight class="w-5 h-5" />
					</button>
				</div>
			</div>
		</div>

		<!-- Carousel -->
		<ul
			bind:this={scrollContainer}
			onscroll={updateScrollButtons}
			class="flex gap-6 overflow-x-auto scroll-smooth pb-2 -mx-2 px-2 list-none m-0 rail-scroll"
		>
			{#each photos as photo, index (photo.id)}
				<li class="flex-none w-[280px] relative">
					{#if index < badgeTopN}
						<div class="absolute top-2 left-2 z-10">
							<Badge variant="gold" size="sm">
								{#if mode === 'all_time'}
									<Star class="w-3 h-3" aria-hidden="true" /> Fan favorite
								{:else}
									<Flame class="w-3 h-3" aria-hidden="true" /> Trending
								{/if}
							</Badge>
						</div>
					{/if}
					<PhotoCard {photo} {index} />
				</li>
			{/each}
		</ul>

		{#if canScrollLeft}
			<div class="absolute left-0 top-16 bottom-0 w-16 bg-gradient-to-r from-charcoal-950 to-transparent pointer-events-none" aria-hidden="true"></div>
		{/if}
		{#if canScrollRight}
			<div class="absolute right-0 top-16 bottom-0 w-16 bg-gradient-to-l from-charcoal-950 to-transparent pointer-events-none" aria-hidden="true"></div>
		{/if}
	</section>
{/if}

<style>
	/* Hide the native scrollbar — the rail is driven by the prev/next buttons and
	   the gradient edge fades, so the visible track read as an iframe/artifact. */
	.rail-scroll {
		scrollbar-width: none; /* Firefox */
		-ms-overflow-style: none; /* legacy Edge */
	}
	.rail-scroll::-webkit-scrollbar {
		display: none; /* WebKit/Blink */
	}
</style>
