<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { albumIndexPath, dataPath, homePath, settingsPath, sitePath } from '$lib/analytics/report-paths';

	/**
	 * The one header of the launch reports: Home, Albums, Site, Data, Settings. `current` names the page you are on.
	 * An album's own report and the gallery-wide photo view are inside Albums, so they mark Albums with
	 * `aria-current="true"` (you are in this section); only the page itself gets `"page"`.
	 */
	type Current = 'home' | 'albums' | 'album' | 'photos' | 'site' | 'data' | 'settings';
	let { current }: { current: Current } = $props();

	const hostname = $derived(page.url.hostname);
	const links = $derived([
		{ key: 'home', label: 'Home', href: homePath(hostname) },
		{ key: 'albums', label: 'Albums', href: albumIndexPath(hostname) },
		{ key: 'site', label: 'Site', href: sitePath(hostname) },
		{ key: 'data', label: 'Data', href: dataPath(hostname) },
		{ key: 'settings', label: 'Settings', href: settingsPath(hostname) }
	] as const);
	// When the navigation scrolls sideways (the largest text sizes), open it on the page you are on, so its name is not off to one side.
	let nav = $state<HTMLElement | undefined>();
	onMount(() => {
		const here = nav?.querySelector<HTMLElement>('[aria-current="page"]');
		if (nav && here && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = here.offsetLeft - (nav.clientWidth - here.offsetWidth) / 2;
	});
	const mark = (key: string): 'page' | 'true' | undefined => {
		if (key === current) return 'page';
		if (key === 'albums' && (current === 'album' || current === 'photos')) return 'true';
		return undefined;
	};
</script>

<svelte:head>
	<!--
		Dynamic Type. On iOS and iPadOS the root font size comes from the reader's text size setting (-apple-system-body, 17px at the
		default size), and every size on these pages is in rem or em, so the text, the spacing and the charts follow it. The rule
		sits here, in the head of the report pages only, so it goes when a reader leaves them and never reaches the public gallery.
		Other browsers keep their own default size and are not changed. macOS keeps its own: -apple-system-body is 13px there.
	-->
	<style>
		@supports (font: -apple-system-body) and (-webkit-touch-callout: none) {
			html { font: -apple-system-body; line-height: 1.5; }
		}
	</style>
</svelte:head>

<header class="masthead">
	<div class="identity"><span class="mark" aria-hidden="true">NC</span><span class="words">Nino Chavez <span class="divider">/</span> Photography reports</span></div>
	<nav class="masthead-links" aria-label="Report navigation" bind:this={nav}>
		{#each links as link (link.key)}
			<a href={link.href} aria-current={mark(link.key)}>{link.label}</a>
		{/each}
	</nav>
</header>

<style>
	/* The header measures itself in rem, so a larger text size narrows it the way a narrower screen would. */
	.masthead { align-items: center; container-type: inline-size; display: flex; flex-wrap: wrap; gap: .5rem 1rem; justify-content: space-between; margin-bottom: .5rem; padding: .35rem 0; }
	.identity { align-items: center; color: var(--ink, #172033); display: flex; flex-wrap: wrap; font-size: .85rem; font-weight: 650; gap: .3rem .6rem; min-width: 0; }
	.words { min-width: 0; overflow-wrap: break-word; }
	.mark { background: var(--blue-ink, #174ea6); border-radius: .45rem; color: #fff; display: inline-grid; flex: none; font-size: .7rem; height: 2rem; place-items: center; width: 2rem; }
	.divider { color: var(--muted, #526176); }
	.masthead-links { display: flex; flex-wrap: wrap; gap: .25rem; }
	.masthead-links a { align-items: center; border-radius: .5rem; color: var(--blue-ink, #174ea6); display: inline-flex; font-size: .85rem; font-weight: 650; min-height: max(44px, 1.75rem); padding: 0 .7rem; text-decoration: none; }
	.masthead-links a:hover { background: #dce9fa; }
	.masthead-links a[aria-current] { background: #dce9fa; }
	.masthead-links a[aria-current='page'] { box-shadow: inset 0 -3px 0 var(--blue-ink, #174ea6); }
	a:focus-visible { outline: 3px solid var(--blue-ink, #174ea6); outline-offset: 2px; }
	/*
		At the largest text sizes (the header is under 16rem wide: a 390px phone at 24px or more) the brand's words and the wrapped navigation
		would fill the first screen before any page content. The brand shrinks to its badge, which keeps its words for a screen reader, and the
		navigation is one row that scrolls sideways. A fade at each edge that has more beyond it says so, and a link scrolled to is never under it.
	*/
	@container (max-width: 16rem) {
		.masthead { flex-wrap: nowrap; gap: .5rem; justify-content: flex-start; }
		.words { clip: rect(0 0 0 0); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
		.masthead-links {
			--edge: var(--page-background, #edf2f7);
			background:
				linear-gradient(to right, var(--edge) 30%, transparent) left center / 1.6rem 100% no-repeat local,
				linear-gradient(to left, var(--edge) 30%, transparent) right center / 1.6rem 100% no-repeat local,
				linear-gradient(to right, rgb(23 32 51 / .4), transparent) left center / .5rem 100% no-repeat scroll,
				linear-gradient(to left, rgb(23 32 51 / .4), transparent) right center / .5rem 100% no-repeat scroll;
			flex: 1 1 0; flex-wrap: nowrap; min-width: 0; overflow-x: auto; overscroll-behavior-x: contain; scroll-padding-inline: 1.6rem; scrollbar-width: thin;
		}
		.masthead-links a { flex: none; }
	}
	@media (forced-colors: active) {
		.masthead-links a[aria-current] { border: 1px solid CanvasText; }
		.masthead-links a[aria-current='page'] { background: Highlight; border-width: 2px; color: HighlightText; forced-color-adjust: none; }
	}
</style>
