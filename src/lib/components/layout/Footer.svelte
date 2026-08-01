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

	const practicePrimary = [
		['Work', '/work'],
		['Demos', '/demos'],
		['Learn', '/learn'],
		['Writing', '/blog'],
		['Photography', '/photography'],
		['About', '/about'],
	] as const;

	const practiceSecondary = [
		['Now', '/now'],
		['Links', '/links'],
		['Privacy', '/privacy'],
	] as const;
</script>

<footer class="border-t border-charcoal-800 bg-charcoal-950 mt-auto">
	<div class="open-practice-footer">
		<div>
			<p class="open-practice-footer__name">Nino Chavez</p>
			<p>Product architect and builder in Chicago.</p>
		</div>

		<nav aria-label="Site navigation">
			{#each practicePrimary as item}
				<a href={item[1]}>{item[0]}</a>
			{/each}
		</nav>

		<nav aria-label="More pages">
			{#each practiceSecondary as item}
				<a href={item[1]}>{item[0]}</a>
			{/each}
		</nav>

		<nav aria-label="External profiles">
			<a href="https://github.com/nino-chavez">GitHub ↗</a>
			<a href="https://www.linkedin.com/in/nino-chavez/">LinkedIn ↗</a>
			<a href="mailto:nino@ninochavez.co">Email ↗</a>
		</nav>
	</div>

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
						href="/photography#story"
						class="text-charcoal-400 hover:text-gold-500 transition-colors text-sm"
					>
						Story
					</a>
					<a
						href="/privacy"
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

<style>
	.open-practice-footer {
		display: grid;
		width: min(1320px, calc(100% - 48px));
		margin: 0 auto;
		padding: 54px 0 48px;
		grid-template-columns: minmax(240px, 1.35fr) repeat(3, minmax(120px, 0.55fr));
		gap: 40px;
		border-bottom: 1px solid rgb(241 234 223 / 0.18);
		color: #f1eadf;
	}

	.open-practice-footer p {
		margin: 0;
		color: rgb(241 234 223 / 0.58);
		font-size: 0.9rem;
	}

	.open-practice-footer .open-practice-footer__name {
		margin-bottom: 6px;
		color: #f1eadf;
		font-size: 1.05rem;
		font-weight: 760;
	}

	.open-practice-footer nav {
		display: grid;
		align-content: start;
		gap: 10px;
	}

	.open-practice-footer a {
		color: rgb(241 234 223 / 0.68);
		font-size: 0.82rem;
		font-weight: 600;
		text-decoration: none;
	}

	.open-practice-footer a:hover,
	.open-practice-footer a:focus-visible {
		color: #f1eadf;
	}

	.open-practice-footer :global(:focus-visible) {
		outline: 3px solid #d07a4e;
		outline-offset: 3px;
	}

	@media (max-width: 800px) {
		.open-practice-footer {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.open-practice-footer > div {
			grid-column: 1 / -1;
		}
	}

	@media (max-width: 520px) {
		.open-practice-footer {
			width: calc(100% - 32px);
			grid-template-columns: 1fr;
			gap: 30px;
		}

		.open-practice-footer > div {
			grid-column: auto;
		}
	}
</style>
