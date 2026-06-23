<script lang="ts">
	import {
		Share2,
		X,
		Copy,
		Check,
		Twitter,
		Facebook,
		Image,
		Link
	} from 'lucide-svelte';
	import { downloadBrandedImage } from '$lib/utils/branded-image';
	import { cfImageUrl, hasCFImage } from '$lib/utils/cloudflare-images';
	import { trackEngagement } from '$lib/analytics/client';

	interface ShareTarget {
		/** Title for the shared content */
		title: string;
		/** Canonical URL to share */
		url: string;
		/** Image URL for branded downloads (use CF 'public' variant for best quality) */
		imageUrl: string;
		/** Optional text description */
		description?: string;
	}

	interface Props {
		target: ShareTarget;
		/** Visual style: 'toolbar' for lightbox/header, 'inline' for page body */
		variant?: 'toolbar' | 'inline';
		/** Popularity attribution: the photo's canonical id (Photo.id) and/or its album. */
		photoId?: string;
		albumKey?: string;
	}

	let { target, variant = 'toolbar', photoId, albumKey }: Props = $props();

	// Popularity signals (fire-and-forget; no-op if neither id is provided).
	const trackShare = () => trackEngagement('share', { photoId, albumKey, source: 'share' });
	const trackDownload = () => trackEngagement('download', { photoId, albumKey, source: 'share' });

	let menuOpen = $state(false);
	let copySuccess = $state(false);
	let downloading = $state(false);
	let menuEl: HTMLDivElement | undefined = $state();

	const hasWebShare = $derived(typeof navigator !== 'undefined' && !!navigator.share);

	const shareText = $derived(
		`${target.title} — Sports photography by Nino Chavez`
	);

	const shareUrls = $derived({
		twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(target.url)}`,
		facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(target.url)}`,
		pinterest: `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(target.url)}&media=${encodeURIComponent(target.imageUrl)}&description=${encodeURIComponent(shareText)}`
	});

	function toggleMenu(event: MouseEvent) {
		event.stopPropagation();
		menuOpen = !menuOpen;
		copySuccess = false;
	}

	function closeMenu() {
		menuOpen = false;
		copySuccess = false;
	}

	function handleClickOutside(event: MouseEvent) {
		if (menuOpen && menuEl && !menuEl.contains(event.target as Node)) {
			closeMenu();
		}
	}

	async function handleWebShare(event: MouseEvent) {
		event.stopPropagation();
		try {
			await navigator.share({
				title: target.title,
				text: shareText,
				url: target.url
			});
			trackShare();
		} catch (err) {
			// User cancelled or not supported — ignore
			if ((err as DOMException).name !== 'AbortError') {
				console.error('Web Share failed:', err);
			}
		}
		closeMenu();
	}

	async function handleCopyLink(event: MouseEvent) {
		event.stopPropagation();
		try {
			await navigator.clipboard.writeText(target.url);
			copySuccess = true;
			trackShare();
			setTimeout(() => { copySuccess = false; }, 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	function handlePlatformShare(platform: 'twitter' | 'facebook' | 'pinterest', event: MouseEvent) {
		event.stopPropagation();
		window.open(shareUrls[platform], '_blank', 'width=600,height=400');
		trackShare();
		closeMenu();
	}

	async function handleDownload(event: MouseEvent) {
		event.stopPropagation();
		downloading = true;
		try {
			const slug = target.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
			const filename = `${slug}.jpg`;
			await downloadBrandedImage({ imageUrl: target.imageUrl }, filename);
			trackDownload();
		} catch (err) {
			console.error('Image download failed:', err);
		} finally {
			downloading = false;
		}
	}

	// Keyboard handling
	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape' && menuOpen) {
			event.stopPropagation();
			closeMenu();
		}
	}

	const buttonClass = $derived(
		variant === 'toolbar'
			? 'p-2 md:p-3 rounded-lg bg-white/10 hover:bg-white/20 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-gold-500'
			: 'p-2.5 rounded-lg bg-charcoal-900 border border-charcoal-800 hover:border-gold-500/50 hover:bg-gold-500/10 transition-colors flex items-center gap-2 text-charcoal-300 hover:text-gold-500'
	);
</script>

<svelte:window onclick={handleClickOutside} onkeydown={handleKeyDown} />

<div class="relative" bind:this={menuEl}>
	<!-- Trigger Button -->
	<button
		onclick={toggleMenu}
		class={buttonClass}
		aria-label="Share"
		aria-expanded={menuOpen}
		aria-haspopup="true"
		title="Share"
	>
		<Share2 class="w-5 h-5 {variant === 'toolbar' ? 'text-white' : ''}" />
		{#if variant === 'inline'}
			<span class="text-sm">Share</span>
		{/if}
	</button>

	<!-- Dropdown Menu -->
	{#if menuOpen}
		<div
			class="absolute right-0 mt-2 w-64 rounded-xl bg-charcoal-900 border border-charcoal-700/50 shadow-2xl shadow-black/50 overflow-hidden animate-share-menu-open"
			style="z-index: 10000;"
			role="menu"
			aria-label="Share options"
		>
			<!-- Header -->
			<div class="flex items-center justify-between px-4 py-3 border-b border-charcoal-800/50">
				<span class="text-sm font-medium text-white">Share</span>
				<button
					onclick={(e) => { e.stopPropagation(); closeMenu(); }}
					class="p-1 rounded hover:bg-white/10 transition-colors"
					aria-label="Close share menu"
				>
					<X class="w-4 h-4 text-charcoal-400" />
				</button>
			</div>

			<div class="py-2">
				<!-- Web Share API (mobile) -->
				{#if hasWebShare}
					<button
						onclick={handleWebShare}
						class="share-menu-item"
						role="menuitem"
					>
						<Share2 class="w-4 h-4" />
						<span>Share via...</span>
					</button>
				{/if}

				<!-- Copy Link -->
				<button
					onclick={handleCopyLink}
					class="share-menu-item"
					role="menuitem"
				>
					{#if copySuccess}
						<Check class="w-4 h-4 text-green-400" />
						<span class="text-green-400">Link copied!</span>
					{:else}
						<Link class="w-4 h-4" />
						<span>Copy link</span>
					{/if}
				</button>

				<div class="border-t border-charcoal-800/50 my-2"></div>

				<!-- Image Download -->
				<button
					onclick={handleDownload}
					disabled={downloading}
					class="share-menu-item"
					role="menuitem"
				>
					<Image class="w-4 h-4" />
					<span>
						{#if downloading}
							Preparing image...
						{:else}
							Download image
						{/if}
					</span>
				</button>

				<div class="border-t border-charcoal-800/50 my-2"></div>

				<!-- Platform Links -->
				<button
					onclick={(e) => handlePlatformShare('twitter', e)}
					class="share-menu-item"
					role="menuitem"
				>
					<Twitter class="w-4 h-4" />
					<span>Twitter / X</span>
				</button>

				<button
					onclick={(e) => handlePlatformShare('facebook', e)}
					class="share-menu-item"
					role="menuitem"
				>
					<Facebook class="w-4 h-4" />
					<span>Facebook</span>
				</button>

				<button
					onclick={(e) => handlePlatformShare('pinterest', e)}
					class="share-menu-item"
					role="menuitem"
				>
					<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="12" y1="17" x2="12" y2="22" /><path d="M8 22l4-5 4 5" /><path d="M2 12A10 10 0 1 0 12 2a7 7 0 0 0-7 7c0 2 .5 3.5 2 5" />
					</svg>
					<span>Pinterest</span>
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.share-menu-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		color: theme('colors.charcoal.300');
		transition: background-color 0.15s, color 0.15s;
	}

	.share-menu-item:hover:not(:disabled) {
		background-color: rgba(255, 255, 255, 0.05);
		color: white;
	}

	.share-menu-item:disabled {
		opacity: 0.5;
		cursor: wait;
	}

	@keyframes share-menu-open {
		from {
			opacity: 0;
			transform: translateY(-4px) scale(0.98);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.animate-share-menu-open {
		animation: share-menu-open 150ms ease-out;
	}
</style>
