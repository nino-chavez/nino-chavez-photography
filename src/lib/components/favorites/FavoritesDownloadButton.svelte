<script lang="ts">
	import { Download, X } from 'lucide-svelte';
	import { base } from '$app/paths';
	import { cfImageUrl } from '$lib/utils/cloudflare-images';
	import { toast } from '$lib/stores/toast.svelte';
	import type { Photo } from '$types/photo';

	interface Props {
		photos: Photo[];
	}

	let { photos }: Props = $props();

	let downloading = $state(false);
	let progress = $state({ current: 0, total: 0 });
	let abortController: AbortController | null = null;

	// Only photos with a Cloudflare image ID can be downloaded.
	const downloadable = $derived(photos.filter((p) => p.cf_image_id));

	function todayStamp(): string {
		return new Date().toISOString().split('T')[0];
	}

	function triggerBrowserDownload(blob: Blob, filename: string): void {
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}

	async function startDownload() {
		// Favorites are cross-album, so the album-scoped worker cannot be used.
		// Build the ZIP client-side with client-zip, fetching each large variant
		// through the download proxy to avoid CORS.
		if (downloading) return;

		const entries = downloadable;
		if (entries.length === 0) {
			toast.error('No downloadable photos in favorites.');
			return;
		}

		downloading = true;
		progress = { current: 0, total: entries.length };
		abortController = new AbortController();

		try {
			const { downloadZip } = await import('client-zip');

			// Concurrent generator — keeps CONCURRENCY fetches in flight, yields in order.
			const CONCURRENCY = 6;

			async function* fileEntries() {
				const signal = abortController!.signal;
				type Entry = { name: string; data: Blob };

				function fetchPhoto(photo: Photo): Promise<Entry> {
					const url = cfImageUrl(photo.cf_image_id!, 'large');
					const filename = `${photo.image_key}.jpg`;
					const proxy = `${base}/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
					return fetch(proxy, { signal })
						.then((r) => r.blob())
						.then((data) => ({ name: filename, data }));
				}

				let next = 0;
				const inflight = new Map<number, Promise<Entry>>();

				// Seed the window.
				while (next < entries.length && inflight.size < CONCURRENCY) {
					inflight.set(next, fetchPhoto(entries[next]));
					next++;
				}

				// Yield in order.
				for (let i = 0; i < entries.length; i++) {
					if (signal.aborted) return;
					const result = await inflight.get(i)!;
					inflight.delete(i);

					// Refill the window.
					if (next < entries.length) {
						inflight.set(next, fetchPhoto(entries[next]));
						next++;
					}

					progress.current++;
					progress = { ...progress };
					yield { name: result.name, input: result.data };
				}
			}

			const blob = await downloadZip(fileEntries()).blob();
			if (abortController?.signal.aborted) return;

			triggerBrowserDownload(blob, `favorites-${todayStamp()}.zip`);
			toast.success(`Downloaded ${entries.length} ${entries.length === 1 ? 'photo' : 'photos'}.`);
		} catch (err) {
			if ((err as Error).name !== 'AbortError') {
				console.error('[FavoritesDownload] Error:', err);
				toast.error('Download failed. Please try again.');
			}
		} finally {
			downloading = false;
			abortController = null;
		}
	}

	function cancelDownload(event?: MouseEvent) {
		event?.stopPropagation();
		abortController?.abort();
		downloading = false;
		abortController = null;
	}
</script>

{#if downloading}
	<div class="flex items-center gap-3">
		<div
			class="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-charcoal-900 border border-charcoal-800 text-sm text-charcoal-300"
		>
			<div
				class="w-4 h-4 border-2 border-gold-500 border-t-transparent rounded-full animate-spin"
				aria-hidden="true"
			></div>
			<span aria-live="polite">
				{#if progress.total > 0}
					Zipping {progress.current} / {progress.total}
				{:else}
					Preparing download...
				{/if}
			</span>
		</div>
		<button
			onclick={cancelDownload}
			class="p-2.5 rounded-lg bg-charcoal-900 border border-charcoal-800 hover:border-red-500/50 hover:bg-red-500/10 transition-colors"
			aria-label="Cancel download"
		>
			<X class="w-4 h-4 text-charcoal-400 hover:text-red-400" />
		</button>
	</div>
{:else}
	<button
		onclick={startDownload}
		class="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gold-500 hover:bg-gold-400 text-charcoal-950 font-medium transition-colors"
		aria-label="Download all favorites as ZIP"
	>
		<Download class="w-4 h-4" />
		Download all (ZIP)
	</button>
{/if}

<style>
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.animate-spin {
		animation: spin 1s linear infinite;
	}

	@media (prefers-reduced-motion: reduce) {
		.animate-spin {
			animation: none;
		}
	}
</style>
