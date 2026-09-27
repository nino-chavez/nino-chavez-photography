<!--
  /links — mobile-first "link in bio" page for the nino.chavez.photo Instagram bio.

  Every tap target is a plain <a href>: nothing here depends on client JS to work. Design
  follows DESIGN.md (dark charcoal + gold accent, chrome recedes) and the
  `contained-cover-scale` hover device DIRECTION.md authorizes for gallery cards — the frame
  holds still, only the photo itself scales, never the whole tile (that's `lifting-tile`,
  removed).
-->
<script lang="ts">
	import { Images, ExternalLink, ChevronRight } from 'lucide-svelte';
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** `event_date` is already a bare `YYYY-MM-DD` (`toLatestApiAlbum` normalizes it from
	 * `latest_photo_date`, which carries a time-of-day) — force UTC on the display format too, so
	 * a negative-offset visitor timezone can't read the same bare date back as the day before. */
	function formatEventDate(iso: string | null): string {
		if (!iso) return '';
		return new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(iso));
	}

	// "All galleries" -> the site's own homepage (`/photography`), not the dedicated /albums browse
	// page — that's the destination Nino named for this row.
	// "Book event coverage" -> ninochavez.co/photography/coverage, which the main ninochavez.co site
	// serves, not this app. It sits under this app's base path, so the client router would claim it
	// and 404; `reload` forces a full navigation (same device as the site header/footer, see
	// navigation-contract.test.ts).
	const OUTBOUND_LINKS = [
		{ label: 'Book event coverage', href: '/photography/coverage', external: false, reload: true },
		{ label: 'All galleries', href: resolve('/'), external: false, reload: false },
		{ label: 'Flickday Media', href: 'https://flickdaymedia.com', external: true, reload: false },
		{ label: "Let's Pepper", href: 'https://letspepper.com', external: true, reload: false },
		{ label: 'ninochavez.co', href: 'https://ninochavez.co', external: true, reload: false }
	];
</script>

<div class="mx-auto max-w-md px-4 py-8 sm:py-12">
	<header class="text-center mb-8">
		<p class="text-xs font-semibold tracking-widest text-gold-500 uppercase mb-2">
			Nino Chavez Photography
		</p>
		<h1 class="text-3xl font-semibold text-white">Volleyball action, gallery by gallery</h1>
		<p class="text-sm text-charcoal-400 mt-2">
			Tap in for the newest shoot, or find your event below.
		</p>
	</header>

	{#if data.lead}
		<a
			href={data.lead.url}
			data-sveltekit-preload="hover"
			class="group relative block aspect-[4/3] rounded-xl overflow-hidden border border-charcoal-800 bg-charcoal-900 hover:border-gold-500/50 focus-visible:border-gold-500 focus-visible:ring-2 focus-visible:ring-gold-500/50 transition-colors duration-200 outline-none"
		>
			{#if data.lead.cover_url}
				<img
					src={data.lead.cover_url}
					alt={`${data.lead.album_name} cover`}
					width="800"
					height="600"
					loading="eager"
					fetchpriority="high"
					class="absolute inset-0 h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-105"
				/>
			{:else}
				<div class="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-charcoal-800 to-charcoal-900">
					<Images class="h-16 w-16 text-charcoal-600" aria-hidden="true" />
				</div>
			{/if}
			<div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-between p-4">
				<span class="self-start rounded-full bg-gold-500 px-3 py-1 text-xs font-semibold text-charcoal-950">
					Latest gallery
				</span>
				<div>
					<h2 class="text-xl font-semibold text-white leading-snug line-clamp-2">
						{data.lead.album_name}
					</h2>
					<p class="text-sm text-charcoal-300 mt-1">
						{formatEventDate(data.lead.event_date)}
						{#if data.lead.photo_count}
							· {data.lead.photo_count.toLocaleString()} photos
						{/if}
					</p>
				</div>
			</div>
		</a>
	{:else if data.unavailable}
		<div class="rounded-xl border border-charcoal-800 bg-charcoal-900 p-6 text-center text-charcoal-400">
			Galleries are temporarily unavailable — check back in a minute, or find them below.
		</div>
	{:else}
		<div class="rounded-xl border border-charcoal-800 bg-charcoal-900 p-6 text-center text-charcoal-400">
			No gallery is published yet — check back soon.
		</div>
	{/if}

	{#if data.recent.length > 0}
		<section class="mt-8">
			<h2 class="text-sm font-semibold text-charcoal-300 uppercase tracking-wide mb-3">
				More recent galleries
			</h2>
			<ul class="flex flex-col gap-2">
				{#each data.recent as album (album.album_key)}
					<li>
						<a
							href={album.url}
							data-sveltekit-preload="hover"
							class="group flex items-center gap-3 rounded-lg border border-charcoal-800 bg-charcoal-900 p-3 hover:border-gold-500/50 focus-visible:border-gold-500 focus-visible:ring-2 focus-visible:ring-gold-500/50 transition-colors duration-200 outline-none"
						>
							<span class="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-charcoal-800">
								{#if album.cover_url}
									<img
										src={album.cover_url}
										alt=""
										width="112"
										height="112"
										loading="lazy"
										class="absolute inset-0 h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-105"
									/>
								{:else}
									<Images class="absolute inset-0 m-auto h-6 w-6 text-charcoal-600" aria-hidden="true" />
								{/if}
							</span>
							<span class="min-w-0 flex-1">
								<span class="block line-clamp-2 text-base font-medium text-white">{album.album_name}</span>
								<span class="block text-sm text-charcoal-400">
									{formatEventDate(album.event_date)}
									{#if album.photo_count}
										· {album.photo_count.toLocaleString()} photos
									{/if}
								</span>
							</span>
							<ChevronRight class="h-5 w-5 shrink-0 text-charcoal-500 group-hover:text-gold-500 transition-colors" aria-hidden="true" />
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="mt-8">
		<h2 class="text-sm font-semibold text-charcoal-300 uppercase tracking-wide mb-3">
			More to explore
		</h2>
		<ul class="flex flex-col gap-2">
			{#each OUTBOUND_LINKS as link (link.href)}
				<li>
					<a
						href={link.href}
						rel={link.external ? 'noopener' : undefined}
						data-sveltekit-reload={link.reload ? '' : undefined}
						class="flex items-center justify-between rounded-lg border border-charcoal-800 bg-charcoal-900 px-4 py-3 text-base font-medium text-white hover:border-gold-500/50 focus-visible:border-gold-500 focus-visible:ring-2 focus-visible:ring-gold-500/50 transition-colors duration-200 outline-none"
					>
						<span>{link.label}</span>
						{#if link.external}
							<ExternalLink class="h-4 w-4 text-charcoal-500" aria-hidden="true" />
						{:else}
							<ChevronRight class="h-4 w-4 text-charcoal-500" aria-hidden="true" />
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	</section>
</div>
