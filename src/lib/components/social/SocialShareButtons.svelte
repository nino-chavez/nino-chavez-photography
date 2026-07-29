<script lang="ts">
	import { Share2, Twitter, Facebook, Linkedin, Mail, Check, Copy } from 'lucide-svelte';
	import Typography from '$lib/components/ui/Typography.svelte';
	import { shareUrl } from '$lib/analytics/share';
	import { recordShare } from '$lib/analytics/client';
	import type { Photo } from '$types/photo';

	interface Props {
		photo: Photo;
		url: string;
		compact?: boolean;
	}

	let { photo, url, compact = false }: Props = $props();

	// Popularity attribution. This component sits in the photo modal opened from the
	// gallery grid — the app's busiest share surface — and recorded nothing at all
	// until 2026-07-29: it built attributed URLs for all five channels and never
	// fired the matching engagement event, so `share` (the highest-weighted signal
	// in the popularity ranking) had zero rows in production, ever.
	const subject = $derived({ photoId: photo.id, albumKey: photo.album_key });

	let copySuccess = $state(false);

	// Generate share text optimized for each platform
	const shareText = $derived(
		`${photo.title} - Professional ${photo.metadata.sport_type || 'sports'} photography by Nino Chavez`
	);

	// Keyed by ShareChannel so the window-opening handler below can record the same
	// channel it opens, rather than taking a separate platform name that could drift.
	const shareUrls = $derived({
		x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl(url, 'x'))}`,
		fb: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl(url, 'fb'))}`,
		linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl(url, 'linkedin'))}`,
		// No Pinterest entry: this component renders no Pinterest button. The URL was
		// built and never used. ShareMenu has the button, and the 'pin' channel with it.
		email: `mailto:?subject=${encodeURIComponent(photo.title)}&body=${encodeURIComponent(`Check out this photo: ${shareText}\n\n${shareUrl(url, 'email')}`)}`
	});

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(shareUrl(url, 'copy'));
			recordShare(subject, 'copy');
			copySuccess = true;
			setTimeout(() => {
				copySuccess = false;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy link:', err);
		}
	}

	function handleShare(channel: 'x' | 'fb' | 'linkedin') {
		window.open(shareUrls[channel], '_blank', 'width=600,height=400');
		recordShare(subject, channel);
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
			onclick={() => handleShare('x')}
			class="p-2.5 rounded-lg bg-charcoal-900 border border-charcoal-800 hover:border-[#1DA1F2]/50 hover:bg-[#1DA1F2]/10 hover:scale-105 active:scale-95 transition-transform transition-colors group"
			aria-label="Share on Twitter"
			title="Share on Twitter"
		>
			<Twitter class="w-4 h-4 text-charcoal-300 group-hover:text-[#1DA1F2]" />
		</button>

		<!-- Facebook -->
		<button
			onclick={() => handleShare('fb')}
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
		<!-- An anchor, not a button: the mailto: URL has to be on `href` for the mail
		     client to open, so this is the one channel where the URL is built at render
		     time and the event has to be recorded separately on click. -->
		<a
			href={shareUrls.email}
			onclick={() => recordShare(subject, 'email')}
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
