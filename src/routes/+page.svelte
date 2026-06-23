<script lang="ts">
	import type { PageData } from './$types';
	import { base } from '$app/paths';
	import PremiumHero from '$lib/components/ui/PremiumHero.svelte';
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
	<title>Nino Chavez — Action Sports Photography</title>
	<meta name="description" content="Professional action sports photography — volleyball, basketball, soccer, and more. Browse portfolio-quality photos from tournaments, matches, and events." />

	<!-- Preload static hero WebP for instant LCP (Vercel CDN, no proxy chain) -->
	<link rel="preload" as="image" href="{base}/images/hero/hero-1-mobile.webp" fetchpriority="high" media="(max-width: 1023px)" />
	<link rel="preload" as="image" href="{base}/images/hero/hero-1-desktop.webp" fetchpriority="high" media="(min-width: 1024px)" />
</svelte:head>

<!-- Compact hero: names the work + promotes search (the find-my-photos entry) -->
<PremiumHero
	compact
	images={heroImages}
	staticHeroIndex={data.staticHeroIndex ?? 0}
	title="ACTION SPORTS GALLERIES"
	subtitle=""
>
	<div class="w-full max-w-md">
		<p class="text-base text-charcoal-300 mb-4 normal-case tracking-normal font-normal">
			Find your photos from a recent event — search by event, team, or jersey number.
		</p>
		<form role="search" method="get" action="{base}/explore" class="flex flex-col sm:flex-row gap-2">
			<label class="relative flex-1">
				<span class="sr-only">Search events, teams, or jersey numbers</span>
				<Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-charcoal-400 pointer-events-none" aria-hidden="true" />
				<input
					type="search"
					name="q"
					placeholder="Find your event, team, or jersey #…"
					autocomplete="off"
					class="w-full h-12 pl-10 pr-4 rounded-lg bg-charcoal-900 border border-charcoal-700 text-white
					       placeholder:text-charcoal-500 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
				/>
			</label>
			<button
				type="submit"
				class="h-12 px-6 bg-gold-500 hover:bg-gold-400 text-charcoal-950 font-semibold rounded-lg transition-colors shrink-0"
			>
				Search
			</button>
		</form>
		<div class="mt-3">
			<a href="{base}/albums" class="text-sm text-charcoal-400 hover:text-gold-500 transition-colors">
				Or browse all events →
			</a>
		</div>
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
						class="group block"
					>
						<div class="aspect-[4/3] relative overflow-hidden rounded-lg bg-charcoal-800 border border-charcoal-800 group-hover:border-gold-500/50 transition-colors">
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

	<!-- Curated Content Section -->
	<section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 animate-fade-in-delayed">
			<div class="text-center mb-12">
				<h2 class="text-2xl lg:text-3xl font-bold text-white mb-4">
					Curated picks
				</h2>
				<p class="text-lg text-charcoal-300 max-w-2xl mx-auto leading-relaxed">
					Hand-picked collections — the most emotionally compelling moments and peak-action frames across every event.
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
							class="group bg-charcoal-900 border border-charcoal-800 rounded-lg overflow-hidden
							       hover:border-gold-500/50 transition-all duration-200 block"
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

	<!-- Booking path: lower slot — attendees win the fold, organizers get a real CTA -->
	<section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
		<div class="rounded-2xl border border-charcoal-800 bg-gradient-to-br from-charcoal-900 to-charcoal-950 p-8 lg:p-12
		            flex flex-col lg:flex-row lg:items-center justify-between gap-6">
			<div>
				<h2 class="text-2xl lg:text-3xl font-bold text-white mb-2">Shooting an event?</h2>
				<p class="text-charcoal-300 max-w-xl leading-relaxed">
					Tournament, league, or club — full-coverage action galleries your athletes can find themselves in.
				</p>
			</div>
			<a
				href="{base}/about"
				class="inline-flex items-center gap-2 px-6 py-3 bg-gold-500 hover:bg-gold-400 text-charcoal-950 font-semibold
				       rounded-lg transition-colors shrink-0 self-start lg:self-auto"
			>
				Book a shoot
				<ArrowRight class="w-4 h-4" />
			</a>
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
