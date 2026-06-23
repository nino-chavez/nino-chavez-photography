<!--
  Privacy Policy Page

  Legal page documenting data collection, processing, and user rights.
  Matches the about page's structure and styling for consistency.

  Usage:
  /privacy
-->

<script lang="ts">
	import { base } from '$app/paths';
	import Typography from '$lib/components/ui/Typography.svelte';

	const pageTitle = 'Privacy Policy - Nino Chavez Photography';
	const pageDescription = 'Privacy policy for ninochavez.co/photography. Learn how we collect and protect athlete data.';
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
</svelte:head>

<!-- Hero Section -->
<section class="py-16 lg:py-24 bg-gradient-to-b from-charcoal-950 to-charcoal-900">
	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
		<div style="animation: fade-slide-up 0.4s ease-out forwards" class="space-y-6">
			<div class="space-y-4">
				<Typography variant="h1" class="text-4xl lg:text-5xl font-bold text-white">
					Privacy Policy
				</Typography>
				<Typography variant="body" class="text-xl text-charcoal-300 max-w-2xl mx-auto">
					Your privacy matters. Here's exactly what we collect and how we protect it.
				</Typography>
			</div>
		</div>
	</div>
</section>

<!-- Content Section -->
<section class="py-16 lg:py-24">
	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
		<div style="animation: fade-slide-up 0.4s ease-out 0.2s both" class="space-y-12">
			<!-- Last Updated -->
			<div class="text-charcoal-400 text-sm">
				<Typography variant="body">
					<strong>Last Updated:</strong> June 23, 2026
				</Typography>
			</div>

			<!-- Section: Overview -->
			<div class="space-y-4">
				<Typography variant="h2" class="text-2xl lg:text-3xl font-bold text-white">
					Overview
				</Typography>
				<Typography variant="body" class="text-charcoal-300 leading-relaxed">
					Nino Chavez Photography operates photography.ninochavez.co. This privacy policy explains what
					data we collect, how we use it, and your rights regarding it.
				</Typography>
			</div>

			<!-- Section: What We Collect -->
			<div class="space-y-4">
				<Typography variant="h2" class="text-2xl lg:text-3xl font-bold text-white">
					What We Collect
				</Typography>

				<div class="space-y-6">
					<!-- Subsection: Traffic Analytics -->
					<div class="space-y-3">
						<Typography variant="h3" class="text-lg font-semibold text-white">
							Anonymous Traffic Analytics
						</Typography>
						<Typography variant="body" class="text-charcoal-300 leading-relaxed">
							We use Cloudflare Web Analytics to understand how visitors use our site. This service
							is <strong>cookieless and fully anonymized</strong> — no individual tracking, no persistent
							identifiers, and no personally identifiable information is collected. Aggregated usage
							data (pages visited, referrers, device types) is collected but cannot identify you.
						</Typography>
					</div>

					<!-- Subsection: Player Tags -->
					<div class="space-y-3">
						<Typography variant="h3" class="text-lg font-semibold text-white">
							Player Tags (Athlete Names & Jersey Numbers)
						</Typography>
						<Typography variant="body" class="text-charcoal-300 leading-relaxed">
							Visitors can optionally tag athletes in photos by submitting their name and optional
							jersey number. Before becoming public, all tags are reviewed by an admin. Published tags
							appear on the photo for identification purposes. To submit a tag, you must confirm you have
							permission from the athlete (or their parent/guardian if under 18).
						</Typography>
					</div>

					<!-- Subsection: Account Data -->
					<div class="space-y-3">
						<Typography variant="h3" class="text-lg font-semibold text-white">
							Account Holders (Admins & Contributors)
						</Typography>
						<Typography variant="body" class="text-charcoal-300 leading-relaxed">
							Users who create accounts to approve tags or contribute content authenticate via Supabase
							Auth. We collect your email address and any name you provide. Authentication is encrypted
							end-to-end using industry-standard protocols.
						</Typography>
					</div>

					<!-- Subsection: Media Infrastructure -->
					<div class="space-y-3">
						<Typography variant="h3" class="text-lg font-semibold text-white">
							Media Delivery Infrastructure
						</Typography>
						<Typography variant="body" class="text-charcoal-300 leading-relaxed">
							Photos and videos are delivered via Cloudflare Images and Cloudflare Stream. These services
							are infrastructure providers — they cache and serve media but do not track individual
							visitors. Standard CDN logs (IP, timestamp, requested asset) are retained transiently for
							operational purposes (debugging, DDoS prevention, performance).
						</Typography>
					</div>
				</div>
			</div>

			<!-- Section: Cookies & Tracking -->
			<div class="space-y-4">
				<Typography variant="h2" class="text-2xl lg:text-3xl font-bold text-white">
					Cookies & Tracking
				</Typography>

				<Typography variant="body" class="text-charcoal-300 leading-relaxed">
					<strong>We do not use tracking cookies.</strong> Cloudflare Web Analytics does not set any cookies.
				</Typography>

				<Typography variant="body" class="text-charcoal-300 leading-relaxed">
					<strong>Logged-in users only:</strong> If you create an account, Supabase Auth sets first-party
					essential cookies to maintain your session. These are functional cookies required for the service
					to work — not for tracking. Anonymous visitors receive no cookies.
				</Typography>

				<Typography variant="body" class="text-charcoal-300 leading-relaxed">
					<strong>No consent banner needed:</strong> Because we do not use tracking cookies or non-essential
					data collection, we do not require cookie consent under GDPR or similar regulations.
				</Typography>
			</div>

			<!-- Section: Minors -->
			<div class="space-y-4">
				<Typography variant="h2" class="text-2xl lg:text-3xl font-bold text-white">
					Youth Athletes (Under 18)
				</Typography>

				<Typography variant="body" class="text-charcoal-300 leading-relaxed">
					Tags may identify youth athletes in photos. <strong>Submitting a tag for a minor requires
					documented permission from a parent or legal guardian.</strong> By submitting a tag for someone
					under 18, you confirm you have obtained this permission.
				</Typography>

				<Typography variant="body" class="text-charcoal-300 leading-relaxed">
					If you are a parent or guardian and believe a minor's name or likeness has been published without
					consent, please contact us immediately at
					<a href="mailto:nino@ninochavez.co" class="text-gold-500 hover:text-gold-600 underline">
						nino@ninochavez.co
					</a>.
				</Typography>
			</div>

			<!-- Section: Data Retention -->
			<div class="space-y-4">
				<Typography variant="h2" class="text-2xl lg:text-3xl font-bold text-white">
					Data Retention
				</Typography>

				<Typography variant="body" class="text-charcoal-300 leading-relaxed">
					<strong>Player tags:</strong> Retained while the album is published on our site. Upon removal
					request, approved tags are deleted from the public view within 48 hours.
				</Typography>

				<Typography variant="body" class="text-charcoal-300 leading-relaxed">
					<strong>Account data (email, authentication tokens):</strong> Retained as long as the account exists.
				</Typography>

				<Typography variant="body" class="text-charcoal-300 leading-relaxed">
					<strong>Analytics data:</strong> Cloudflare retains aggregated analytics for 30 days.
				</Typography>

				<Typography variant="body" class="text-charcoal-300 leading-relaxed">
					<strong>CDN infrastructure logs:</strong> Transient, rotated per Cloudflare's standard retention policy.
				</Typography>
			</div>

			<!-- Section: Your Rights -->
			<div class="space-y-4">
				<Typography variant="h2" class="text-2xl lg:text-3xl font-bold text-white">
					Your Rights (CCPA & GDPR)
				</Typography>

				<Typography variant="body" class="text-charcoal-300 leading-relaxed">
					You have the right to:
				</Typography>

				<ul class="list-disc list-inside space-y-2 text-charcoal-300">
					<li>
						<Typography variant="body">
							<strong>Request access:</strong> See what personal data we hold about you.
						</Typography>
					</li>
					<li>
						<Typography variant="body">
							<strong>Request deletion:</strong> Ask us to delete your data (subject to legal retention
							requirements).
						</Typography>
					</li>
					<li>
						<Typography variant="body">
							<strong>Request removal of a tag:</strong> Have your name or a player's name removed from a
							photo's public tags.
						</Typography>
					</li>
				</ul>

				<Typography variant="body" class="text-charcoal-300 leading-relaxed">
					To exercise any of these rights, email
					<a href="mailto:nino@ninochavez.co" class="text-gold-500 hover:text-gold-600 underline">
						nino@ninochavez.co
					</a>
					with a clear description of your request.
				</Typography>
			</div>

			<!-- Section: Contact -->
			<div class="space-y-4">
				<Typography variant="h2" class="text-2xl lg:text-3xl font-bold text-white">
					Contact Us
				</Typography>

				<Typography variant="body" class="text-charcoal-300 leading-relaxed">
					If you have questions about this privacy policy or how we handle your data, reach out:
				</Typography>

				<div class="space-y-2 text-charcoal-300">
					<Typography variant="body">
						<strong>Email:</strong>
						<a href="mailto:nino@ninochavez.co" class="text-gold-500 hover:text-gold-600 underline">
							nino@ninochavez.co
						</a>
					</Typography>
				</div>
			</div>

			<!-- Navigation: Back to Home -->
			<div class="pt-8 border-t border-charcoal-800">
				<a href="{base}/" class="text-gold-500 hover:text-gold-600 underline text-sm font-medium">
					← Back to Home
				</a>
			</div>
		</div>
	</div>
</section>
