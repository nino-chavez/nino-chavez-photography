<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import GlobalSearch from '$lib/components/ui/GlobalSearch.svelte';
	import { favorites } from '$lib/stores/favorites.svelte';

	const navItems = [
		{ label: 'Photographs', path: `${base}/#photographs` },
		{ label: 'Find an event', path: `${base}/albums` },
		{ label: 'Saved', path: `${base}/favorites` },
		{ label: 'Contact', path: 'mailto:nino@ninochavez.co' }
	];

	function isActive(path: string): boolean {
		const pathname = path.split('#')[0];
		if (pathname === `${base}/`) return page.url.pathname === base || page.url.pathname === `${base}/`;
		return page.url.pathname.startsWith(pathname);
	}
</script>

<header class="photography-header sticky top-0 z-50">
	<div class="photography-header__inner">
		<a class="photography-name" href={`${base}/`} aria-label="Nino Chavez Photography home" data-sveltekit-preload-data="tap">
			<span>Nino Chavez</span><small>Photography</small>
		</a>
		<nav aria-label="Photography navigation">
			{#each navItems as item (item.path)}
				<a href={item.path} data-sveltekit-reload={item.label === 'Photographs'} class:active={isActive(item.path)} aria-current={isActive(item.path) ? 'page' : undefined} data-sveltekit-preload-data="tap">
					{item.label}
					{#if item.label === 'Saved' && favorites.count > 0}
						<span class="saved-count" aria-label="{favorites.count} saved photos">{favorites.count > 99 ? '99+' : favorites.count}</span>
					{/if}
				</a>
			{/each}
		</nav>
		<div class="photography-search"><GlobalSearch /></div>
	</div>
</header>

<style>
	:global(:root) { --gallery-header-height: 88px; }
	.photography-header { background: var(--color-charcoal-950); border-bottom: 1px solid rgb(255 255 255 / 0.08); }
	.photography-header__inner { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 34px; max-width: 1440px; min-height: 88px; padding: 16px 48px; margin: auto; }
	.photography-name { display: flex; flex-direction: column; justify-self: start; color: var(--color-charcoal-50); font-family: Arial, Helvetica, sans-serif; text-decoration: none; line-height: 1.5; font-size: 17px; letter-spacing: -.03em; }
	.photography-name small { font-size: 11px; color: var(--color-charcoal-300); letter-spacing: .02em; }
	nav { display: flex; align-items: center; gap: 26px; }
	nav a { display: inline-flex; align-items: center; min-height: 44px; color: var(--color-charcoal-300); font-size: 13px; text-decoration: none; text-underline-offset: 5px; white-space: nowrap; }
	nav a:hover, nav a.active { color: var(--color-charcoal-50); text-decoration: underline; }
	a:focus-visible { outline: 2px solid var(--color-gold-400); outline-offset: 5px; }
	.saved-count { font-size: 10px; margin-left: 5px; padding: 0 4px; border: 1px solid currentColor; border-radius: 3px; }
	.photography-search { justify-self: end; }
	@media (max-width: 900px) { .photography-header__inner { padding-inline: 24px; gap: 20px; } nav { gap: 18px; } }
	@media (max-width: 700px) {
		:global(:root) { --gallery-header-height: 108px; }
		.photography-header__inner { grid-template-columns: 1fr auto; min-height: 108px; gap: 0 14px; padding: 10px 20px 4px; }
		.photography-name { flex-direction: row; align-items: baseline; gap: 8px; }
		.photography-name small { font-size: 11px; }
		nav { grid-column: 1 / -1; grid-row: 2; justify-content: space-between; gap: 10px; }
		nav a { font-size: 12px; }
		.photography-search { grid-column: 2; grid-row: 1; }
	}
</style>
