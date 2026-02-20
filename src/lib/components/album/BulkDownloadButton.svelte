<script lang="ts">
	import { Download, X } from 'lucide-svelte';
	import { base } from '$app/paths';
	import { cfImageUrl } from '$lib/utils/cloudflare-images';
	import type { CFVariant } from '$lib/utils/cloudflare-images';

	interface Props {
		albumKey: string;
		albumName: string;
		photoCount: number;
	}

	let { albumKey, albumName, photoCount }: Props = $props();

	let showMenu = $state(false);
	let downloading = $state(false);
	let progress = $state({ current: 0, total: 0 });
	let abortController: AbortController | null = null;

	function slugify(text: string): string {
		return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
	}

	async function startDownload(quality: CFVariant) {
		showMenu = false;
		downloading = true;
		progress = { current: 0, total: 0 };
		abortController = new AbortController();

		try {
			// Fetch photo list from API
			const res = await fetch(`${base}/api/album-photos?albumKey=${encodeURIComponent(albumKey)}`);
			const { photos } = await res.json() as { photos: Array<{ cf_image_id: string; image_key: string }> };

			if (!photos || photos.length === 0) {
				downloading = false;
				return;
			}

			progress.total = photos.length;

			// Dynamic import client-zip for tree-shaking
			const { downloadZip } = await import('client-zip');

			// Concurrent generator — keeps CONCURRENCY fetches in flight, yields in order
			const CONCURRENCY = 6;

			async function* fileEntries() {
				const signal = abortController!.signal;
				type Entry = { name: string; data: Blob };

				function fetchPhoto(p: (typeof photos)[number]): Promise<Entry> {
					const url = cfImageUrl(p.cf_image_id, quality);
					const proxy = `${base}/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(p.image_key + '.jpg')}`;
					return fetch(proxy, { signal })
						.then((r) => r.blob())
						.then((data) => ({ name: `${p.image_key}.jpg`, data }));
				}

				let next = 0;
				const inflight = new Map<number, Promise<Entry>>();

				// Seed the window
				while (next < photos.length && inflight.size < CONCURRENCY) {
					inflight.set(next, fetchPhoto(photos[next]));
					next++;
				}

				// Yield in order
				for (let i = 0; i < photos.length; i++) {
					if (signal.aborted) return;
					const result = await inflight.get(i)!;
					inflight.delete(i);

					// Refill the window
					if (next < photos.length) {
						inflight.set(next, fetchPhoto(photos[next]));
						next++;
					}

					progress.current++;
					progress = { ...progress };
					yield { name: result.name, input: result.data };
				}
			}

			// Stream into zip
			const blob = await downloadZip(fileEntries()).blob();

			if (abortController?.signal.aborted) return;

			// Trigger browser download
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `${slugify(albumName)}.zip`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
		} catch (err) {
			if ((err as Error).name !== 'AbortError') {
				console.error('[BulkDownload] Error:', err);
			}
		} finally {
			downloading = false;
			abortController = null;
		}
	}

	function cancelDownload() {
		abortController?.abort();
		downloading = false;
		abortController = null;
	}

	function toggleMenu(event: MouseEvent) {
		event.stopPropagation();
		if (downloading) return;
		showMenu = !showMenu;
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.bulk-download-container')) {
			showMenu = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="relative bulk-download-container">
	{#if downloading}
		<!-- Progress indicator -->
		<div class="flex items-center gap-3">
			<div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-charcoal-900 border border-charcoal-800 text-sm text-charcoal-300">
				<div class="w-4 h-4 border-2 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
				<span>{progress.current} / {progress.total}</span>
			</div>
			<button
				onclick={cancelDownload}
				class="p-2 rounded-lg bg-charcoal-900 border border-charcoal-800 hover:border-red-500/50 hover:bg-red-500/10 transition-colors"
				aria-label="Cancel download"
			>
				<X class="w-4 h-4 text-charcoal-400 hover:text-red-400" />
			</button>
		</div>
	{:else}
		<!-- Download button -->
		<button
			onclick={toggleMenu}
			class="flex items-center gap-2 px-3 py-2 rounded-lg bg-charcoal-900 border border-charcoal-800 hover:border-gold-500/50 hover:bg-gold-500/10 transition-colors text-sm text-charcoal-300 hover:text-gold-500"
			aria-label="Download all photos"
		>
			<Download class="w-4 h-4" />
			<span class="hidden sm:inline">Download All</span>
		</button>
	{/if}

	{#if showMenu}
		<div class="bulk-download-menu absolute right-0 top-full mt-2 w-64 bg-charcoal-900 border border-charcoal-800 rounded-lg shadow-xl z-50 overflow-hidden">
			<div class="px-4 py-3 border-b border-charcoal-800">
				<p class="text-sm font-medium text-white">Download {photoCount} photos</p>
				<p class="text-xs text-charcoal-400 mt-0.5">Choose quality</p>
			</div>
			<div class="py-1">
				<button
					onclick={() => startDownload('large')}
					class="w-full px-4 py-3 hover:bg-charcoal-800 transition-colors text-left"
				>
					<p class="text-sm text-white font-medium">High Quality</p>
					<p class="text-xs text-charcoal-400">1600px, best for sharing</p>
				</button>
				<button
					onclick={() => startDownload('public')}
					class="w-full px-4 py-3 hover:bg-charcoal-800 transition-colors text-left"
				>
					<p class="text-sm text-white font-medium">Original</p>
					<p class="text-xs text-charcoal-400">Full resolution, larger file</p>
				</button>
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

	@keyframes bulk-menu-appear {
		from {
			opacity: 0;
			transform: translateY(-8px) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.bulk-download-menu {
		animation: bulk-menu-appear 0.15s ease-out forwards;
	}

	@media (prefers-reduced-motion: reduce) {
		.bulk-download-menu {
			animation: none;
		}
	}
</style>
