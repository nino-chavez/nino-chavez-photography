<script lang="ts">
	import { TrendingUp, Eye, BarChart3, Users } from 'lucide-svelte';
	import { base } from '$app/paths';
	import { createAlbumSlug } from '$lib/utils';
	import Typography from '$lib/components/ui/Typography.svelte';
	import PhotoCard from '$lib/components/gallery/PhotoCard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Album Reach now carries every album with 30-day activity (no server-side
	// top-N), so a text filter replaces the old "hope it's in the top 20" cutoff.
	let albumSearch = $state('');

	// Keep visitor reach and last activity as separate, explicitly named sort axes.
	let albumSort = $state<'visitors' | 'recent'>('visitors');
	let showAllPopularPhotos = $state(false);

	const filteredAlbumReach = $derived.by(() => {
		const needle = albumSearch.trim().toLowerCase();
		const rows = needle
			? data.albumReach.filter((album) =>
					(album.album_name ?? album.album_key).toLowerCase().includes(needle)
				)
			: data.albumReach;
		return [...rows].sort((a, b) => {
			const primary = albumSort === 'recent'
				? b.last_event.localeCompare(a.last_event)
				: b.engaged_visitors - a.engaged_visitors;
			return primary || b.last_event.localeCompare(a.last_event) || a.album_key.localeCompare(b.album_key);
		});
	});

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
	<title>Gallery activity</title>
</svelte:head>

<div style="animation: fade-slide-up 0.3s ease-out forwards" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		<!-- Header -->
		<div class="mb-8">
			<div class="flex items-center gap-3 mb-2">
				<BarChart3 class="w-8 h-8 text-gold-500" />
				<Typography variant="h1" class="text-3xl">Gallery activity</Typography>
			</div>
			<Typography variant="body" class="text-charcoal-400">
				Album activity and site events from the last 30 days. Visitor counts are estimates.
			</Typography>
			<a href={`${base}/analytics/operator`} class="mt-3 inline-block text-sm text-gold-400 underline underline-offset-4">Open private operator workspace</a>
		</div>

		<!-- Thirty-day overview. The photo ranking below has its own time basis. -->
		<div class="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 mb-6">
			<div style="animation: fade-scale-in 0.3s ease-out 0.1s both" class="bg-charcoal-900/50 border border-charcoal-700/50 rounded-lg p-4 sm:p-6">
					<div class="flex items-center gap-3 mb-2">
						<Users class="w-6 h-6 text-gold-500" />
						<Typography variant="label" class="text-sm text-charcoal-400 uppercase">
							Visitors (est.)
						</Typography>
					</div>
					<Typography variant="h2" class="text-3xl text-gold-500">
						{data.stats.totalsAvailable ? formatNumber(data.stats.totalEngagedVisitors) : 'Unavailable'}
					</Typography>
				</div>

			<div style="animation: fade-scale-in 0.3s ease-out 0.2s both" class="bg-charcoal-900/50 border border-charcoal-700/50 rounded-lg p-4 sm:p-6">
					<div class="flex items-center gap-3 mb-2">
						<Users class="w-6 h-6 text-gold-500" />
						<Typography variant="label" class="text-sm text-charcoal-400 uppercase">
							Album opens
						</Typography>
					</div>
					<Typography variant="h2" class="text-3xl text-gold-500">
						{data.stats.totalsAvailable ? formatNumber(data.stats.totalAlbumOpens) : 'Unavailable'}
					</Typography>
				</div>

			<div style="animation: fade-scale-in 0.3s ease-out 0.3s both" class="col-span-2 lg:col-span-1 bg-charcoal-900/50 border border-charcoal-700/50 rounded-lg p-4 sm:p-6">
					<div class="flex items-center gap-3 mb-2">
						<Eye class="w-6 h-6 text-gold-500" />
						<Typography variant="label" class="text-sm text-charcoal-400 uppercase">
							Photo opens
						</Typography>
					</div>
					<Typography variant="h2" class="text-3xl text-gold-500">
						{data.stats.totalsAvailable ? formatNumber(data.stats.totalPhotoOpens) : 'Unavailable'}
					</Typography>
				</div>
		</div>

		<!-- Album Reach -->
		<div
			style="animation: fade-in 0.3s ease-out 0.7s both"
			class="bg-charcoal-900/50 border border-charcoal-700/50 rounded-lg p-4 sm:p-6 mb-8"
		>
			<div class="flex items-center justify-between gap-4 mb-1 flex-wrap">
				<Typography variant="h3" class="text-xl flex items-center gap-2">
					<Users class="w-5 h-5 text-gold-500" />
					Albums with activity — last 30 days
				</Typography>
				{#if data.albumReach.length > 0}
					<div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
						<div class="flex rounded-lg border border-charcoal-700 overflow-hidden" role="group" aria-label="Sort albums">
							<button
								type="button"
								onclick={() => (albumSort = 'visitors')}
								aria-pressed={albumSort === 'visitors'}
								class="flex-1 whitespace-nowrap px-3 py-1.5 text-sm transition-colors {albumSort === 'visitors'
									? 'bg-gold-500/20 text-gold-300'
									: 'bg-charcoal-800/50 text-charcoal-400 hover:text-charcoal-200'}"
							>
								Most visitors
							</button>
							<button
								type="button"
								onclick={() => (albumSort = 'recent')}
								aria-pressed={albumSort === 'recent'}
								class="flex-1 whitespace-nowrap px-3 py-1.5 text-sm border-l border-charcoal-700 transition-colors {albumSort ===
								'recent'
									? 'bg-gold-500/20 text-gold-300'
									: 'bg-charcoal-800/50 text-charcoal-400 hover:text-charcoal-200'}"
							>
								Latest activity
							</button>
						</div>
						<input
							type="search"
							bind:value={albumSearch}
							placeholder="Filter albums..."
							class="w-full sm:w-auto bg-charcoal-800/50 border border-charcoal-700 rounded-lg px-3 py-1.5 text-sm text-charcoal-200 placeholder:text-charcoal-500 focus:outline-none focus:ring-2 focus:ring-gold-500/50"
							aria-label="Filter albums by name"
						/>
					</div>
				{/if}
			</div>
			<p class="text-sm text-charcoal-300 mt-2 mb-1">
				{albumSort === 'visitors'
					? 'Albums with the most estimated visitors appear first.'
					: 'Newest recorded action first. This can be an album or photo open, download, favorite, or share—not the event date.'}
			</p>
			<Typography variant="caption" class="text-xs text-charcoal-400 mb-4 block">
				Only albums with recorded activity appear. One person may count more than once in the visitor estimate.
				Photos can open without an album open. Album opens are tracked from Aug 29, 2026.
				Automated and test activity may still be included.
				{#if data.albumReach.length > 0}
					Showing {formatNumber(filteredAlbumReach.length)} of {formatNumber(data.albumReach.length)}
					{data.albumReach.length === 1 ? 'album' : 'albums'} with activity.
				{/if}
			</Typography>

			{#if !data.albumReachAvailable}
				<p role="status" class="py-8 text-charcoal-300">Album activity is temporarily unavailable.</p>
			{:else if filteredAlbumReach.length > 0}
				<div class="md:hidden max-h-[32rem] overflow-y-auto space-y-3" aria-label="Album activity">
					{#each filteredAlbumReach as album}
						<div class="rounded-lg border border-charcoal-700/70 bg-charcoal-900/70 p-3">
							<div class="text-sm text-charcoal-200">
								{#if album.album_name}
									<a href="{base}/albums/{createAlbumSlug(album.album_name, album.album_key)}" class="hover:text-gold-400">{album.album_name}</a>
								{:else}
									{album.album_key}
								{/if}
							</div>
							<p class="mt-2 text-sm text-gold-400 font-medium">
								{albumSort === 'visitors'
									? `${formatNumber(album.engaged_visitors)} estimated visitors`
									: `Last activity ${formatDate(album.last_event)}`}
							</p>
							<dl class="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 border-t border-charcoal-700/70 pt-2 text-xs">
								{#if albumSort === 'recent'}
									<div><dt class="text-charcoal-500">Visitors (est.)</dt><dd class="text-charcoal-300">{formatNumber(album.engaged_visitors)}</dd></div>
								{/if}
								<div><dt class="text-charcoal-500">Album opens</dt><dd class="text-charcoal-300">{formatNumber(album.album_opens)}</dd></div>
								<div><dt class="text-charcoal-500">Photo opens</dt><dd class="text-charcoal-300">{formatNumber(album.photo_opens)}</dd></div>
								<div><dt class="text-charcoal-500">Downloads</dt><dd class="text-charcoal-300">{formatNumber(album.downloads)}</dd></div>
								<div><dt class="text-charcoal-500">Favorites</dt><dd class="text-charcoal-300">{formatNumber(album.favorites)}</dd></div>
								<div><dt class="text-charcoal-500">Shares</dt><dd class="text-charcoal-300">{formatNumber(album.shares)}</dd></div>
							</dl>
							{#if albumSort === 'visitors'}
								<p class="mt-1 text-xs text-charcoal-500">Last activity {formatDate(album.last_event)}</p>
							{/if}
						</div>
					{/each}
				</div>
				<div class="hidden md:block overflow-x-auto max-h-[32rem] overflow-y-auto">
					<table class="w-full text-sm border-collapse">
						<thead class="sticky top-0 bg-charcoal-900">
							<tr class="border-b border-charcoal-800">
								<th class="text-left py-3 px-4 text-charcoal-400 font-medium">Album</th>
								<th aria-sort={albumSort === 'visitors' ? 'descending' : undefined} class="text-right py-3 px-4 font-medium {albumSort === 'visitors' ? 'text-gold-400' : 'text-charcoal-400'}">Visitors (est.)</th>
								<th class="text-right py-3 px-4 text-charcoal-400 font-medium">Album opens</th>
								<th class="text-right py-3 px-4 text-charcoal-400 font-medium">Photo opens</th>
								<th class="text-right py-3 px-4 text-charcoal-400 font-medium">Downloads</th>
								<th class="text-right py-3 px-4 text-charcoal-400 font-medium">Favorites</th>
								<th class="text-right py-3 px-4 text-charcoal-400 font-medium">Shares</th>
								<th aria-sort={albumSort === 'recent' ? 'descending' : undefined} class="text-left py-3 px-4 font-medium {albumSort === 'recent' ? 'text-gold-400' : 'text-charcoal-400'}">Last activity</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-charcoal-800">
							{#each filteredAlbumReach as album}
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
									<td class="text-right py-3 px-4 font-medium {albumSort === 'visitors' ? 'text-gold-500' : 'text-charcoal-300'}">
										{formatNumber(album.engaged_visitors)}
									</td>
									<td class="text-right py-3 px-4 text-charcoal-300">{formatNumber(album.album_opens)}</td>
									<td class="text-right py-3 px-4 text-charcoal-300">{formatNumber(album.photo_opens)}</td>
									<td class="text-right py-3 px-4 text-charcoal-300">{formatNumber(album.downloads)}</td>
									<td class="text-right py-3 px-4 text-charcoal-300">{formatNumber(album.favorites)}</td>
									<td class="text-right py-3 px-4 text-charcoal-300">{formatNumber(album.shares)}</td>
									<td class="text-left py-3 px-4 text-xs {albumSort === 'recent' ? 'text-gold-400 font-medium' : 'text-charcoal-500'}">{formatDate(album.last_event)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else if data.albumReach.length > 0}
				<div class="text-center py-12 bg-charcoal-900/30 rounded-lg">
					<Typography variant="body" class="text-charcoal-500">
						No albums match "{albumSearch}".
					</Typography>
				</div>
			{:else}
				<div class="text-center py-12 bg-charcoal-900/30 rounded-lg">
					<Typography variant="body" class="text-charcoal-500">
						No album activity yet. Share an album link to start tracking reach.
					</Typography>
				</div>
			{/if}
		</div>
		<!-- Popular Photos Grid -->
		<div style="animation: fade-in 0.3s ease-out 0.5s both" class="mb-8">
			<Typography variant="h2" class="text-2xl mb-1 flex items-center gap-2">
				<TrendingUp class="w-6 h-6 text-gold-500" />
				Ranked photos
			</Typography>
			<Typography variant="caption" class="text-xs text-charcoal-500 mb-4 block">
				Ranked from retained events (up to 90 days), with recent activity weighted more heavily.
				Downloads, favorites, and shares carry more weight than opens. Counts here may include test activity.
			</Typography>

			{#if !data.popularPhotosAvailable}
				<p role="status" class="py-8 text-charcoal-300">Ranked photos are temporarily unavailable.</p>
			{:else if data.popularPhotos.length > 0}
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
					{#each (showAllPopularPhotos ? data.popularPhotos : data.popularPhotos.slice(0, 4)) as photo, index}
						<div style="animation: fade-slide-up 0.3s ease-out {0.05 * index}s both">
							<div class="relative">
								<PhotoCard
									photo={{
										id: photo.photo_id,
										image_key: photo.image_key,
										image_url: photo.thumbnail_url || '',
										thumbnail_url: photo.thumbnail_url || undefined,
										title: '',
										caption: '',
										keywords: [],
										created_at: '',
										metadata: {
											sport_type: photo.sport_type,
											album_key: photo.album_key || undefined,
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
								/>
								<div
									class="absolute top-2 right-2 bg-charcoal-950/90 backdrop-blur-sm px-2 py-1 rounded-full border border-gold-500/30"
								>
									<Typography variant="caption" class="text-xs text-gold-400 font-medium">
										{formatNumber(photo.view_count)} opens{photo.download_count
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
				{#if data.popularPhotos.length > 4}
					<button type="button" onclick={() => (showAllPopularPhotos = !showAllPopularPhotos)} class="mt-4 text-sm text-gold-400 hover:text-gold-300 underline underline-offset-4">
						{showAllPopularPhotos ? 'Show fewer photos' : `Show all ${data.popularPhotos.length} ranked photos`}
					</button>
				{/if}
			{:else}
				<div class="text-center py-12 bg-charcoal-900/30 rounded-lg">
					<Typography variant="body" class="text-charcoal-500">
						No photo-open data yet. Start exploring photos to see analytics!
					</Typography>
				</div>
			{/if}
		</div>
		<details class="bg-charcoal-900/50 border border-charcoal-700/50 rounded-lg p-4 sm:p-6 mb-8">
			<summary class="cursor-pointer text-charcoal-200 font-medium">Measurement details</summary>
			<p class="text-sm text-charcoal-400 mt-3 mb-4">
				Photo-open locations describe where on this site a photo opened, not how someone found the site.
				The counts below cover the last 30 days.
			</p>
			{#if !data.stats.sourcesAvailable}
				<p class="text-sm text-charcoal-300 mb-4">Photo-open locations are temporarily unavailable.</p>
			{:else if Object.keys(data.stats.photoOpenSourceCounts).length > 0}
				<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
					{#each Object.entries(data.stats.photoOpenSourceCounts) as [source, count]}
						<div class="bg-charcoal-800/30 rounded-lg p-3">
							<span class="block text-xs text-charcoal-400 uppercase">{source}</span>
							<span class="block text-xl text-gold-500 mt-1">{formatNumber(count)}</span>
						</div>
					{/each}
				</div>
			{/if}
			<dl class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
				<div><dt class="text-charcoal-400">Searches</dt><dd class="text-charcoal-200">{data.stats.searchesAvailable ? `${formatNumber(data.stats.totalSearches)} recorded searches; results and usefulness are not measured here.` : 'Unavailable'}</dd></div>
				<div><dt class="text-charcoal-400">Recognized crawler events rejected</dt><dd class="text-charcoal-200">{data.stats.botFilteredAvailable ? formatNumber(data.stats.botFilteredCount) : 'Unavailable'}</dd></div>
				<div><dt class="text-charcoal-400">Stored photo opens excluded by the current rule</dt><dd class="text-charcoal-200">{formatNumber(data.stats.automatedPhotoOpens)}</dd></div>
			</dl>
		</details>

	</div>
