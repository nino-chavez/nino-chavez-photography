<script lang="ts">
	import type { PageData } from './$types';
	import { base } from '$app/paths';
	import PremiumHero from '$lib/components/ui/PremiumHero.svelte';
	import { createAlbumSlug } from '$lib/utils';
	// PERFORMANCE: Removed svelte-motion, using CSS animations instead
	import { Camera, Search, ArrowRight } from 'lucide-svelte';

	/** "Jun 13, 2026" from an ISO timestamp; empty string if absent/invalid (no fake dates). */
	function formatEventDate(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	/** Conservative "19,000+" / "250+" rounding for the credibility strip — always
	 *  rounds DOWN so the number never overstates the real count. */
	function approxCount(n: number): string {
		if (n >= 1000) return `${Math.floor(n / 1000).toLocaleString()},000+`;
		if (n >= 100) return `${Math.floor(n / 10) * 10}+`;
		return String(n);
	}

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// Hero rotation = curated flickday landscape frames (the brand's recent/homepage shots),
	// served as optimized static webp. The portrait portfolio shots are excluded — they crop
	// badly in the full-bleed landscape hero. Source: apps/flickdaymedia/images/gallery.
	const heroImages = [
		`${base}/images/hero/flickday/fd-12.webp`,
		`${base}/images/hero/flickday/fd-38.webp`,
		`${base}/images/hero/flickday/fd-18.webp`,
		`${base}/images/hero/flickday/fd-26.webp`,
		`${base}/images/hero/flickday/fd-21.webp`,
		`${base}/images/hero/flickday/fd-48.webp`
	];

	// "Selected work" = Nino's curated flickday portfolio (portrait), his actual selected
	// work — a stronger statement than an engagement heuristic. Source: apps/flickdaymedia.
	const flickdayPortfolio = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '13'].map(
		(n) => `${base}/images/hero/flickday/portfolio/p-${n}.webp`
	);
</script>

<svelte:head>
	<title>Nino Chavez — Volleyball Event Photography</title>
	<meta name="description" content="Find your photos from volleyball events — club, high school, and college tournaments and matches. Browse and search galleries by event, team, or jersey number." />

	<!-- Preload the flickday lead frame for instant LCP -->
	<link rel="preload" as="image" href="{base}/images/hero/flickday/fd-12-mobile.webp" fetchpriority="high" media="(max-width: 1023px)" />
	<link rel="preload" as="image" href="{base}/images/hero/flickday/fd-12.webp" fetchpriority="high" media="(min-width: 1024px)" />
</svelte:head>

<!-- Full-bleed gallery hero: one curated frame + the find-your-photos search overlaid. -->
<PremiumHero
	fullBleed
	images={heroImages}
	staticDesktop="{base}/images/hero/flickday/fd-12.webp"
	staticMobile="{base}/images/hero/flickday/fd-12-mobile.webp"
	title="FIND YOUR PHOTOS"
	subtitle=""
>
	<div class="w-full">
		<p class="text-base sm:text-lg text-charcoal-200 mb-5 normal-case tracking-normal font-normal max-w-md">
			Volleyball events — club, high school, and college. Search by event, team, or jersey number.
		</p>
		<form role="search" method="get" action="{base}/explore" class="flex flex-col sm:flex-row gap-2.5 max-w-lg">
			<label class="field relative flex-1 rounded-xl">
				<span class="sr-only">Search events, teams, or jersey numbers</span>
				<Search class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gold-500/80 pointer-events-none" aria-hidden="true" />
				<input
					type="search"
					name="q"
					placeholder="Find your event, team, or jersey #…"
					autocomplete="off"
					class="w-full h-14 pl-12 pr-4 rounded-xl bg-transparent text-white
					       placeholder:text-charcoal-500 focus:outline-none"
				/>
			</label>
			<button
				type="submit"
				class="btn-gold h-14 px-7 rounded-xl shrink-0 inline-flex items-center justify-center text-base"
			>
				Search
			</button>
		</form>

		<p class="mt-3 text-xs text-charcoal-400">Free to browse — find your photos, download in seconds.</p>

		{#if data.programs && data.programs.length > 0}
			<div class="mt-6">
				<p class="text-[11px] font-medium uppercase tracking-wider text-charcoal-400 mb-2.5">Jump to your team</p>
				<div class="flex flex-wrap items-center gap-x-5 gap-y-2.5 max-w-2xl">
					{#each data.programs.slice(0, 6) as program}
						<a
							href="{base}/explore?q={encodeURIComponent(program.query)}"
							class="text-sm font-medium text-white border-b border-gold-500/60 pb-0.5 hover:text-gold-300 hover:border-gold-400 transition-colors"
						>
							{program.label}
						</a>
					{/each}
					<a
						href="{base}/albums"
						class="inline-flex items-center gap-1 text-sm font-medium text-gold-500 hover:text-gold-400 transition-colors"
					>
						All events <span aria-hidden="true">→</span>
					</a>
				</div>
			</div>
		{/if}

		{#if data.stats && data.stats.totalPhotos > 0}
			<p class="mt-7 pt-5 border-t border-white/10 text-sm text-charcoal-400 max-w-lg">
				<span class="text-white font-semibold tabular-nums">{approxCount(data.stats.totalPhotos)}</span> photos
				· <span class="text-white font-semibold tabular-nums">{approxCount(data.stats.eventCount)}</span> events
				· club, HS &amp; college
			</p>
		{/if}
	</div>
</PremiumHero>

<!-- Content Sections Below Hero -->
<!-- PERFORMANCE: Using CSS animation instead of svelte-motion for better render performance -->
<div class="relative z-10 bg-charcoal-950">
	<!-- Recent events: the find-my-photos path — newest galleries, given room to breathe -->
	{#if data.recentAlbums && data.recentAlbums.length > 0}
		<section aria-label="Recent events" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 lg:pt-24">
			<div class="flex items-end justify-between mb-8">
				<div>
					<h2 class="text-3xl lg:text-4xl font-bold text-white tracking-tight">Recent events</h2>
					<p class="mt-2 text-charcoal-400">Find your gallery — newest events first.</p>
				</div>
				<a href="{base}/albums" class="text-sm font-medium text-gold-500 hover:text-gold-400 transition-colors shrink-0">
					View all →
				</a>
			</div>
			<div class="grid grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6">
				{#each data.recentAlbums.slice(0, 4) as album}
					{@const date = formatEventDate(album.latestPhotoDate)}
					<a
						href="{base}/albums/{createAlbumSlug(album.albumName, album.albumKey)}"
						data-sveltekit-preload="hover"
						class="group block transition-transform duration-200 ease-out hover:-translate-y-1"
					>
						<div class="aspect-[3/2] relative overflow-hidden rounded-xl bg-charcoal-800 border border-charcoal-800 shadow-lg shadow-black/30 transition-all duration-200 group-hover:border-gold-500/50 group-hover:shadow-[0_22px_44px_-18px_rgba(0,0,0,0.85)]">
							{#if album.coverImageUrl}
								<img
									src={album.coverImageUrl}
									alt={album.albumName}
									width="600"
									height="400"
									loading="lazy"
									decoding="async"
									class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
								/>
							{:else}
								<div class="w-full h-full flex items-center justify-center">
									<Camera class="w-8 h-8 text-charcoal-600" />
								</div>
							{/if}
						</div>
						<h3 class="mt-3 text-base font-semibold text-white group-hover:text-gold-500 transition-colors truncate">
							{album.albumName}
						</h3>
						<p class="text-sm text-charcoal-400">
							{#if date}{date} · {/if}{album.photoCount} photos
						</p>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Selected work — Nino's curated flickday portfolio (portrait gallery). Tiles link to
	     /explore to browse the full archive (these are portfolio frames, not findable DB rows). -->
	<section aria-label="Selected work" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 lg:pt-24">
		<div class="flex items-end justify-between mb-8">
			<div>
				<h2 class="text-3xl lg:text-4xl font-bold text-white tracking-tight">Selected work</h2>
				<p class="mt-2 text-charcoal-400">A few frames worth slowing down for.</p>
			</div>
			<a href="{base}/explore" class="text-sm font-medium text-gold-500 hover:text-gold-400 transition-colors shrink-0">
				Explore the gallery →
			</a>
		</div>
		<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4">
			{#each flickdayPortfolio as src}
				<a
					href="{base}/explore"
					class="group relative block aspect-[2/3] overflow-hidden rounded-xl bg-charcoal-900 border border-charcoal-800 shadow-lg shadow-black/30 transition-all duration-200 hover:-translate-y-1 hover:border-gold-500/50 hover:shadow-[0_22px_44px_-18px_rgba(0,0,0,0.85)]"
				>
					<img
						{src}
						alt="Volleyball photography by Nino Chavez"
						loading="lazy"
						decoding="async"
						class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
					/>
					<div class="absolute inset-0 bg-gradient-to-t from-charcoal-950/55 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
				</a>
			{/each}
		</div>
	</section>

	<!-- Booking path: lower slot — attendees win the fold, organizers get a real CTA.
	     "Book a shoot" triggers a real inquiry (mailto), paired with proof. -->
	<section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 lg:pt-24 pb-16 lg:pb-24">
		<div class="surface-raised rounded-2xl p-8 lg:p-12
		            flex flex-col lg:flex-row lg:items-center justify-between gap-6">
			<div>
				<h2 class="text-2xl lg:text-3xl font-bold text-white mb-2">Shooting an event?</h2>
				<p class="text-charcoal-300 max-w-xl leading-relaxed">
					Tournament, league, or club — full-coverage action galleries your athletes can find
					themselves in, usually live within days of the final whistle.
				</p>
			</div>
			<div class="flex flex-col sm:flex-row items-start sm:items-center gap-4 shrink-0">
				<a
					href="mailto:nino@ninochavez.co?subject=Event%20coverage%20inquiry"
					class="btn-gold inline-flex items-center gap-2 h-12 px-6 rounded-xl"
				>
					Book a shoot
					<ArrowRight class="w-4 h-4" />
				</a>
				<a
					href="{base}/albums"
					class="text-sm font-medium text-charcoal-300 hover:text-gold-500 transition-colors"
				>
					See sample coverage →
				</a>
			</div>
		</div>
	</section>
</div>

<style>
	/* PERFORMANCE: CSS animation instead of JS Motion for better render performance */
	@keyframes fade-in-delayed {
		from {
			opacity: 0;
			transform: translateY(30px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-fade-in-delayed {
		animation: fade-in-delayed 0.5s ease-out 0.6s forwards;
		opacity: 0; /* Start hidden, animation fills forward */
	}

	/* Reduce motion for accessibility */
	@media (prefers-reduced-motion: reduce) {
		.animate-fade-in-delayed {
			animation: none;
			opacity: 1;
		}
	}
</style>
