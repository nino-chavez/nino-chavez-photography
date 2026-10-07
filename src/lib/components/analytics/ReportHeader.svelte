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
	// At the largest text sizes the navigation is a sideways-scrolling row. It opens on the page you are on, and an arrow at an edge says there is more past it,
	// so a still frame shows that too. The links themselves are all keyboard-reachable: tabbing to one scrolls it into view.
	let nav = $state<HTMLElement | undefined>();
	let moreBefore = $state(false);
	let moreAfter = $state(false);
	function readEdges() {
		if (!nav) return;
		moreBefore = nav.scrollLeft > 1;
		moreAfter = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1;
	}
	// A browser scrolls a focused link only until it is partly in view, which leaves its name cut off under the fade. Tabbing to a link brings all of it in, clear of the edge.
	function bringIntoView(event: FocusEvent) {
		if (nav && nav.scrollWidth > nav.clientWidth + 1) (event.target as HTMLElement).scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}
	onMount(() => {
		const here = nav?.querySelector<HTMLElement>('[aria-current="page"]');
		if (nav && here && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = here.offsetLeft - (nav.clientWidth - here.offsetWidth) / 2;
		readEdges();
		const watch = new ResizeObserver(readEdges);
		if (nav) watch.observe(nav);
		return () => watch.disconnect();
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
	<div class="bar">
		<div class="identity"><span class="mark" aria-hidden="true">NC</span><span class="words">Nino Chavez <span class="divider">/</span> Photography reports</span></div>
		<div class="nav-wrap" class:more-before={moreBefore} class:more-after={moreAfter}>
			<nav class="masthead-links" aria-label="Report navigation" bind:this={nav} onscroll={readEdges} onfocusin={bringIntoView}>
				{#each links as link (link.key)}
					<a href={link.href} aria-current={mark(link.key)}>{link.label}</a>
				{/each}
			</nav>
		</div>
	</div>
</header>

<style>
	/* The header measures itself in rem, so a larger text size narrows it the way a narrower screen would. `.masthead` is the container the queries below measure; a query cannot style its own container, so the layout is on `.bar` inside it. */
	.masthead { container-type: inline-size; margin-bottom: .5rem; padding: .35rem 0; }
	.bar { align-items: center; display: flex; flex-wrap: wrap; gap: .5rem 1rem; justify-content: space-between; }
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
	.nav-wrap { min-width: 0; position: relative; }
	/*
		Large text, in two steps, by the header's own width in rem (a 390px phone: 16rem is about 150% text, 9.5rem about 235%).
		Under 16rem the brand shrinks to its badge, which keeps its words for a screen reader, and the five links wrap onto rows of their own, every
		one in view. Measured on Home at 390px (header height, and where the page heading starts; the first screen is 844px, so it must start above
		422px): 200% is 186px and 302px; 225% is 202px and 333px in Chromium, 248px and 379px in WebKit; 250% is 279px and 425px; 312% is 348px and
		587px, where the wrapped rows would fill the screen before any content. So under 9.5rem the links are one row that scrolls sideways instead,
		opened on the current page, with a fade and an arrow at each edge that has more beyond it, so a still picture shows it too.
	*/
	@container (max-width: 16rem) {
		.bar { flex-wrap: wrap; gap: .25rem .5rem; justify-content: flex-start; }
		.words { clip: rect(0 0 0 0); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
		.nav-wrap { flex: 1 1 100%; }
		.masthead-links { gap: .1rem; }
		.masthead-links a { min-height: 44px; padding-inline: .5rem; }
	}
	@container (max-width: 9.5rem) {
		.bar { flex-wrap: nowrap; gap: 0; }
		.mark { display: none; }
		.nav-wrap { flex: 1 1 0; }
		/* The fade and the arrow are decoration, not text, so they stay the same size in pixels. At 312% text a link is two thirds of the row, and a fade in rem would leave no room beside it. */
		.masthead-links {
			--edge: var(--page-background, #edf2f7);
			--fade: 28px;
			background:
				linear-gradient(to right, var(--edge) 30%, transparent) left center / var(--fade) 100% no-repeat local,
				linear-gradient(to left, var(--edge) 30%, transparent) right center / var(--fade) 100% no-repeat local,
				linear-gradient(to right, rgb(23 32 51 / .4), transparent) left center / 8px 100% no-repeat scroll,
				linear-gradient(to left, rgb(23 32 51 / .4), transparent) right center / 8px 100% no-repeat scroll;
			flex-wrap: nowrap; min-width: 0; overflow-x: auto; overscroll-behavior-x: contain; scroll-padding-inline: var(--fade); scrollbar-width: thin;
		}
		.masthead-links a { flex: none; }
		/* A round arrow where more links wait, drawn in pixels like the fade, so it is 28px at any text size. It is decoration: the empty alternative keeps it out of what a screen reader says, and it takes no taps (the links are the targets). */
		.nav-wrap::before, .nav-wrap::after { background: #fff; border: 2px solid var(--blue-ink, #174ea6); border-radius: 50%; box-sizing: border-box; color: var(--blue-ink, #174ea6); content: none; font: 700 22px/22px system-ui, sans-serif; height: 28px; pointer-events: none; position: absolute; text-align: center; top: calc(50% - 14px); width: 28px; }
		.nav-wrap.more-before::before { content: '‹'; content: '‹' / ''; left: 0; }
		.nav-wrap.more-after::after { content: '›'; content: '›' / ''; right: 0; }
	}
	@media (forced-colors: active) {
		.masthead-links a[aria-current] { border: 1px solid CanvasText; }
		.masthead-links a[aria-current='page'] { background: Highlight; border-width: 2px; color: HighlightText; forced-color-adjust: none; }
	}
</style>
