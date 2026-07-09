<script lang="ts">
	import { TrendingUp, Eye, Search, BarChart3, Users, SearchX } from 'lucide-svelte';
	import { base } from '$app/paths';
	import { createAlbumSlug } from '$lib/utils';
	import Typography from '$lib/components/ui/Typography.svelte';
	import PhotoCard from '$lib/components/gallery/PhotoCard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Format number with commas
	function formatNumber(num: number): string {
		return num.toLocaleString();
	}

	// Format date
	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
		});
	}
</script>

<svelte:head>
	<title>Analytics Dashboard</title>
	<meta name="description" content="Gallery analytics and popular photos" />
</svelte:head>

<div style="animation: fade-slide-up 0.3s ease-out forwards" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		<!-- Header -->
		<div class="mb-8">
			<div class="flex items-center gap-3 mb-2">
				<BarChart3 class="w-8 h-8 text-gold-500" />
				<Typography variant="h1" class="text-3xl">Analytics Dashboard</Typography>
			</div>
			<Typography variant="body" class="text-charcoal-400">
				Last 30 days of gallery activity
			</Typography>
		</div>

		<!-- Stats Overview -->
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
			<div style="animation: fade-scale-in 0.3s ease-out 0.1s both" class="bg-charcoal-900/50 border border-charcoal-700/50 rounded-lg p-6">
					<div class="flex items-center gap-3 mb-2">
						<Eye class="w-6 h-6 text-gold-500" />
						<Typography variant="label" class="text-sm text-charcoal-400 uppercase">
							Total Views
						</Typography>
					</div>
					<Typography variant="h2" class="text-3xl text-gold-500">
						{formatNumber(data.stats.totalViews)}
					</Typography>
				</div>

			<div style="animation: fade-scale-in 0.3s ease-out 0.2s both" class="bg-charcoal-900/50 border border-charcoal-700/50 rounded-lg p-6">
					<div class="flex items-center gap-3 mb-2">
						<Search class="w-6 h-6 text-gold-500" />
						<Typography variant="label" class="text-sm text-charcoal-400 uppercase">
							Total Searches
						</Typography>
					</div>
					<Typography variant="h2" class="text-3xl text-gold-500">
						{formatNumber(data.stats.totalSearches)}
					</Typography>
				</div>

			<div style="animation: fade-scale-in 0.3s ease-out 0.3s both" class="bg-charcoal-900/50 border border-charcoal-700/50 rounded-lg p-6">
					<div class="flex items-center gap-3 mb-2">
						<TrendingUp class="w-6 h-6 text-gold-500" />
						<Typography variant="label" class="text-sm text-charcoal-400 uppercase">
							Popular Photos
						</Typography>
					</div>
					<Typography variant="h2" class="text-3xl text-gold-500">
						{formatNumber(data.popularPhotos.length)}
					</Typography>
				</div>
		</div>

		<!-- View Source Distribution -->
		{#if Object.keys(data.stats.viewSourceCounts).length > 0}
			<div
				style="animation: fade-in 0.3s ease-out 0.4s both"
				class="bg-charcoal-900/50 border border-charcoal-700/50 rounded-lg p-6 mb-8"
			>
				<Typography variant="h3" class="text-xl mb-4">View Sources</Typography>
				<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
					{#each Object.entries(data.stats.viewSourceCounts) as [source, count]}
						<div class="bg-charcoal-800/30 rounded-lg p-4">
							<Typography variant="caption" class="text-xs text-charcoal-400 uppercase">
								{source}
							</Typography>
							<Typography variant="h4" class="text-2xl text-gold-500 mt-1">
								{formatNumber(count)}
							</Typography>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Popular Photos Grid -->
		<div style="animation: fade-in 0.3s ease-out 0.5s both" class="mb-8">
			<Typography variant="h2" class="text-2xl mb-4 flex items-center gap-2">
				<TrendingUp class="w-6 h-6 text-gold-500" />
				Most Popular Photos
			</Typography>

			{#if data.popularPhotos.length > 0}
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
					{#each data.popularPhotos as photo, index}
						<div style="animation: fade-slide-up 0.3s ease-out {0.05 * index}s both">
							<div class="relative">
								<PhotoCard
									photo={{
										id: photo.image_key,
										image_key: photo.image_key,
										image_url: photo.thumbnail_url || '',
										thumbnail_url: photo.thumbnail_url || undefined,
										title: '',
										caption: '',
										keywords: [],
										created_at: '',
										metadata: {
											sport_type: 'volleyball', // Default for analytics demo
											photo_category: photo.photo_category,
											play_type: null,
											sharpness: 0,
											composition_score: 0,
											exposure_accuracy: 0,
											emotional_impact: 0,
											time_in_game: undefined,
											ai_provider: 'openai' as const,
											ai_cost: 0,
											enriched_at: ''
										},
									}}
									{index}
									onclick={() => {}}
								/>
								<div
									class="absolute top-2 right-2 bg-charcoal-950/90 backdrop-blur-sm px-2 py-1 rounded-full border border-gold-500/30"
								>
									<Typography variant="caption" class="text-xs text-gold-400 font-medium">
										{formatNumber(photo.view_count)} views{photo.download_count
											? ` · ${formatNumber(photo.download_count)} dl`
											: ''}{photo.favorite_count
											? ` · ${formatNumber(photo.favorite_count)} fav`
											: ''}{photo.share_count ? ` · ${formatNumber(photo.share_count)} sh` : ''}
									</Typography>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="text-center py-12 bg-charcoal-900/30 rounded-lg">
					<Typography variant="body" class="text-charcoal-500">
						No view data yet. Start exploring photos to see analytics!
					</Typography>
				</div>
			{/if}
		</div>

		<!-- Recent Searches -->
		{#if data.recentSearches.length > 0}
			<div
				style="animation: fade-in 0.3s ease-out 0.6s both"
				class="bg-charcoal-900/50 border border-charcoal-700/50 rounded-lg p-6"
			>
				<Typography variant="h3" class="text-xl mb-4 flex items-center gap-2">
					<Search class="w-5 h-5 text-gold-500" />
					Recent Searches
				</Typography>

				<div class="space-y-3">
					{#each data.recentSearches.slice(0, 10) as search}
						<div class="flex items-center justify-between py-2 border-b border-charcoal-800/50">
							<div class="flex-1">
								<Typography variant="body" class="text-sm">
									{search.query_text || '(empty query)'}
								</Typography>
								<Typography variant="caption" class="text-xs text-charcoal-500">
									{search.results_count} results • {formatDate(search.searched_at)}
								</Typography>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Album Reach -->
		<div
			style="animation: fade-in 0.3s ease-out 0.7s both"
			class="bg-charcoal-900/50 border border-charcoal-700/50 rounded-lg p-6 mt-8"
		>
			<Typography variant="h3" class="text-xl mb-1 flex items-center gap-2">
				<Users class="w-5 h-5 text-gold-500" />
				Album Reach — Last 30 Days
			</Typography>
			<Typography variant="caption" class="text-xs text-charcoal-500 mb-4 block">
				After you shared each album, who came and what they did.
			</Typography>

			{#if data.albumReach.length > 0}
				<div class="overflow-x-auto">
					<table class="w-full text-sm border-collapse">
						<thead>
							<tr class="border-b border-charcoal-800">
								<th class="text-left py-3 px-4 text-charcoal-400 font-medium">Album</th>
								<th class="text-right py-3 px-4 text-charcoal-400 font-medium">Visitors</th>
								<th class="text-right py-3 px-4 text-charcoal-400 font-medium">Views</th>
								<th class="text-right py-3 px-4 text-charcoal-400 font-medium">Downloads</th>
								<th class="text-right py-3 px-4 text-charcoal-400 font-medium">Favorites</th>
								<th class="text-right py-3 px-4 text-charcoal-400 font-medium">Shares</th>
								<th class="text-left py-3 px-4 text-charcoal-400 font-medium">Last Activity</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-charcoal-800">
							{#each data.albumReach as album}
								<tr>
									<td class="py-3 px-4 text-charcoal-200">
										{#if album.album_name}
											<a
												href="{base}/albums/{createAlbumSlug(album.album_name, album.album_key)}"
												class="hover:text-gold-400 transition-colors"
											>
												{album.album_name}
											</a>
										{:else}
											{album.album_key}
										{/if}
									</td>
									<td class="text-right py-3 px-4 text-gold-500 font-medium">
										{formatNumber(album.unique_visitors)}
									</td>
									<td class="text-right py-3 px-4 text-charcoal-300">{formatNumber(album.views)}</td>
									<td class="text-right py-3 px-4 text-charcoal-300">{formatNumber(album.downloads)}</td>
									<td class="text-right py-3 px-4 text-charcoal-300">{formatNumber(album.favorites)}</td>
									<td class="text-right py-3 px-4 text-charcoal-300">{formatNumber(album.shares)}</td>
									<td class="text-left py-3 px-4 text-charcoal-500 text-xs">{formatDate(album.last_event)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="text-center py-12 bg-charcoal-900/30 rounded-lg">
					<Typography variant="body" class="text-charcoal-500">
						No album activity yet. Share an album link to start tracking reach.
					</Typography>
				</div>
			{/if}
		</div>

		<!-- Zero-Result Searches -->
		<div
			style="animation: fade-in 0.3s ease-out 0.8s both"
			class="bg-charcoal-900/50 border border-charcoal-700/50 rounded-lg p-6 mt-8"
		>
			<Typography variant="h3" class="text-xl mb-1 flex items-center gap-2">
				<SearchX class="w-5 h-5 text-gold-500" />
				Zero-Result Searches — Last 30 Days
			</Typography>
			<Typography variant="caption" class="text-xs text-charcoal-500 mb-4 block">
				Searches that returned nothing — content or tagging gaps.
			</Typography>

			{#if data.zeroResultSearches.length > 0}
				<div class="overflow-x-auto">
					<table class="w-full text-sm border-collapse">
						<thead>
							<tr class="border-b border-charcoal-800">
								<th class="text-left py-3 px-4 text-charcoal-400 font-medium">Query</th>
								<th class="text-right py-3 px-4 text-charcoal-400 font-medium">Searches</th>
								<th class="text-left py-3 px-4 text-charcoal-400 font-medium">Last Seen</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-charcoal-800">
							{#each data.zeroResultSearches as search}
								<tr>
									<td class="py-3 px-4 text-charcoal-200">{search.query_text || '(empty query)'}</td>
									<td class="text-right py-3 px-4 text-gold-500 font-medium">
										{formatNumber(search.searches)}
									</td>
									<td class="text-left py-3 px-4 text-charcoal-500 text-xs">{formatDate(search.last_searched)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="text-center py-12 bg-charcoal-900/30 rounded-lg">
					<Typography variant="body" class="text-charcoal-500">
						No zero-result searches in the last 30 days.
					</Typography>
				</div>
			{/if}
		</div>
	</div>
