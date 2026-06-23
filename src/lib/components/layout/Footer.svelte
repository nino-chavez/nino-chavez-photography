<!--
  Footer Component - Site-wide footer

  Features:
  - Minimal brand presence
  - Essential navigation links
  - Social proof and contact
  - Compact, content-focused design

  Usage:
  <Footer />
-->

<script lang="ts">
	import { base } from '$app/paths';
	import { Camera, Mail, Instagram } from 'lucide-svelte';
	import Typography from '$lib/components/ui/Typography.svelte';

	interface SocialLink {
		label: string;
		href: string;
		icon: typeof Instagram;
		external?: boolean;
	}

	const socialLinks: SocialLink[] = [
		{
			label: 'Instagram',
			href: 'https://www.instagram.com/nino.chavez.photo',
			icon: Instagram,
			external: true,
		},
		{
			label: 'Email',
			href: 'mailto:nino@ninochavez.co',
			icon: Mail,
		},
	];

	const currentYear = new Date().getFullYear();
</script>

<footer class="border-t border-charcoal-800 bg-charcoal-950 mt-auto">
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		<div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
			<!-- Brand Section -->
			<div class="flex items-center gap-3">
				<div class="p-1.5 rounded-md bg-gold-500/10" aria-hidden="true">
					<Camera class="w-4 h-4 text-gold-500" />
				</div>
				<div>
					<Typography variant="body" class="text-sm font-medium text-white">
						Nino Chavez
					</Typography>
					<Typography variant="caption" class="text-charcoal-400 text-xs">
						Sports Photography
					</Typography>
				</div>
			</div>

			<!-- Social Links & Links -->
			<div class="flex items-center justify-between md:justify-end gap-6">
				<!-- Essential Links -->
				<nav aria-label="Footer navigation" class="flex flex-wrap gap-x-4 gap-y-2">
					<a
						href="{base}/explore"
						class="text-charcoal-400 hover:text-gold-500 transition-colors text-sm"
					>
						Gallery
					</a>
					<a
						href="{base}/timeline"
						class="text-charcoal-400 hover:text-gold-500 transition-colors text-sm"
					>
						Timeline
					</a>
					<a
						href="{base}/collections"
						class="text-charcoal-400 hover:text-gold-500 transition-colors text-sm"
					>
						Collections
					</a>
					<a
						href="{base}/favorites"
						class="text-charcoal-400 hover:text-gold-500 transition-colors text-sm"
					>
						Favorites
					</a>
					<a
						href="{base}/about"
						class="text-charcoal-400 hover:text-gold-500 transition-colors text-sm"
					>
						About
					</a>
					<a
						href="{base}/privacy"
						class="text-charcoal-400 hover:text-gold-500 transition-colors text-sm"
					>
						Privacy
					</a>
				</nav>

				<!-- Social Links -->
				<div class="flex gap-3">
					{#each socialLinks as link}
						{@const Icon = link.icon}
						<a
							href={link.href}
							target={link.external ? '_blank' : undefined}
							rel={link.external ? 'noopener noreferrer' : undefined}
							class="p-1.5 rounded-md bg-charcoal-900 hover:bg-gold-500/10 border border-charcoal-800 hover:border-gold-500/30 transition-all hover:scale-110 hover:-translate-y-px"
							aria-label={link.label}
						>
							<Icon class="w-4 h-4 text-charcoal-400 hover:text-gold-500 transition-colors" />
						</a>
					{/each}
				</div>
			</div>
		</div>

		<!-- Bottom Bar -->
		<div
			class="mt-6 pt-4 border-t border-charcoal-800/50 flex flex-col sm:flex-row justify-between items-center gap-2"
		>
			<Typography variant="caption" class="text-charcoal-400 text-xs">
				© {currentYear} Nino Chavez. All rights reserved.
			</Typography>
			<Typography variant="caption" class="text-charcoal-400 text-xs">
				MOTION. EMOTION. Frame by Frame.
			</Typography>
		</div>
	</div>
</footer>
