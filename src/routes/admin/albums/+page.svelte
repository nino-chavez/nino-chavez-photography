<script lang="ts">
	import { base } from '$app/paths';
	import { enhance } from '$app/forms';
	import { Copy, Check, RefreshCw } from 'lucide-svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let copiedAlbumKey = $state<string | null>(null);

	const siteUrl = 'https://ninochavez.co/photography';

	function copyShareLink(albumKey: string, shareToken: string) {
		const url = `${siteUrl}/share/${shareToken}`;
		navigator.clipboard.writeText(url);
		copiedAlbumKey = albumKey;
		setTimeout(() => {
			copiedAlbumKey = null;
		}, 2000);
	}

	let unlistedCount = $derived(data.albums.filter((a: any) => a.visibility === 'unlisted').length);
	let publicCount = $derived(data.albums.length - unlistedCount);
</script>

<div class="min-h-screen bg-gray-50">
	<!-- Header -->
	<header class="bg-white shadow">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
			<div class="flex justify-between items-center">
				<div>
					<h1 class="text-2xl font-bold text-gray-900">Album Visibility</h1>
					<p class="text-sm text-gray-600 mt-1">
						Logged in as {data.user.email}
					</p>
				</div>
				<div class="flex gap-4">
					<a
						href="{base}/admin/tags"
						class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
					>
						Tag Moderation
					</a>
					<a
						href="{base}/"
						class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
					>
						&larr; Back to Gallery
					</a>
				</div>
			</div>
		</div>
	</header>

	<!-- Stats -->
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
		<div class="grid grid-cols-1 gap-5 sm:grid-cols-3">
			<div class="bg-white overflow-hidden shadow rounded-lg">
				<div class="px-4 py-5 sm:p-6">
					<dt class="text-sm font-medium text-gray-500 truncate">Total Albums</dt>
					<dd class="mt-1 text-3xl font-semibold text-gray-900">{data.albums.length}</dd>
				</div>
			</div>
			<div class="bg-white overflow-hidden shadow rounded-lg">
				<div class="px-4 py-5 sm:p-6">
					<dt class="text-sm font-medium text-gray-500 truncate">Public</dt>
					<dd class="mt-1 text-3xl font-semibold text-green-600">{publicCount}</dd>
				</div>
			</div>
			<div class="bg-white overflow-hidden shadow rounded-lg">
				<div class="px-4 py-5 sm:p-6">
					<dt class="text-sm font-medium text-gray-500 truncate">Unlisted</dt>
					<dd class="mt-1 text-3xl font-semibold text-amber-600">{unlistedCount}</dd>
				</div>
			</div>
		</div>
	</div>

	<!-- Albums List -->
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
		<div class="bg-white shadow overflow-hidden sm:rounded-lg">
			<div class="px-4 py-5 sm:px-6 border-b border-gray-200">
				<h2 class="text-lg font-medium text-gray-900">All Albums</h2>
			</div>

			<ul class="divide-y divide-gray-200">
				{#each data.albums as album}
					<li class="px-4 py-4 sm:px-6">
						<div class="flex items-center justify-between gap-4">
							<!-- Album info -->
							<div class="min-w-0 flex-1">
								<p class="text-sm font-medium text-gray-900 truncate">{album.albumName}</p>
								<p class="text-xs text-gray-500 mt-0.5">
									{album.photoCount} photos
								</p>
							</div>

							<!-- Visibility badge + actions -->
							<div class="flex items-center gap-3 shrink-0">
								<!-- Badge -->
								{#if album.visibility === 'unlisted'}
									<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
										Unlisted
									</span>
								{:else}
									<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
										Public
									</span>
								{/if}

								<!-- Toggle visibility -->
								<form method="POST" action="?/toggleVisibility" use:enhance>
									<input type="hidden" name="albumKey" value={album.albumKey} />
									<input type="hidden" name="currentVisibility" value={album.visibility} />
									<button
										type="submit"
										class="px-3 py-1.5 text-xs font-medium rounded border transition-colors {album.visibility === 'unlisted'
											? 'text-green-700 border-green-300 hover:bg-green-50'
											: 'text-amber-700 border-amber-300 hover:bg-amber-50'}"
									>
										{album.visibility === 'unlisted' ? 'Make Public' : 'Make Unlisted'}
									</button>
								</form>

								<!-- Share link actions (only for unlisted) -->
								{#if album.visibility === 'unlisted' && album.shareToken}
									<button
										type="button"
										onclick={() => copyShareLink(album.albumKey, album.shareToken)}
										class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-300 rounded hover:bg-blue-50 transition-colors"
									>
										{#if copiedAlbumKey === album.albumKey}
											<Check class="w-3 h-3" />
											Copied
										{:else}
											<Copy class="w-3 h-3" />
											Copy Link
										{/if}
									</button>

									<form method="POST" action="?/regenerateToken" use:enhance>
										<input type="hidden" name="albumKey" value={album.albumKey} />
										<button
											type="submit"
											class="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
											title="Regenerate share link (invalidates old link)"
										>
											<RefreshCw class="w-3 h-3" />
										</button>
									</form>
								{/if}
							</div>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	</div>
</div>
