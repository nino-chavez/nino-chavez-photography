<script lang="ts">
	import { base } from '$app/paths';
	import { splitAlbumNameForDisplay } from '$lib/utils/canonical-album-naming';
	import Spotlight from '$lib/components/home/Spotlight.svelte';
	import type { LatestApiAlbum } from '$lib/albums/latest';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	let galleries = $derived(data.lead ? [data.lead, ...data.recent] : data.recent);
	function albumHref(album: LatestApiAlbum) {
		return new URL(album.url).pathname;
	}
	function date(value: string | null) {
		return value
			? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value))
			: '';
	}
</script>

<div class="photo-home">
	<section class="home-hero" aria-label="Nino Chavez Photography">
		<Spotlight start={data.photoStart} />
		<div class="hero-shade"></div>
		<div class="hero-bottom">
			<div class="hero-finder" id="find-event">
				<h1>Find your event.</h1>
				<form class="event-search" method="GET" action={`${base}/albums`}>
					<label for="event-query">Event, team or date</label>
					<div>
						<input id="event-query" name="q" type="search" placeholder="e.g. Chicago Point" autocomplete="off" /><button type="submit"
							>Search</button
						>
					</div>
				</form>
				<a class="browse-link" href="#recent-events">Browse recent galleries <span aria-hidden="true">↓</span></a>
			</div>
			{#if galleries.length}<section class="hero-recent" aria-label="Latest galleries">
					<h2>Recent galleries</h2>
					{#each galleries.slice(0, 2) as album (album.album_key)}<a href={albumHref(album)}
							><span class="gallery-label"
								><strong class="gallery-title">{splitAlbumNameForDisplay(album.album_name).title}</strong><span class="gallery-date"
									>{date(album.event_date)}</span
								></span
							><span class="gallery-cta">View gallery <span aria-hidden="true">→</span></span></a
						>{/each}
				</section>{/if}
		</div>
	</section>
	<section class="recent-events" id="recent-events" aria-labelledby="recent-title" tabindex="-1">
		<div class="section-title">
			<h2 id="recent-title">Recent events</h2>
			<a href={`${base}/albums`}>All events →</a>
		</div>
		{#if data.unavailable}<p>Recent galleries are temporarily unavailable. <a href={`${base}/albums`}>Try the event archive.</a></p>
		{:else if galleries.length}<div class="event-list">
				{#each galleries as album (album.album_key)}<a class="event-card" href={albumHref(album)}>
						{#if album.cover_url}<img src={album.cover_url} alt="" loading="lazy" />{:else}<span class="no-cover">Open gallery →</span>{/if}
						<p class="metadata">{date(album.event_date)} <span>{splitAlbumNameForDisplay(album.album_name).levelLabel}</span></p>
						<h3>{splitAlbumNameForDisplay(album.album_name).title}</h3>
						{#if album.photo_count > 0}<p class="event-count">{album.photo_count.toLocaleString()} photos</p>{/if}
					</a>{/each}
			</div>{:else}<p>New event galleries will appear here when they’re published.</p>{/if}
	</section>
	<div class="archive-end">
		<a href={`${base}/albums`}>Browse the full archive →</a>
		<p>Have a private gallery link? Open that link to view its photos.</p>
	</div>
</div>

<style>
	.photo-home {
		color: #f5f5f2;
		background: #181818;
		font:
			15px/1.5 Arial,
			Helvetica,
			sans-serif;
	}
	.photo-home :is(h1, h2, h3, p) {
		margin: 0;
	}
	.photo-home a {
		color: inherit;
		text-decoration: none;
	}
	.photo-home a:hover {
		text-decoration: underline;
		text-underline-offset: 5px;
	}
	.photo-home :focus-visible {
		outline: 2px solid #fff;
		outline-offset: 4px;
	}
	.home-hero {
		position: relative;
		isolation: isolate;
		min-height: 700px;
		height: 100svh;
		background: #181818;
		color: #fff;
	}
	.hero-shade {
		position: absolute;
		inset: 0;
		z-index: -1;
		pointer-events: none;
		background:
			linear-gradient(180deg, #0009 0%, transparent 25%, transparent 48%, #0003 62%, #000d 100%),
			linear-gradient(90deg, #0003, transparent 45%);
	}
	.hero-bottom {
		position: absolute;
		bottom: 48px;
		left: 48px;
		right: 48px;
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 80px;
	}
	.hero-finder {
		width: 440px;
		max-width: 100%;
		scroll-margin-top: 24px;
	}
	.hero-finder h1 {
		font:
			500 38px/1.15 Montserrat,
			Arial,
			sans-serif;
		letter-spacing: -1.6px;
		margin: 0 0 24px;
	}
	.event-search label {
		font-size: 14px;
		color: #fff;
		display: block;
		margin-bottom: 8px;
	}
	.event-search > div {
		display: flex;
		gap: 0;
		border-bottom: 1px solid #fffc;
		background: #181818b8;
	}
	.event-search input {
		flex: 1;
		width: 100%;
		min-width: 0;
		border: 0;
		background: transparent;
		border-radius: 0;
		min-height: 52px;
		color: #fff;
		font:
			16px Arial,
			Helvetica,
			sans-serif;
		padding: 12px 15px;
	}
	.event-search input::placeholder {
		color: #d5d5d0;
	}
	.event-search button {
		border: 0;
		border-radius: 0;
		min-width: 88px;
		padding: 12px 18px;
		color: #181818;
		background: #f5f5f2;
		font:
			600 14px Arial,
			Helvetica,
			sans-serif;
		cursor: pointer;
	}
	.event-search button:hover {
		background: #deded8;
	}
	.browse-link {
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		padding: 12px 16px;
		margin-top: 14px;
		min-height: 46px;
		font-size: 14px;
		border: 1px solid #ffffffa0;
		background: #18181894;
		border-radius: 3px;
	}
	.browse-link:hover {
		background: #181818e0;
		text-decoration: none !important;
	}
	.hero-recent {
		width: 420px;
		flex-shrink: 0;
	}
	.hero-recent h2 {
		font-size: 17px;
		line-height: 1.4;
		font-weight: 600;
		margin: 0 0 12px;
	}
	.hero-recent > a {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 20px;
		align-items: center;
		padding: 15px 16px;
		margin-top: 8px;
		border: 1px solid #ffffff65;
		border-radius: 3px;
		background: #181818c4;
		min-height: 88px;
	}
	.gallery-label {
		min-width: 0;
	}
	.gallery-date {
		display: block;
		margin-top: 7px;
		font-size: 13px;
		color: #ddd;
	}
	.gallery-title {
		display: block;
		font-size: 16px;
		font-weight: 500;
		line-height: 1.35;
	}
	.gallery-cta {
		display: inline-flex;
		align-items: center;
		gap: 12px;
		min-height: 44px;
		padding: 10px 12px;
		color: #181818;
		background: #f5f5f2;
		border-radius: 2px;
		font-size: 13px;
		font-weight: 600;
		white-space: nowrap;
	}
	.hero-recent a:hover {
		text-decoration: none;
		background: #181818ee;
		border-color: #fff;
	}
	.hero-recent a:hover .gallery-cta {
		background: #fff;
	}
	.recent-events {
		max-width: 1440px;
		margin: 0 auto;
		padding: 76px 48px 0;
		scroll-margin-top: 28px;
		outline: none;
	}
	.section-title {
		display: flex;
		justify-content: space-between;
		gap: 20px;
		margin-bottom: 32px;
		align-items: baseline;
	}
	.recent-events h2 {
		font:
			500 30px/1.2 Montserrat,
			Arial,
			sans-serif;
		letter-spacing: -0.7px;
	}
	.section-title a {
		font-size: 14px;
	}
	.event-list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 52px 32px;
	}
	.event-card {
		position: relative;
	}
	.event-card img,
	.no-cover {
		display: block;
		width: 100%;
		height: 340px;
		object-fit: cover;
		object-position: 50% 32%;
		background: #222;
		margin-bottom: 20px;
	}
	.no-cover {
		display: grid;
		place-items: center;
	}
	.event-card .metadata {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		font-size: 13px;
		color: #c1c1bb;
		margin-bottom: 10px;
	}
	.event-card h3 {
		font-size: 24px;
		font-weight: 500;
		line-height: 1.25;
		max-width: 28em;
		margin-bottom: 8px;
		letter-spacing: -0.5px;
	}
	.event-count {
		font-size: 13px;
		color: #c1c1bb;
	}
	.archive-end {
		text-align: center;
		padding: 52px 24px 48px;
	}
	.archive-end > a {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		padding: 11px 16px;
		border: 1px solid #74746c;
		border-radius: 4px;
	}
	.archive-end p {
		color: #c1c1bb;
		font-size: 13px;
		margin-top: 20px;
	}
	@media (max-width: 1000px) {
		.hero-bottom {
			gap: 30px;
			left: 32px;
			right: 32px;
			bottom: 36px;
		}
		.hero-finder {
			width: 340px;
		}
		.hero-recent {
			width: 360px;
		}
		.recent-events {
			padding: 54px 32px 0;
		}
		.event-card img {
			height: 280px;
		}
	}
	@media (max-width: 700px) {
		.home-hero {
			min-height: 700px;
		}
		.hero-shade {
			background: linear-gradient(180deg, #0009, transparent 25%, #0004 42%, #0008 65%, #000e 100%);
		}
		.hero-bottom {
			left: 20px;
			right: 20px;
			bottom: 28px;
			display: block;
		}
		.hero-finder {
			width: 100%;
		}
		.hero-finder h1 {
			font-size: 30px;
			letter-spacing: -1px;
			margin-bottom: 18px;
		}
		.event-search label {
			font-size: 13px;
		}
		.event-search input {
			min-height: 50px;
		}
		.browse-link {
			font-size: 13px;
			margin-top: 12px;
			padding: 10px 14px;
		}
		.hero-recent {
			width: 100%;
			margin-top: 20px;
		}
		.hero-recent h2 {
			font-size: 15px;
			margin-bottom: 8px;
		}
		.hero-recent > a {
			padding: 12px;
			gap: 12px;
			min-height: 78px;
		}
		.gallery-date {
			margin-top: 5px;
			font-size: 12px;
		}
		.gallery-title {
			font-size: 14px;
			line-height: 1.3;
		}
		.gallery-cta {
			padding: 10px;
			font-size: 12px;
			gap: 6px;
		}
		.recent-events {
			padding: 40px 20px 0;
		}
		.recent-events h2 {
			font-size: 25px;
		}
		.section-title {
			margin-bottom: 24px;
		}
		.event-list {
			grid-template-columns: 1fr;
			gap: 32px;
		}
		.event-card img {
			height: auto;
			aspect-ratio: 4/3;
			object-fit: cover;
			margin-bottom: 16px;
		}
		.event-card h3 {
			font-size: 22px;
		}
		.event-card .metadata {
			display: flex;
			justify-content: space-between;
			gap: 12px;
			font-size: 12px;
			margin-bottom: 8px;
		}
	}
	@media (max-width: 350px) {
		.hero-bottom {
			left: 16px;
			right: 16px;
		}
	}
	@media (max-width: 700px) and (max-height: 700px) {
		.home-hero {
			min-height: max(560px, 100svh);
		}
		.hero-recent {
			display: none;
		}
		.hero-bottom {
			bottom: 24px;
		}
		.hero-shade {
			background: linear-gradient(180deg, #0009, transparent 25%, transparent 45%, #000d 100%);
		}
	}
	@media (forced-colors: active) {
		.hero-finder,
		.hero-recent {
			background: Canvas;
			color: CanvasText;
		}
		.event-search > div {
			border: 1px solid CanvasText;
		}
	}
</style>
