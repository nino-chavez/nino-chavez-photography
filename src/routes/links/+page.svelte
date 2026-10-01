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
	import { splitAlbumNameForDisplay } from '$lib/utils/canonical-album-naming';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The card title is the event/matchup segment, with any recognized level/division/sport
	// prefix ("HS Girls VB") lifted to a small secondary line and any trailing date segment
	// dropped — the date · photo-count line below already shows it. `splitAlbumNameForDisplay`
	// (the naming standard's own module) does the parsing; the raw `album_name` stays intact for
	// the lead card's alt text and is never itself rewritten. See canonical-album-naming.ts.
	let leadDisplay = $derived(data.lead ? splitAlbumNameForDisplay(data.lead.album_name) : null);
	let recentDisplay = $derived(
		data.recent.map((album) => ({ album, display: splitAlbumNameForDisplay(album.album_name) }))
	);

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

<div class="links-page">
	<header class="links-opening">
		<p class="links-eyebrow">
			Nino Chavez Photography
		</p>
		<h1>Volleyball action, gallery by gallery</h1>
		<p class="links-deck">
			Tap in for the newest shoot, or find your event below.
		</p>
	</header>

	{#if data.lead}
		<a
			href={data.lead.url}
			data-sveltekit-preload="hover"
			class="lead-gallery group"
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
					{#if leadDisplay?.levelLabel}
						<p class="text-xs font-medium text-charcoal-400 uppercase tracking-wide truncate">
							{leadDisplay.levelLabel}
						</p>
					{/if}
					<h2 class="text-xl font-semibold text-white leading-snug line-clamp-2">
						{leadDisplay?.title ?? data.lead.album_name}
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
				{#each recentDisplay as { album, display } (album.album_key)}
					<li>
						<a
							href={album.url}
							data-sveltekit-preload="hover"
				class="recent-gallery group"
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
								{#if display.levelLabel}
									<span class="block text-xs font-medium text-charcoal-400 uppercase tracking-wide truncate">
										{display.levelLabel}
									</span>
								{/if}
								<span class="block line-clamp-2 text-base font-medium text-white">{display.title}</span>
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
						class="outbound-link"
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

<style>
	.links-page { width: min(620px, calc(100% - 40px)); margin-inline: auto; padding-block: 40px 72px; color: var(--color-charcoal-50); }
	.links-opening { margin-bottom: 28px; padding-bottom: 24px; border-bottom: 1px solid var(--color-charcoal-800); text-align: left; }
	.links-eyebrow { margin-bottom: 14px; color: var(--color-gold-500); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
	.links-opening h1 { margin: 0; font-family: Montserrat, sans-serif; font-size: clamp(30px, 7vw, 42px); font-weight: 750; line-height: 1.08; letter-spacing: -.035em; }
	.links-deck { margin-top: 12px; color: var(--color-charcoal-300); font-size: 15px; line-height: 1.55; }
	.lead-gallery { position: relative; display: block; aspect-ratio: 4 / 3; overflow: hidden; border: 1px solid var(--color-charcoal-800); border-radius: 0; background: var(--color-charcoal-900); outline: none; }
	.recent-gallery, .outbound-link { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 12px; border: 1px solid var(--color-charcoal-800); border-radius: 0; background: transparent; outline: none; }
	.outbound-link { min-height: 52px; justify-content: space-between; padding-inline: 14px; color: white; font-size: 16px; font-weight: 650; }
	.lead-gallery:hover, .recent-gallery:hover, .outbound-link:hover { border-color: var(--color-gold-500); }
	.lead-gallery:focus-visible, .recent-gallery:focus-visible, .outbound-link:focus-visible { outline: 2px solid var(--color-gold-500); outline-offset: 3px; }
	@media (max-width: 480px) { .links-page { padding-block: 24px 56px; } }
</style>
