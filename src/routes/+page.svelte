<script lang="ts">
	import type { PageData } from './$types';
	import { base } from '$app/paths';
	import PremiumHero from '$lib/components/ui/PremiumHero.svelte';
	import PopularityRail from '$lib/components/gallery/PopularityRail.svelte';
	import { createAlbumSlug } from '$lib/utils';
	import { cfImageUrl, hasCFImage } from '$lib/utils/cloudflare-images';
	// PERFORMANCE: Removed svelte-motion, using CSS animations instead
	import { Camera, Trophy, Calendar, Search, ArrowRight } from 'lucide-svelte';

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

	// Get optimized image URL via CF Images
	function getOptimizedImageUrl(imageUrl: string | null, width: number, cfId?: string | null): string {
		if (!imageUrl) return '';

		if (hasCFImage(cfId)) {
			if (width >= 800) return cfImageUrl(cfId, 'large');
			if (width >= 400) return cfImageUrl(cfId, 'medium');
			return cfImageUrl(cfId, 'grid');
		}

		return imageUrl;
	}

	// Generate links for virtual albums
	function getVirtualAlbumLink(type: string): string {
		switch (type) {
			case 'editors-choice':
				// Link to explore page with filters for high emotional impact + quality
				return `${base}/explore?sport=volleyball&sort=emotional_impact`;
			case 'action-showcase':
				// Link to explore page with action category and high intensity
				return `${base}/explore?category=action&sport=volleyball&sort=quality`;
			default:
				return `${base}/explore`;
		}
	}

	// Hero images — array of URLs for client-side rotation
	let heroImages = $derived(
		(data.heroCandidates || [])
			.filter((p: any) => p.image_url)
			.map((p: any) => p.image_url as string)
	);
</script>

<svelte:head>
	<title>Nino Chavez — Volleyball Event Photography</title>
	<meta name="description" content="Find your photos from volleyball events — club, high school, and college tournaments and matches. Browse and search galleries by event, team, or jersey number." />

	<!-- Preload static hero WebP for instant LCP (Vercel CDN, no proxy chain) -->
	<link rel="preload" as="image" href="{base}/images/hero/hero-1-mobile.webp" fetchpriority="high" media="(max-width: 1023px)" />
	<link rel="preload" as="image" href="{base}/images/hero/hero-1-desktop.webp" fetchpriority="high" media="(min-width: 1024px)" />
</svelte:head>

<!-- Compact hero: names the work + promotes search (the find-my-photos entry) -->
<PremiumHero
	compact
	images={heroImages}
	staticHeroIndex={data.staticHeroIndex ?? 0}
	title="FIND YOUR PHOTOS"
	subtitle=""
>
	<div class="w-full max-w-xl">
		<p class="text-base text-charcoal-300 mb-5 normal-case tracking-normal font-normal">
			Volleyball events — club, high school, and college. Search by event, team, or jersey number.
		</p>
		<form role="search" method="get" action="{base}/explore" class="flex flex-col sm:flex-row gap-2.5">
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

		<!-- Lower the barrier + set expectations (parent-trust microcopy) -->
		<p class="mt-3 text-xs text-charcoal-500">
			Free to browse — find your photos, download in seconds.
		</p>

		{#if data.programs && data.programs.length > 0}
			<div class="mt-5">
				<p class="text-[11px] uppercase tracking-wider text-charcoal-500 mb-2.5">Find your team or event</p>
				<div class="flex flex-wrap gap-2">
					{#each data.programs as program}
						<a
							href="{base}/explore?q={encodeURIComponent(program.query)}"
							class="chip px-3.5 py-2 text-sm font-medium"
						>
							{program.label}
							<span class="chip-count">{program.count}</span>
						</a>
					{/each}
				</div>
			</div>
		{/if}
		<div class="mt-4">
			<a href="{base}/albums" class="text-sm text-charcoal-400 hover:text-gold-500 transition-colors">
				Or browse all events →
			</a>
		</div>

		<!-- Credibility strip: scale at a glance — fills the hero's lower-left, builds trust -->
		{#if data.stats && data.stats.totalPhotos > 0}
			<dl class="mt-7 flex flex-wrap items-end gap-x-7 gap-y-3 border-t border-charcoal-800/80 pt-5">
				<div class="flex flex-col gap-0.5">
					<dt class="text-[11px] uppercase tracking-wider text-charcoal-500">Photos</dt>
					<dd class="text-xl font-bold text-white tabular-nums">{approxCount(data.stats.totalPhotos)}</dd>
				</div>
				<div class="flex flex-col gap-0.5">
					<dt class="text-[11px] uppercase tracking-wider text-charcoal-500">Events</dt>
					<dd class="text-xl font-bold text-white tabular-nums">{approxCount(data.stats.eventCount)}</dd>
				</div>
				<div class="flex flex-col gap-0.5">
					<dt class="text-[11px] uppercase tracking-wider text-charcoal-500">Levels</dt>
					<dd class="text-xl font-bold text-white">Club · HS · College</dd>
				</div>
			</dl>
		{/if}
	</div>
</PremiumHero>

<!-- Content Sections Below Hero -->
<!-- PERFORMANCE: Using CSS animation instead of svelte-motion for better render performance -->
<div class="relative z-10 bg-charcoal-950">
	<!-- Recent Events: the find-my-photos priority — real galleries, newest first, above the fold -->
	{#if data.recentAlbums && data.recentAlbums.length > 0}
		<section aria-label="Recent events" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 lg:pt-12">
			<div class="flex items-end justify-between mb-6">
				<h2 class="text-2xl lg:text-3xl font-bold text-white">Recent events</h2>
				<a href="{base}/albums" class="text-sm font-medium text-gold-500 hover:text-gold-400 transition-colors">
					View all →
				</a>
			</div>
			<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
				{#each data.recentAlbums as album}
					{@const date = formatEventDate(album.latestPhotoDate)}
					<a
						href="{base}/albums/{createAlbumSlug(album.albumName, album.albumKey)}"
						data-sveltekit-preload="hover"
						class="group block transition-transform duration-200 ease-out hover:-translate-y-1"
					>
						<div class="aspect-[4/3] relative overflow-hidden rounded-xl bg-charcoal-800 border border-charcoal-800 shadow-lg shadow-black/30 transition-all duration-200 group-hover:border-gold-500/50 group-hover:shadow-[0_22px_44px_-18px_rgba(0,0,0,0.85)]">
							{#if album.coverImageUrl}
								<img
									src={album.coverImageUrl}
									alt={album.albumName}
									width="400"
									height="300"
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
						<h3 class="mt-2 text-sm font-semibold text-white group-hover:text-gold-500 transition-colors truncate">
							{album.albumName}
						</h3>
						<p class="text-xs text-charcoal-400">
							{#if date}{date} · {/if}{album.photoCount} photos
						</p>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Trending rail — engagement-ranked, Trending<->Fan Favorites toggle. Hides if sparse. -->
	{#if data.trendingPhotos && data.trendingPhotos.length > 2}
		<section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 animate-fade-in-delayed">
			<PopularityRail
				title="Trending this week"
				trending={data.trendingPhotos}
				favorites={data.fanFavorites}
			/>
		</section>
	{/if}

	<!-- Curated lanes: navigational entry points into the archive — distinct from
	     Trending (social proof of what's popular now). Reframed to avoid the
	     "best moments" overlap with the Trending rail above. -->
	<section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 animate-fade-in-delayed">
			<div class="text-center mb-12">
				<h2 class="text-2xl lg:text-3xl font-bold text-white mb-4">
					Browse by collection
				</h2>
				<p class="text-lg text-charcoal-300 max-w-2xl mx-auto leading-relaxed">
					Hand-built lanes into the archive — jump straight to the kind of frame you're after.
				</p>
			</div>

			<!-- Curated collection cards (recent events live in their own row above).
			     Recent moved out, so this is the two virtual collections — a centered 2-up,
			     not a 3-up with an empty third column (don't pin content in a void). -->
			{#if data.featuredAlbums && data.featuredAlbums.filter((a) => a.type !== 'recent').length > 0}
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
					{#each data.featuredAlbums.filter((a) => a.type !== 'recent') as featuredAlbum}
						{@const albumLink = featuredAlbum.album.isVirtual
							? getVirtualAlbumLink(featuredAlbum.type)
							: `${base}/albums/${createAlbumSlug(featuredAlbum.album.albumName, featuredAlbum.album.albumKey)}`
						}
						<a
							href={albumLink}
							data-sveltekit-preload="hover"
							class="group surface-raised surface-raised-interactive rounded-xl overflow-hidden block"
						>
							<!-- Album Cover Image -->
							<div class="aspect-[4/3] relative overflow-hidden">
								{#if featuredAlbum.album.coverImageUrl}
									<img
										src="{getOptimizedImageUrl(featuredAlbum.album.coverImageUrl, 800)}"
										alt="{featuredAlbum.album.albumName}"
										width="800"
										height="600"
										class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
										loading="lazy"
										decoding="async"
									/>
								{:else}
									<div class="w-full h-full bg-charcoal-800 flex items-center justify-center">
										<Camera class="w-12 h-12 text-charcoal-600" />
									</div>
								{/if}

								<!-- Overlay with album info -->
								<div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
									<div class="absolute bottom-0 left-0 right-0 p-4">
										<div class="flex items-center gap-2 text-xs text-white/80 mb-1">
											<span class="capitalize">{featuredAlbum.album.primarySport}</span>
											<span>•</span>
											<span class="capitalize">{featuredAlbum.album.primaryCategory}</span>
											{#if featuredAlbum.album.isVirtual}
												<span class="ml-auto text-gold-400">★ Curated</span>
											{/if}
										</div>
										<div class="text-xs text-white/60">
											{featuredAlbum.album.photoCount} photos
											{#if featuredAlbum.album.avgQualityScore > 0}
												• ★{featuredAlbum.album.avgQualityScore.toFixed(1)}
											{/if}
										</div>
									</div>
								</div>
							</div>

							<!-- Album Info -->
							<div class="p-6">
								<div class="flex items-center gap-2 mb-2">
									<span class="text-xs font-medium text-gold-500 bg-gold-500/10 px-2 py-1 rounded-full uppercase tracking-wide">
										{featuredAlbum.title}
									</span>
									{#if featuredAlbum.album.isVirtual}
										<span class="text-xs text-gold-400 ml-auto">Virtual Collection</span>
									{/if}
								</div>
								<h3 class="text-lg font-semibold text-white group-hover:text-gold-500 transition-colors mb-2">
									{featuredAlbum.album.albumName}
								</h3>
								<p class="text-sm text-charcoal-300 leading-relaxed">
									{#if featuredAlbum.type === 'recent'}
										Latest event coverage with fresh action photography.
									{:else if featuredAlbum.type === 'editors-choice'}
										Curated selection of emotionally compelling moments and technical excellence.
									{:else if featuredAlbum.type === 'action-showcase'}
										High-intensity action shots capturing peak athletic performance.
									{/if}
								</p>
							</div>
						</a>
					{/each}
				</div>
			{:else}
				<!-- Fallback: Show navigation cards if no featured albums -->
				<div class="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
					<a
						href="{base}/explore"
						data-sveltekit-preload="viewport"
						class="group bg-charcoal-900 border border-charcoal-800 rounded-lg p-6
						       hover:border-gold-500/50 transition-all duration-200"
					>
						<div class="flex items-center gap-3 mb-3">
							<Camera class="w-6 h-6 text-gold-500" />
							<h3 class="text-lg font-semibold text-white group-hover:text-gold-500 transition-colors">
								Browse Gallery
							</h3>
						</div>
						<p class="text-sm text-charcoal-300 leading-relaxed">
							Explore our complete collection of volleyball action photography
							with advanced filtering and search.
						</p>
					</a>

					<a
						href="{base}/collections"
						data-sveltekit-preload="hover"
						class="group bg-charcoal-900 border border-charcoal-800 rounded-lg p-6
						       hover:border-gold-500/50 transition-all duration-200"
					>
						<div class="flex items-center gap-3 mb-3">
							<Trophy class="w-6 h-6 text-gold-500" />
							<h3 class="text-lg font-semibold text-white group-hover:text-gold-500 transition-colors">
								Collections
							</h3>
						</div>
						<p class="text-sm text-charcoal-300 leading-relaxed">
							Curated collections showcasing championship tournaments,
							elite athletes, and memorable moments.
						</p>
					</a>

					<a
						href="{base}/albums"
						data-sveltekit-preload="hover"
						class="group bg-charcoal-900 border border-charcoal-800 rounded-lg p-6
						       hover:border-gold-500/50 transition-all duration-200"
					>
						<div class="flex items-center gap-3 mb-3">
							<Calendar class="w-6 h-6 text-gold-500" />
							<h3 class="text-lg font-semibold text-white group-hover:text-gold-500 transition-colors">
								Event Albums
							</h3>
						</div>
						<p class="text-sm text-charcoal-300 leading-relaxed">
							Complete event coverage from tournaments, matches, and
							special volleyball events.
						</p>
					</a>
				</div>
			{/if}
		</section>

	<!-- Booking path: lower slot — attendees win the fold, organizers get a real CTA.
	     "Book a shoot" now triggers a real inquiry (mailto), paired with proof. -->
	<section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
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
