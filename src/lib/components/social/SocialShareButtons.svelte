<script lang="ts">
	import { Share2, Twitter, Facebook, Linkedin, Mail, Check, Copy } from 'lucide-svelte';
	import Typography from '$lib/components/ui/Typography.svelte';
	import { withSrc } from '$lib/utils/share-url';
	import type { Photo } from '$types/photo';

	interface Props {
		photo: Photo;
		url: string;
		compact?: boolean;
	}

	let { photo, url, compact = false }: Props = $props();

	let copySuccess = $state(false);

	// Generate share text optimized for each platform
	const shareText = $derived(
		`${photo.title} - Professional ${photo.metadata.sport_type || 'sports'} photography by Nino Chavez`
	);

	const shareUrls = $derived({
		twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(withSrc(url, 'share-x'))}`,
		facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(withSrc(url, 'share-fb'))}`,
		linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(withSrc(url, 'share-linkedin'))}`,
		pinterest: `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(withSrc(url, 'share-pin'))}&media=${encodeURIComponent(photo.image_url)}&description=${encodeURIComponent(shareText)}`,
		email: `mailto:?subject=${encodeURIComponent(photo.title)}&body=${encodeURIComponent(`Check out this photo: ${shareText}\n\n${withSrc(url, 'share-email')}`)}`
	});

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(withSrc(url, 'share-copy'));
			copySuccess = true;
			setTimeout(() => {
				copySuccess = false;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy link:', err);
		}
	}

	function handleShare(platform: string) {
		const shareUrl = shareUrls[platform as keyof typeof shareUrls];
		if (shareUrl) {
			window.open(shareUrl, '_blank', 'width=600,height=400');
		}
	}
</script>

<div class="space-y-3">
	{#if !compact}
		<div class="flex items-center gap-2">
			<Share2 class="w-4 h-4 text-charcoal-400" />
			<Typography variant="caption" class="text-charcoal-400">Share this photo</Typography>
		</div>
	{/if}

	<div class="flex flex-wrap gap-2">
		<!-- Twitter/X -->
		<button
			onclick={() => handleShare('twitter')}
			class="p-2.5 rounded-lg bg-charcoal-900 border border-charcoal-800 hover:border-[#1DA1F2]/50 hover:bg-[#1DA1F2]/10 hover:scale-105 active:scale-95 transition-transform transition-colors group"
			aria-label="Share on Twitter"
			title="Share on Twitter"
		>
			<Twitter class="w-4 h-4 text-charcoal-300 group-hover:text-[#1DA1F2]" />
		</button>

		<!-- Facebook -->
		<button
			onclick={() => handleShare('facebook')}
			class="p-2.5 rounded-lg bg-charcoal-900 border border-charcoal-800 hover:border-[#1877F2]/50 hover:bg-[#1877F2]/10 hover:scale-105 active:scale-95 transition-transform transition-colors group"
			aria-label="Share on Facebook"
			title="Share on Facebook"
		>
			<Facebook class="w-4 h-4 text-charcoal-300 group-hover:text-[#1877F2]" />
		</button>

		<!-- LinkedIn -->
		<button
			onclick={() => handleShare('linkedin')}
			class="p-2.5 rounded-lg bg-charcoal-900 border border-charcoal-800 hover:border-[#0A66C2]/50 hover:bg-[#0A66C2]/10 hover:scale-105 active:scale-95 transition-transform transition-colors group"
			aria-label="Share on LinkedIn"
			title="Share on LinkedIn"
		>
			<Linkedin class="w-4 h-4 text-charcoal-300 group-hover:text-[#0A66C2]" />
		</button>

		<!-- Email -->
		<a
			href={shareUrls.email}
			class="p-2.5 rounded-lg bg-charcoal-900 border border-charcoal-800 hover:border-gold-500/50 hover:bg-gold-500/10 hover:scale-105 active:scale-95 transition-transform transition-colors group"
			aria-label="Share via Email"
			title="Share via Email"
		>
			<Mail class="w-4 h-4 text-charcoal-300 group-hover:text-gold-500" />
		</a>

		<!-- Copy Link -->
		<button
			onclick={copyLink}
			class="p-2.5 rounded-lg bg-charcoal-900 border border-charcoal-800 hover:border-gold-500/50 hover:bg-gold-500/10 hover:scale-105 active:scale-95 transition-transform transition-colors group relative"
			aria-label="Copy link"
			title={copySuccess ? 'Link copied!' : 'Copy link'}
		>
			{#if copySuccess}
				<Check class="w-4 h-4 text-green-500" />
			{:else}
				<Copy class="w-4 h-4 text-charcoal-300 group-hover:text-gold-500" />
			{/if}
		</button>
	</div>

	{#if copySuccess}
		<div style="animation: fade-slide-down 0.3s ease-out forwards">
			<Typography variant="caption" class="text-green-500">Link copied to clipboard!</Typography>
		</div>
	{/if}
</div>
