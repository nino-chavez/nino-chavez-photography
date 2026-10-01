<script lang="ts">
	import { tick } from 'svelte';
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import { Grid, Folder, Heart, Calendar } from 'lucide-svelte';
	import GlobalSearch from '$lib/components/ui/GlobalSearch.svelte';
	import { cn } from '$lib/utils';
	import { favorites } from '$lib/stores/favorites.svelte';
	import { GLOBAL_NAVIGATION, MENU_NAVIGATION } from '$lib/navigation-contract';

	interface NavItem {
		label: string;
		path: string;
		icon: typeof Folder;
		badge?: () => number;
	}

	const navItems: NavItem[] = [
		{ label: 'Events', path: `${base}/albums`, icon: Folder },
		{ label: 'By date', path: `${base}/timeline`, icon: Calendar },
		{ label: 'Collections', path: `${base}/collections`, icon: Grid },
		{ label: 'Saved', path: `${base}/favorites`, icon: Heart, badge: () => favorites.count }
	];

	let currentPath = $derived($page.url.pathname);
	let menuDialog: HTMLDialogElement;
	let menuButton: HTMLButtonElement;
	let siteMenuOpen = $state(false);
	let menuHistoryEntry = false;
	let pendingNavigation: string | null = null;
	let bodyOverflow = '';
	let rootOverflow = '';

	function isActive(path: string): boolean {
		if (path === base || path === `${base}/`) {
			return currentPath === base || currentPath === `${base}/`;
		}
		return currentPath.startsWith(path);
	}

	function lockBackground() {
		bodyOverflow = document.body.style.overflow;
		rootOverflow = document.documentElement.style.overflow;
		document.body.style.overflow = 'hidden';
		document.documentElement.style.overflow = 'hidden';
	}

	function unlockBackground() {
		document.body.style.overflow = bodyOverflow;
		document.documentElement.style.overflow = rootOverflow;
	}

	async function openMenu() {
		if (siteMenuOpen) return;

		siteMenuOpen = true;
		menuHistoryEntry = true;
		lockBackground();
		history.pushState({ ...history.state, siteNavigationDialog: true }, '', window.location.href);
		await tick();
		menuDialog.showModal();
	}

	function finishClosingMenu() {
		siteMenuOpen = false;
		menuHistoryEntry = false;
		unlockBackground();
		menuButton?.focus();
	}

	function closeMenu() {
		if (!siteMenuOpen) return;
		menuDialog.close();
		if (menuHistoryEntry) {
			menuHistoryEntry = false;
			history.back();
		}
	}

	function handleMenuPopState() {
		const destination = pendingNavigation;
		pendingNavigation = null;
		menuHistoryEntry = false;
		if (siteMenuOpen) menuDialog.close();
		if (destination) window.location.assign(destination);
	}

	function handleDialogClose() {
		if (siteMenuOpen) finishClosingMenu();
	}

	function handleDialogCancel(event: Event) {
		event.preventDefault();
		closeMenu();
	}

	function handleMenuLink(event: MouseEvent) {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		pendingNavigation = (event.currentTarget as HTMLAnchorElement).href;
		closeMenu();
	}

	function handleMenuSearch(event: SubmitEvent) {
		event.preventDefault();
		const form = new FormData(event.currentTarget as HTMLFormElement);
		const query = form.get('q');
		const destination = new URL('/search', window.location.origin);
		if (typeof query === 'string' && query) destination.searchParams.set('q', query);
		pendingNavigation = destination.href;
		closeMenu();
	}

	function handleMenuKeys(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;
		const controls = Array.from(menuDialog.querySelectorAll<HTMLElement>(
			'a[href], button:not([disabled]), input:not([disabled])'
		)).filter((element) => element.getClientRects().length > 0);
		const first = controls[0];
		const last = controls[controls.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last?.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first?.focus();
		}
	}
</script>

<svelte:window onpopstate={handleMenuPopState} />

<div class="open-practice-shell">
	<div class="open-practice-shell__inner">
		<a class="open-practice-shell__identity" href="/" data-sveltekit-reload aria-label="Nino Chavez, home">
			Nino Chavez
		</a>
		<nav class="open-practice-shell__desktop" aria-label="Nino Chavez site">
			{#each GLOBAL_NAVIGATION as item}
				<a
					href={item.href}
					data-sveltekit-reload
					aria-current={item.href === '/photography' ? 'location' : undefined}
				>
					{item.label}
				</a>
			{/each}
		</nav>
		<a class="open-practice-shell__search" href="/search" data-sveltekit-reload>Search site</a>
		<button
			bind:this={menuButton}
			class="open-practice-shell__menu"
			type="button"
			aria-expanded={siteMenuOpen}
			aria-haspopup="dialog"
			aria-controls="site-menu-dialog"
			onclick={openMenu}
		>
			Menu
		</button>
	</div>
</div>

<header class="gallery-subnav sticky z-50 w-full">
	<div class="gallery-subnav__inner">
		<a class="gallery-subnav__section" href="{base}/" data-sveltekit-reload aria-label="Photography home">
			<span aria-hidden="true"></span>
			<strong>Photography</strong>
		</a>

		<nav class="gallery-subnav__routes" aria-label="Photography navigation">
			{#each navItems as item}
				{@const active = isActive(item.path)}
				{@const badgeCount = item.badge?.() || 0}
				<a href={item.path} data-sveltekit-preload="tap" class:active aria-current={active ? 'page' : undefined}>
					{item.label}
					{#if badgeCount > 0}
						<span class="gallery-subnav__badge" aria-label="{badgeCount} saved photos">
							{badgeCount > 99 ? '99+' : badgeCount}
						</span>
					{/if}
				</a>
			{/each}
		</nav>

		<div class="gallery-subnav__search">
			<GlobalSearch />
		</div>
	</div>
</header>

<dialog
	bind:this={menuDialog}
	id="site-menu-dialog"
	class="site-menu-dialog"
	aria-labelledby="site-menu-title"
	oncancel={handleDialogCancel}
	onclose={handleDialogClose}
	onkeydown={handleMenuKeys}
>
	<div class="site-menu-dialog__header">
		<p id="site-menu-title">Navigate</p>
		<button type="button" class="site-menu-dialog__close" onclick={closeMenu}>Close</button>
	</div>
	<form class="site-menu-dialog__search" action="/search" role="search" onsubmit={handleMenuSearch}>
		<label for="site-menu-query">Search this site</label>
		<div>
			<input id="site-menu-query" name="q" type="search" placeholder="Project, topic, or page…" />
			<button type="submit">Search</button>
		</div>
	</form>
	<nav class="site-menu-dialog__links" aria-label="Nino Chavez site">
		{#each GLOBAL_NAVIGATION as item}
			<a
				href={item.href}
				data-sveltekit-reload
				aria-current={item.href === '/photography' ? 'location' : undefined}
				onclick={handleMenuLink}
			>
				{item.label}
			</a>
		{/each}
	</nav>
	<nav class="site-menu-dialog__secondary" aria-label="More pages">
		{#each MENU_NAVIGATION.filter((item) => item.href === '/now' || item.href === '/links') as item}
			<a href={item.href} data-sveltekit-reload onclick={handleMenuLink}>{item.label}</a>
		{/each}
	</nav>
</dialog>

<nav
	class="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-charcoal-950/95 backdrop-blur-lg border-t border-charcoal-800"
	style="padding-bottom: env(safe-area-inset-bottom, 0);"
	aria-label="Mobile photography navigation"
>
	<div class="flex justify-around py-2">
		{#each navItems as item}
			{@const active = isActive(item.path)}
			{@const Icon = item.icon}
			{@const badgeCount = item.badge?.() || 0}
			<a
				href={item.path}
				class={cn(
					'flex flex-col items-center gap-1 px-3 py-2 min-w-[64px] min-h-[44px] rounded-lg transition-colors',
					active ? 'text-gold-500' : 'text-charcoal-400 hover:text-white'
				)}
				aria-current={active ? 'page' : undefined}
			>
				<div class="relative">
					<Icon class="w-5 h-5" aria-hidden="true" />
					{#if badgeCount > 0}
						<span
							class="absolute -top-1 -right-2 min-w-4 h-4 px-1 text-[10px] font-bold rounded-full bg-red-500 text-white flex items-center justify-center"
							aria-label="{badgeCount} saved photos"
						>
							{badgeCount > 99 ? '99+' : badgeCount}
						</span>
					{/if}
				</div>
				<span class="text-[10px] font-medium">{item.label}</span>
			</a>
		{/each}
	</div>
</nav>

<style>
	:global(:root) { --gallery-header-height: 114px; }
	@media (max-width: 680px) { :global(:root) { --gallery-header-height: 110px; } }
	@media (max-width: 639px) { :global(:root) { --gallery-header-height: 108px; } }
	.open-practice-shell {
		--shell-ground: #07131d;
		--shell-text: #f4f0e8;
		--shell-muted: #b8c2ca;
		--shell-rule: #3a4a56;
		--shell-action: #e3c358;
		--shell-action-quiet: #263d4e;
		position: sticky;
		top: 0;
		z-index: 60;
		height: 64px;
		border-bottom: 1px solid var(--shell-rule);
		background: var(--shell-ground);
		color: var(--shell-text);
	}

	.open-practice-shell__inner {
		display: grid;
		width: min(1320px, calc(100% - 48px));
		height: 100%;
		margin: 0 auto;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 24px;
	}

	.open-practice-shell a,
	.open-practice-shell__menu {
		color: inherit;
		font-size: 0.85rem;
		font-weight: 620;
		text-decoration: none;
	}

	.open-practice-shell__identity {
		justify-self: start;
		font-size: 0.95rem !important;
		font-weight: 800 !important;
		letter-spacing: -0.01em;
	}

	.open-practice-shell__desktop {
		display: flex;
		align-self: stretch;
		align-items: center;
		gap: clamp(18px, 2.6vw, 36px);
	}

	.open-practice-shell__desktop a {
		display: inline-flex;
		height: 100%;
		align-items: center;
		border-bottom: 3px solid transparent;
		color: var(--shell-muted);
	}

	.open-practice-shell__desktop a:hover,
	.open-practice-shell__desktop a:focus-visible,
	.open-practice-shell__desktop a[aria-current] {
		border-bottom-color: var(--shell-action);
		color: var(--shell-text);
	}

	.open-practice-shell__search {
		justify-self: end;
		color: var(--shell-muted) !important;
	}

	.open-practice-shell__search:hover,
	.open-practice-shell__search:focus-visible {
		color: var(--shell-text) !important;
	}

	.open-practice-shell__menu {
		display: none;
		min-height: 42px;
		padding: 8px 13px;
		border: 1px solid var(--shell-rule);
		border-radius: 3px;
		font-size: 1rem;
		font-weight: 700;
		background: transparent;
		cursor: pointer;
	}

	.open-practice-shell :global(:focus-visible),
	.site-menu-dialog :global(:focus-visible) {
		outline: 2px solid var(--shell-action);
		outline-offset: 3px;
	}

	.gallery-subnav {
		top: 64px;
		height: 50px;
		border-bottom: 1px solid rgb(255 255 255 / 0.08);
		background: rgb(17 17 20 / 0.96);
		backdrop-filter: blur(16px);
	}

	.gallery-subnav__inner {
		display: grid;
		width: min(1280px, calc(100% - 48px));
		height: 100%;
		margin: 0 auto;
		grid-template-columns: minmax(120px, 1fr) auto minmax(120px, 1fr);
		align-items: center;
		gap: 16px;
	}

	.gallery-subnav__section {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		justify-self: start;
		gap: 10px;
		color: #f5f2ec;
		font-size: 0.85rem;
		letter-spacing: 0.01em;
		text-decoration: none;
	}

	.gallery-subnav__section > span {
		display: block;
		width: 2px;
		height: 18px;
		background: #d4af37;
	}

	.gallery-subnav__routes {
		display: flex;
		height: 100%;
		align-items: stretch;
		gap: 22px;
	}

	.gallery-subnav__routes > a {
		position: relative;
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		border-bottom: 2px solid transparent;
		color: rgb(255 255 255 / 0.58);
		font-size: 0.8rem;
		font-weight: 620;
		text-decoration: none;
	}

	.gallery-subnav__routes > a:hover,
	.gallery-subnav__routes > a:focus-visible {
		color: #fff;
	}

	.gallery-subnav__routes > a.active {
		border-bottom-color: #d4af37;
		color: #d4af37;
	}

	.gallery-subnav__badge {
		display: inline-flex;
		min-width: 17px;
		height: 17px;
		margin-left: 5px;
		padding: 0 4px;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		background: #b91c1c;
		color: #fff;
		font-size: 0.62rem;
		font-weight: 750;
	}

	.gallery-subnav__search {
		justify-self: end;
	}

	.site-menu-dialog {
		--shell-ground: #f4f0e8;
		--shell-text: #122a3c;
		--shell-muted: #536373;
		--shell-rule: #bbc0bf;
		--shell-action: #0d5a93;
		--shell-action-quiet: #e0e9ed;
		width: min(520px, calc(100% - 24px));
		max-height: calc(100dvh - 24px);
		margin: 12px 12px 12px auto;
		padding: 0;
		overflow: auto;
		border: 1px solid var(--shell-text);
		border-radius: 0;
		background: #f4f0e8;
		color: var(--shell-text);
	}

	.site-menu-dialog::backdrop {
		background: rgb(14 25 40 / 0.55);
	}

	.site-menu-dialog__header {
		display: flex;
		min-height: 64px;
		padding: 12px 18px;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid var(--shell-rule);
	}

	.site-menu-dialog__header p {
		margin: 0;
		font-size: 1rem;
		font-weight: 760;
	}

	.site-menu-dialog__close,
	.site-menu-dialog__search button {
		min-height: 42px;
		padding: 8px 13px;
		border: 1px solid var(--shell-rule);
		border-radius: 0;
		background: #f4f0e8;
		color: inherit;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}

	.site-menu-dialog__links {
		display: grid;
	}

	.site-menu-dialog__links a {
		display: flex;
		min-height: 58px;
		padding: 14px 18px;
		align-items: center;
		border-bottom: 1px solid var(--shell-rule);
		color: inherit;
		font-size: 1.05rem;
		font-weight: 680;
		text-decoration: none;
	}

	.site-menu-dialog__links a:hover,
	.site-menu-dialog__links a:focus-visible,
	.site-menu-dialog__links a[aria-current] {
		background: var(--shell-action-quiet);
	}
	.site-menu-dialog__links a[aria-current] {
		background: #0e1928;
		color: #f0f1f4;
		box-shadow: inset 4px 0 0 var(--shell-action);
	}

	.site-menu-dialog__links a[aria-current]::after {
		margin-left: auto;
		color: rgb(240 241 244 / 0.62);
		content: 'Current section';
		font-size: 0.72rem;
		font-weight: 500;
	}

	.site-menu-dialog__search {
		padding: 20px 18px;
		border-bottom: 1px solid var(--shell-rule);
	}
	.site-menu-dialog__search label {
		display: block;
		margin-bottom: 7px;
		color: var(--shell-muted);
		font-size: 0.78rem;
		font-weight: 700;
	}
	.site-menu-dialog__search > div { display: flex; gap: 8px; }
	.site-menu-dialog__search input {
		width: 100%;
		min-width: 0;
		min-height: 46px;
		padding: 9px 11px;
		border: 1px solid var(--shell-rule);
		border-radius: 0;
		background: #f4f0e8;
		color: #122a3c;
		font: inherit;
	}
	.site-menu-dialog__secondary {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		padding: 14px 18px;
		gap: 8px;
	}
	.site-menu-dialog__secondary a {
		display: flex;
		min-height: 42px;
		padding: 8px;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--shell-rule);
		color: inherit;
		font-size: 0.82rem;
		text-decoration: none;
	}
	@media (max-width: 680px) {
		.open-practice-shell { height: 60px; }
		.open-practice-shell__inner { width: calc(100% - 30px); }
		.gallery-subnav { top: 60px; }
		.site-menu-dialog__secondary { grid-template-columns: 1fr; }
	}

	@media (max-width: 920px) {
		.open-practice-shell__inner {
			width: calc(100% - 32px);
			grid-template-columns: 1fr auto;
		}

		.open-practice-shell__desktop,
		.open-practice-shell__search {
			display: none;
		}

		.open-practice-shell__menu {
			display: inline-flex;
			align-items: center;
		}
	}

	@media (max-width: 639px) {
		.gallery-subnav {
			top: 60px;
			height: 48px;
		}

		.gallery-subnav__inner {
			width: calc(100% - 32px);
			grid-template-columns: 1fr auto;
			gap: 16px;
		}

		.gallery-subnav__routes {
			display: none;
		}
	}
</style>
