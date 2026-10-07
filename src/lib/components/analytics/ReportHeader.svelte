<script lang="ts">
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
	const mark = (key: string): 'page' | 'true' | undefined => {
		if (key === current) return 'page';
		if (key === 'albums' && (current === 'album' || current === 'photos')) return 'true';
		return undefined;
	};
</script>

<header class="masthead">
	<div class="identity"><span class="mark" aria-hidden="true">NC</span><span>Nino Chavez <span class="divider">/</span> Photography reports</span></div>
	<nav class="masthead-links" aria-label="Report navigation">
		{#each links as link (link.key)}
			<a href={link.href} aria-current={mark(link.key)}>{link.label}</a>
		{/each}
	</nav>
</header>

<style>
	.masthead { align-items: center; display: flex; flex-wrap: wrap; gap: .5rem 1rem; justify-content: space-between; margin-bottom: .5rem; padding: .35rem 0; }
	.identity { align-items: center; color: var(--ink, #172033); display: flex; font-size: .85rem; font-weight: 650; gap: .6rem; }
	.mark { background: var(--blue-ink, #174ea6); border-radius: .45rem; color: #fff; display: inline-grid; font-size: .7rem; height: 2rem; place-items: center; width: 2rem; }
	.divider { color: var(--muted, #526176); }
	.masthead-links { display: flex; flex-wrap: wrap; gap: .25rem; }
	.masthead-links a { align-items: center; border-radius: .5rem; color: var(--blue-ink, #174ea6); display: inline-flex; font-size: .85rem; font-weight: 650; min-height: 2.75rem; padding: 0 .7rem; text-decoration: none; }
	.masthead-links a:hover { background: #dce9fa; }
	.masthead-links a[aria-current] { background: #dce9fa; }
	.masthead-links a[aria-current='page'] { box-shadow: inset 0 -3px 0 var(--blue-ink, #174ea6); }
	a:focus-visible { outline: 3px solid var(--blue-ink, #174ea6); outline-offset: 2px; }
	@media (forced-colors: active) { .masthead-links a[aria-current] { border: 1px solid CanvasText; } }
</style>
