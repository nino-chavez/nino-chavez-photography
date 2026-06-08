<script lang="ts">
	import { TrendingUp, Eye, Search, BarChart3 } from 'lucide-svelte';
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
											athlete_id: undefined,
											event_id: undefined,
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
										{formatNumber(photo.view_count)} views
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
	</div>
