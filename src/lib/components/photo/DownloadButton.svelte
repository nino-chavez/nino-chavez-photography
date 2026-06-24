<script lang="ts">
	import { Download, Check } from 'lucide-svelte';
	import Typography from '$lib/components/ui/Typography.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { base } from '$app/paths';
	import { cfImageUrl } from '$lib/utils/cloudflare-images';
	import { trackEngagement } from '$lib/analytics/client';
	import type { Photo } from '$types/photo';

	interface Props {
		photo: Photo;
		variant?: 'default' | 'compact';
	}

	let { photo, variant = 'default' }: Props = $props();

	let showMenu = $state(false);
	let downloading = $state(false);
	let downloadSuccess = $state(false);

	// Download size options via Cloudflare Images
	const downloadOptions = $derived([
		{
			label: 'Original Quality',
			description: 'Full resolution, best for print',
			url: cfImageUrl(photo.cf_image_id!, 'public'),
			filename: `${photo.image_key}_original.jpg`,
			size: '1-5 MB'
		},
		{
			label: 'Web Quality',
			description: 'Optimized for web and social media (1600px)',
			url: cfImageUrl(photo.cf_image_id!, 'large'),
			filename: `${photo.image_key}_web.jpg`,
			size: '200-400 KB'
		},
		{
			label: 'Thumbnail',
			description: 'Small preview size (400px)',
			url: cfImageUrl(photo.cf_image_id!, 'grid'),
			filename: `${photo.image_key}_thumb.jpg`,
			size: '20-40 KB'
		}
	]);

	async function handleDownload(url: string, filename: string, event?: MouseEvent) {
		event?.stopPropagation();
		downloading = true;
		downloadSuccess = false;

		try {
			// Use our proxy endpoint to avoid CORS issues (include base path)
			const proxyUrl = `${base}/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;

			// Create download link that points to our proxy
			const link = document.createElement('a');
			link.href = proxyUrl;
			link.download = filename;

			// Trigger download
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);

			// Capture the download for the popularity engine (fire-and-forget; the server
			// dedups per session/day, so multiple size picks don't inflate the count).
			trackEngagement('download', {
				photoId: photo.id,
				albumKey: photo.album_key,
				source: 'download-button'
			});

			// Show success feedback (we assume success since the download was triggered)
			downloadSuccess = true;
			setTimeout(() => {
				downloadSuccess = false;
				showMenu = false;
			}, 2000);
		} catch (error) {
			console.error('Download failed:', error);
			toast.error('Download failed. Please try again.');
		} finally {
			downloading = false;
		}
	}

	function toggleMenu(event: MouseEvent) {
		event.stopPropagation();
		showMenu = !showMenu;
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.download-menu-container')) {
			showMenu = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="relative download-menu-container">
	{#if variant === 'compact'}
		<!-- Compact Icon Button -->
		<button
			onclick={toggleMenu}
			class="p-2.5 rounded-lg bg-charcoal-900 border border-charcoal-800 hover:border-gold-500/50 hover:bg-gold-500/10 transition-colors group"
			aria-label="Download photo"
			title="Download photo"
			disabled={downloading}
		>
			{#if downloadSuccess}
				<Check class="w-4 h-4 text-green-500" />
			{:else if downloading}
				<div class="w-4 h-4 border-2 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
			{:else}
				<Download class="w-4 h-4 text-charcoal-300 group-hover:text-gold-500" />
			{/if}
		</button>
	{:else}
		<!-- Full Button -->
		<button
			onclick={toggleMenu}
			class="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gold-500 hover:bg-gold-400 text-charcoal-950 font-medium transition-colors"
			aria-label="Download photo"
			disabled={downloading}
		>
			{#if downloadSuccess}
				<Check class="w-5 h-5" />
				<span>Downloaded!</span>
			{:else if downloading}
				<div class="w-5 h-5 border-2 border-charcoal-950 border-t-transparent rounded-full animate-spin"></div>
				<span>Downloading...</span>
			{:else}
				<Download class="w-5 h-5" />
				<span>Download</span>
			{/if}
		</button>
	{/if}

	<!-- Download Options Menu (CSS animation instead of svelte-motion) -->
	{#if showMenu}
		<div
			class="download-menu-animate absolute {variant === 'compact' ? 'right-0' : 'left-0'} top-full mt-2 w-72 bg-charcoal-900 border border-charcoal-800 rounded-lg shadow-xl z-50 overflow-hidden"
		>
				<!-- Header -->
				<div class="px-4 py-3 border-b border-charcoal-800">
					<Typography variant="h3" class="text-sm">Choose Download Size</Typography>
				</div>

				<!-- Options -->
				<div class="py-2">
					{#each downloadOptions as option}
						<button
							onclick={(e) => handleDownload(option.url, option.filename, e)}
							disabled={downloading}
							class="w-full px-4 py-3 hover:bg-charcoal-800 transition-colors text-left group disabled:opacity-50 disabled:cursor-not-allowed"
						>
							<div class="flex items-start justify-between gap-3">
								<div class="flex-1">
									<div class="flex items-center gap-2 mb-1">
										<Download class="w-4 h-4 text-gold-500" />
										<Typography variant="body" class="font-medium group-hover:text-gold-500 transition-colors">
											{option.label}
										</Typography>
									</div>
									<Typography variant="caption" class="text-charcoal-400 text-xs">
										{option.description}
									</Typography>
								</div>
								<Typography variant="caption" class="text-charcoal-400 text-xs whitespace-nowrap">
									{option.size}
								</Typography>
							</div>
						</button>
					{/each}
				</div>

				<!-- Footer Note -->
				<div class="px-4 py-3 bg-charcoal-950/50 border-t border-charcoal-800">
					<Typography variant="caption" class="text-charcoal-400 text-xs">
						Photos are for personal use and recruiting purposes only.
					</Typography>
				</div>
		</div>
	{/if}
</div>

<style>
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.animate-spin {
		animation: spin 1s linear infinite;
	}

	/* PERFORMANCE: CSS animation instead of svelte-motion */
	@keyframes download-menu-appear {
		from {
			opacity: 0;
			transform: translateY(-10px) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.download-menu-animate {
		animation: download-menu-appear 0.15s ease-out forwards;
	}

	@media (prefers-reduced-motion: reduce) {
		.download-menu-animate {
			animation: none;
		}
	}
</style>
