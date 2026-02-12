<!--
  About Page - Photographer story and background

  Features:
  - Personal story and journey
  - Photography philosophy
  - Featured photo from gallery
  - Contact information
  - Person schema markup for SEO

  Usage:
  /about
-->

<script lang="ts">
	import { base } from '$app/paths';
	import { Motion } from 'svelte-motion';
	import { Camera, Heart, Zap, Mail, Instagram } from 'lucide-svelte';
	import { MOTION } from '$lib/motion-tokens';
	import Typography from '$lib/components/ui/Typography.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import OptimizedImage from '$lib/components/ui/OptimizedImage.svelte';

	interface Props {
		data: {
			featuredPhoto: import('$types/photo').Photo | null;
		};
	}

	let { data }: Props = $props();

	const pageTitle = 'About - Nino Chavez Photography';
	const pageDescription =
		'Nino Chavez is a sports photographer who started courtside at his kid\'s volleyball games and never left. Thousands of matches later, every frame still matters.';

	let schemaData = $derived.by(() => ({
		'@context': 'https://schema.org',
		'@type': 'ProfilePage',
		mainEntity: {
			'@type': 'Person',
			name: 'Nino Chavez',
			jobTitle: 'Sports Photographer',
			description: pageDescription,
			url: 'https://photography.ninochavez.co/about',
			sameAs: ['https://www.instagram.com/nino.chavez.photo'],
			knowsAbout: ['Sports Photography', 'Volleyball Photography', 'Action Sports']
		}
	}));
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	{@html `<script type="application/ld+json">${JSON.stringify(schemaData)}</script>`}
</svelte:head>

<!-- Hero Section -->
<section class="py-16 lg:py-24 bg-gradient-to-b from-charcoal-950 to-charcoal-900">
	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
		<Motion
			let:motion
			initial={{ opacity: 0, y: 30 }}
			animate={{ opacity: 1, y: 0 }}
			transition={MOTION.spring.gentle}
		>
			<div use:motion class="space-y-6">
				<div class="flex justify-center">
					<div class="p-4 rounded-2xl bg-gold-500/10 border border-gold-500/20">
						<Camera class="w-12 h-12 text-gold-500" />
					</div>
				</div>

				<div class="space-y-4">
					<Typography variant="h1" class="text-4xl lg:text-5xl font-bold text-white">
						Meet Nino Chavez
					</Typography>
					<Typography variant="body" class="text-xl text-charcoal-300 max-w-2xl mx-auto">
						Started courtside at my kid's volleyball games. Never left.
					</Typography>
				</div>
			</div>
		</Motion>
	</div>
</section>

<!-- Story Section -->
<section class="py-16 lg:py-24">
	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
			<!-- Story Content -->
			<Motion
				let:motion
				initial={{ opacity: 0, x: -30 }}
				animate={{ opacity: 1, x: 0 }}
				transition={{ ...MOTION.spring.gentle, delay: 0.2 }}
			>
				<div use:motion class="space-y-6">
					<Typography variant="h2" class="text-3xl lg:text-4xl font-bold text-white">
						The Story Behind the Lens
					</Typography>

					<div class="space-y-4 text-charcoal-300 leading-relaxed">
						<Typography variant="body">
							What started as a way to capture my own kid's volleyball games turned into something a lot bigger. Now I cover high school and college matches, special events, and tournaments where the competition runs deep and the lighting is almost always terrible.
						</Typography>

						<Typography variant="body">
							I'm not here for stiff poses or generic highlight reels. I'm here to catch the flicker—the exact frame where determination meets opportunity, where emotion breaks through the surface.
						</Typography>

						<Typography variant="body">
							Thousands of matches and 20,000+ frames later, the work speaks for itself. When I'm not holding a camera, I work in tech. When I am holding a camera... well, that's when I'm probably the most myself.
						</Typography>
					</div>
				</div>
			</Motion>

			<!-- Featured Photo -->
			<Motion
				let:motion
				initial={{ opacity: 0, x: 30 }}
				animate={{ opacity: 1, x: 0 }}
				transition={{ ...MOTION.spring.gentle, delay: 0.4 }}
			>
				<div use:motion class="relative">
					{#if data.featuredPhoto}
						<div class="aspect-[3/4] rounded-2xl overflow-hidden border border-charcoal-700/50 shadow-2xl">
							<OptimizedImage
								src={data.featuredPhoto.image_url}
								alt="Featured sports photography by Nino Chavez"
								aspectRatio="3/4"
								quality="high"
								priority={true}
								class="w-full h-full object-cover"
							/>
						</div>
					{:else}
						<div class="aspect-[3/4] rounded-2xl bg-gradient-to-br from-gold-500/20 to-charcoal-800/50 border border-gold-500/30 flex items-center justify-center">
							<div class="text-center space-y-4">
								<Camera class="w-16 h-16 text-gold-500 mx-auto" />
								<Typography variant="h3" class="text-xl font-semibold text-white">
									MOTION. EMOTION. Frame by Frame.
								</Typography>
							</div>
						</div>
					{/if}
				</div>
			</Motion>
		</div>
	</div>
</section>

<!-- Philosophy Section -->
<section class="py-16 lg:py-24 bg-charcoal-900/50">
	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
		<Motion
			let:motion
			initial={{ opacity: 0, y: 30 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ ...MOTION.spring.gentle, delay: 0.2 }}
		>
			<div use:motion class="text-center space-y-8">
				<div class="space-y-4">
					<Typography variant="h2" class="text-3xl lg:text-4xl font-bold text-white">
						Photography Philosophy
					</Typography>
					<Typography variant="body" class="text-xl text-charcoal-300 max-w-2xl mx-auto">
						Every shot tells a story. Every moment matters.
					</Typography>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
					<Motion
						let:motion
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ ...MOTION.spring.gentle, delay: 0.4 }}
					>
						<div use:motion>
							<Card padding="lg" class="text-center space-y-4 h-full">
							<div class="p-3 rounded-lg bg-gold-500/10 inline-block mx-auto">
								<Zap class="w-8 h-8 text-gold-500" />
							</div>
							<div class="space-y-2">
								<Typography variant="h3" class="text-lg font-semibold text-white">
									Fast Action
								</Typography>
								<Typography variant="body" class="text-charcoal-400 text-sm">
									Capturing the split-second moments where champions are made
								</Typography>
							</div>
						</Card>
						</div>
					</Motion>

					<Motion
						let:motion
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ ...MOTION.spring.gentle, delay: 0.5 }}
					>
						<div use:motion>
							<Card padding="lg" class="text-center space-y-4 h-full">
							<div class="p-3 rounded-lg bg-gold-500/10 inline-block mx-auto">
								<Heart class="w-8 h-8 text-gold-500" />
							</div>
							<div class="space-y-2">
								<Typography variant="h3" class="text-lg font-semibold text-white">
									Real Emotion
								</Typography>
								<Typography variant="body" class="text-charcoal-400 text-sm">
									The joy, determination, and intensity that define athletic moments
								</Typography>
							</div>
						</Card>
						</div>
					</Motion>

					<Motion
						let:motion
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ ...MOTION.spring.gentle, delay: 0.6 }}
					>
						<div use:motion>
							<Card padding="lg" class="text-center space-y-4 h-full">
							<div class="p-3 rounded-lg bg-gold-500/10 inline-block mx-auto">
								<Camera class="w-8 h-8 text-gold-500" />
							</div>
							<div class="space-y-2">
								<Typography variant="h3" class="text-lg font-semibold text-white">
									Authentic Stories
								</Typography>
								<Typography variant="body" class="text-charcoal-400 text-sm">
									The in-between moments that reveal the true spirit of competition
								</Typography>
							</div>
						</Card>
						</div>
					</Motion>
				</div>
			</div>
		</Motion>
	</div>
</section>

<!-- Call to Action -->
<section class="py-16 lg:py-24">
	<div class="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
		<Motion
			let:motion
			initial={{ opacity: 0, y: 30 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ ...MOTION.spring.gentle, delay: 0.2 }}
		>
			<div use:motion class="space-y-8">
				<div class="space-y-4">
					<Typography variant="h2" class="text-3xl lg:text-4xl font-bold text-white">
						See the Work
					</Typography>
					<Typography variant="body" class="text-xl text-charcoal-300">
						Clean shots, real emotion, and photos that hit. Browse the full gallery.
					</Typography>
				</div>

				<div class="flex flex-col sm:flex-row gap-4 justify-center items-center">
					<a
						href="{base}/explore"
						class="inline-flex items-center justify-center px-8 py-4 bg-gold-500 hover:bg-gold-600 text-charcoal-950 font-medium rounded-lg transition-colors"
					>
						Explore Gallery
					</a>

					<div class="flex gap-3">
						<Motion let:motion whileHover={{ scale: 1.05 }} transition={MOTION.spring.snappy}>
							<a
								use:motion
								href="mailto:nino@ninochavez.co"
								class="p-3 rounded-lg bg-charcoal-800 hover:bg-gold-500/10 border border-charcoal-700 hover:border-gold-500/50 transition-colors"
								aria-label="Email Nino"
							>
								<Mail class="w-5 h-5 text-charcoal-400 hover:text-gold-500 transition-colors" />
							</a>
						</Motion>

						<Motion let:motion whileHover={{ scale: 1.05 }} transition={MOTION.spring.snappy}>
							<a
								use:motion
								href="https://www.instagram.com/nino.chavez.photo"
								target="_blank"
								rel="noopener noreferrer"
								class="p-3 rounded-lg bg-charcoal-800 hover:bg-gold-500/10 border border-charcoal-700 hover:border-gold-500/50 transition-colors"
								aria-label="Follow on Instagram"
							>
								<Instagram class="w-5 h-5 text-charcoal-400 hover:text-gold-500 transition-colors" />
							</a>
						</Motion>
					</div>
				</div>
			</div>
		</Motion>
	</div>
</section>
