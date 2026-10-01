<script lang="ts">
	import { base } from '$app/paths';
	import { Heart, Trash2, Download, Upload, AlertCircle } from 'lucide-svelte';
	import { favorites } from '$lib/stores/favorites.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import Typography from '$lib/components/ui/Typography.svelte';
	import Button from '$lib/components/ui/Button.svelte';
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

	<div class="saved-page" style="animation: fade-slide-up 0.3s ease-out forwards">
		<div class="saved-inner">
			<!-- Header Section -->
			<header class="saved-opening">
				<!-- Title & Icon -->
				<div class="saved-title-row">
					<div>
						<p class="saved-eyebrow">This browser</p>
						<Typography variant="h1" class="saved-title">Saved photos</Typography>
						<Typography variant="body" class="saved-description">
							{favoriteCount} {favoriteCount === 1 ? 'photo' : 'photos'} saved in this browser
						</Typography>
					</div>
				</div>

				<!-- Action Buttons -->
				{#if favoriteCount > 0}
					<div class="saved-actions">
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
							<div class="saved-import">
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
			</header>

			<!-- Photo Grid -->
			{#if favoriteCount > 0}
				<div class="saved-grid">
					{#each favoritePhotos as photo, index}
						<PhotoCard {photo} {index} favoriteSurface="favorites" onclick={handlePhotoClick} />
					{/each}
				</div>
			{:else}
				<!-- Empty State -->
				<div class="saved-empty" style="animation: fade-in 0.3s ease-out forwards">
							<Heart class="w-12 h-12 text-charcoal-600 mx-auto mb-6" aria-hidden="true" />
							<Typography variant="h2" class="text-2xl mb-3">No saved photos yet</Typography>
							<Typography variant="body" class="text-charcoal-400 mb-8 max-w-md mx-auto">
								Use the heart on any photo to save it in this browser. Saved photos do not sync
								between browsers or devices.
							</Typography>
							<a class="saved-browse" href="{base}/explore">Browse photos</a>
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

<style>
	.saved-page { color: var(--color-charcoal-50); }
	.saved-inner { width: min(1320px, calc(100% - 64px)); margin-inline: auto; padding-block: 40px 72px; }
	.saved-opening { margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid var(--color-charcoal-800); }
	.saved-title-row { display: flex; align-items: end; justify-content: space-between; gap: 24px; }
	.saved-eyebrow { margin-bottom: 14px; color: var(--color-gold-500); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
	.saved-title-row :global(.saved-title) { font-family: Montserrat, sans-serif; font-size: clamp(32px, 3.2vw, 46px); font-weight: 750; line-height: 1.08; letter-spacing: -.035em; }
	.saved-title-row :global(.saved-description) { margin-top: 12px; color: var(--color-charcoal-300); font-size: 14px; }
	.saved-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
	.saved-import, .saved-browse { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 10px 16px; border: 1px solid var(--color-charcoal-700); border-radius: 0; color: var(--color-charcoal-50); font-weight: 650; cursor: pointer; }
	.saved-import:hover, .saved-browse:hover { border-color: var(--color-gold-500); }
	.saved-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
	.saved-grid :global(.photo-card) { border: 0; border-radius: 0; transform: none; box-shadow: none; }
	.saved-empty { padding-block: 72px; border-block: 1px solid var(--color-charcoal-800); text-align: center; }
	@media (max-width: 900px) { .saved-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	@media (max-width: 640px) {
		.saved-inner { width: calc(100% - 40px); padding-block: 24px 56px; }
		.saved-title-row { align-items: start; flex-direction: column; }
		.saved-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
	}
</style>
