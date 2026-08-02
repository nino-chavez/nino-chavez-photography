<script lang="ts">
	import { base } from '$app/paths';
	import { Heart, Trash2, Download, Upload, AlertCircle } from 'lucide-svelte';
	import { favorites } from '$lib/stores/favorites.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import Typography from '$lib/components/ui/Typography.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import PhotoCard from '$lib/components/gallery/PhotoCard.svelte';
	import Lightbox from '$lib/components/gallery/Lightbox.svelte';
	import FavoritesDownloadButton from '$lib/components/favorites/FavoritesDownloadButton.svelte';
	import type { PageData } from './$types';
	import type { Photo } from '$types/photo';

	let { data }: { data: PageData } = $props();

	// Reactive favorites from store
	const favoritePhotos = $derived(favorites.photos);
	const favoriteCount = $derived(favorites.count);

	// Lightbox state
	let lightboxOpen = $state(false);
	let selectedPhotoIndex = $state(0);

	// Export/Import UI state
	let showExportSuccess = $state(false);
	let showImportDialog = $state(false);
	let importError = $state<string | null>(null);

	function handlePhotoClick(photo: Photo) {
		const index = favoritePhotos.findIndex((p) => p.id === photo.id);
		if (index !== -1) {
			selectedPhotoIndex = index;
			lightboxOpen = true;
		}
	}

	function handleLightboxNavigate(newIndex: number) {
		selectedPhotoIndex = newIndex;
	}

	function handleClearAll(event?: MouseEvent) {
		event?.stopPropagation();
		const confirmed = confirm(
			`Remove all ${favoriteCount} saved photos from this browser? This action cannot be undone.`
		);

		if (confirmed) {
			favorites.clearAll();
		}
	}

	function handleExport(event?: MouseEvent) {
		event?.stopPropagation();
		const json = favorites.exportFavorites();
		const blob = new Blob([json], { type: 'application/json' });
		const url = window.URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `saved-photos-${new Date().toISOString().split('T')[0]}.json`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		window.URL.revokeObjectURL(url);

		// Show success feedback
		showExportSuccess = true;
		setTimeout(() => {
			showExportSuccess = false;
		}, 3000);
	}

	function handleImport(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) return;

		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				const json = e.target?.result as string;
				const count = favorites.importFavorites(json);
				toast.success(`Imported ${count} saved photos.`);
				showImportDialog = false;
				importError = null;
			} catch (error) {
				importError = error instanceof Error ? error.message : 'Import failed';
			}
		};
		reader.readAsText(file);
	}
</script>

<svelte:head>
	<!-- Per-visitor page: nothing here is the same for two people, so there is
	     nothing to index. Follow is kept so the gallery links still carry. -->
	<meta name="robots" content="noindex, follow" />
</svelte:head>

<div class="p-8" style="animation: fade-slide-up 0.3s ease-out forwards">
		<div class="max-w-7xl mx-auto">
			<!-- Header Section -->
			<div class="mb-8">
				<!-- Title & Icon -->
				<div class="flex items-center gap-4 mb-6">
					<div class="p-3 rounded-full bg-red-500/10" aria-hidden="true">
						<Heart class="w-8 h-8 text-red-500 fill-red-500" />
					</div>
					<div class="flex-1">
						<Typography variant="h1" class="text-4xl">Your saved photos</Typography>
						<Typography variant="body" class="text-charcoal-300 mt-1">
							{favoriteCount} {favoriteCount === 1 ? 'photo' : 'photos'} saved in this browser
						</Typography>
					</div>
				</div>

				<!-- Action Buttons -->
				{#if favoriteCount > 0}
					<div class="flex flex-wrap gap-3">
						<!-- Download all (ZIP) — client-side, cross-album -->
						<FavoritesDownloadButton photos={favoritePhotos} />

						<!-- Export -->
						<Button variant="secondary" onclick={handleExport}>
							<Download class="w-4 h-4 mr-2" />
							Export saved photos
						</Button>

						<!-- Import -->
						<label class="cursor-pointer">
							<input
								type="file"
								accept=".json"
								onchange={handleImport}
								class="hidden"
								aria-label="Import saved photos"
							/>
							<div
								class="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-charcoal-900 border border-charcoal-800 hover:border-gold-500/50 hover:bg-charcoal-800 text-white font-medium transition-colors cursor-pointer"
							>
								<Upload class="w-4 h-4" />
								Import saved photos
							</div>
						</label>

						<!-- Clear All -->
						<Button variant="ghost" onclick={handleClearAll} class="text-red-500 hover:bg-red-500/10">
							<Trash2 class="w-4 h-4 mr-2" />
							Clear All
						</Button>
					</div>

					<!-- Export Success Message -->
					{#if showExportSuccess}
						<div class="mt-4 px-4 py-3 bg-green-500/10 border border-green-500/30 rounded-lg" style="animation: fade-slide-down 0.3s ease-out forwards">
							<Typography variant="body" class="text-green-500">
								Saved photos exported successfully.
							</Typography>
						</div>
					{/if}

					<!-- Import Error Message -->
					{#if importError}
						<div class="mt-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg">
							<div class="flex items-start gap-2">
								<AlertCircle class="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
								<div>
									<Typography variant="body" class="text-red-500 font-medium">
										Import Failed
									</Typography>
									<Typography variant="caption" class="text-red-400 mt-1">
										{importError}
									</Typography>
								</div>
							</div>
						</div>
					{/if}
				{/if}
			</div>

			<!-- Photo Grid -->
			{#if favoriteCount > 0}
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
					{#each favoritePhotos as photo, index}
						<PhotoCard {photo} {index} onclick={handlePhotoClick} />
					{/each}
				</div>
			{:else}
				<!-- Empty State -->
				<div style="animation: fade-in 0.3s ease-out forwards">
						<Card padding="lg" class="text-center py-16">
							<Heart class="w-24 h-24 text-charcoal-600 mx-auto mb-6" aria-hidden="true" />
							<Typography variant="h2" class="text-2xl mb-3">No saved photos yet</Typography>
							<Typography variant="body" class="text-charcoal-400 mb-8 max-w-md mx-auto">
								Use the heart on any photo to save it in this browser. Saved photos do not sync
								between browsers or devices.
							</Typography>
							<Button variant="primary" onclick={() => (window.location.href = `${base}/explore`)}>
								Explore Photos
							</Button>
						</Card>
				</div>
			{/if}
		</div>
	</div>

<!-- Lightbox Full-Screen Viewer -->
<Lightbox
	bind:open={lightboxOpen}
	photo={favoritePhotos[selectedPhotoIndex] || null}
	photos={favoritePhotos}
	currentIndex={selectedPhotoIndex}
	onNavigate={handleLightboxNavigate}
	viewSource="favorites"
/>
