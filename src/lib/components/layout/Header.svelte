<!--
  Header Component - Site navigation header

  Features:
  - Logo/brand name
  - Navigation links
  - Active route highlighting
  - Responsive mobile menu (future)
  - Sticky positioning

  Usage:
  <Header />
-->

<script lang="ts">
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import { Grid, Folder, Heart, Calendar } from 'lucide-svelte';
	import GlobalSearch from '$lib/components/ui/GlobalSearch.svelte';
	import { cn } from '$lib/utils';
	import { favorites } from '$lib/stores/favorites.svelte';

	interface NavItem {
		label: string;
		path: string;
		icon: typeof Folder;
		badge?: () => number; // Optional badge count function
	}

	// IA: Albums (event discovery) is the primary job and leads the nav. Search is the GlobalSearch
	// box (right side), which is the entry to /explore results — so "Explore" is no longer a nav item.
	const navItems: NavItem[] = [
		{ label: 'Albums', path: `${base}/albums`, icon: Folder },
		{ label: 'Timeline', path: `${base}/timeline`, icon: Calendar },
		{ label: 'Collections', path: `${base}/collections`, icon: Grid },
		{ label: 'Favorites', path: `${base}/favorites`, icon: Heart, badge: () => favorites.count },
	];

	const practiceLinks = [
		{ href: '/work', label: 'Work' },
		{ href: '/demos', label: 'Demos' },
		{ href: '/learn', label: 'Learn' },
		{ href: '/blog', label: 'Writing' },
		{ href: '/photography', label: 'Photography' },
		{ href: '/about', label: 'About' },
	] as const;

	// Derived from page store
	let currentPath = $derived($page.url.pathname);

	function isActive(path: string): boolean {
		if (path === base || path === `${base}/`) {
			return currentPath === base || currentPath === `${base}/`;
		}
		return currentPath.startsWith(path);
	}
</script>

<!-- PERFORMANCE: CSS animation instead of svelte-motion (loads on every page) -->
<div class="header-animate">
	<div class="open-practice-shell">
		<div class="open-practice-shell__inner">
			<a class="open-practice-shell__identity" href="/" aria-label="Nino Chavez, home">
				Nino Chavez
			</a>
			<nav class="open-practice-shell__desktop" aria-label="Nino Chavez site">
				{#each practiceLinks as item}
					<a href={item.href} aria-current={item.href === '/photography' ? 'location' : undefined}>
						{item.label}
					</a>
				{/each}
			</nav>
			<a class="open-practice-shell__search" href="/search">Search site</a>
			<details class="open-practice-shell__mobile">
				<summary>Menu</summary>
				<nav aria-label="Nino Chavez site">
					{#each practiceLinks as item}
						<a href={item.href} aria-current={item.href === '/photography' ? 'location' : undefined}>
							{item.label}
						</a>
					{/each}
					<a href="/search">Search site</a>
				</nav>
			</details>
		</div>
	</div>

	<header class="gallery-subnav sticky z-50 w-full">
		<div class="gallery-subnav__inner">
			<a class="gallery-subnav__section" href="{base}/" aria-label="Photography home">
				<span aria-hidden="true"></span>
				<strong>Photography</strong>
			</a>

			<nav class="gallery-subnav__routes" aria-label="Photography navigation">
				{#each navItems as item}
					{@const active = isActive(item.path)}
					{@const badgeCount = item.badge?.() || 0}
					<a
						href={item.path}
						data-sveltekit-preload="tap"
						class:active
						aria-current={active ? 'page' : undefined}
					>
						{item.label}
						{#if badgeCount > 0}
							<span class="gallery-subnav__badge" aria-label="{badgeCount} favorites">
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

	<!-- Mobile Bottom Navigation - Icons + Labels for discoverability -->
	<nav
		class="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-charcoal-950/95 backdrop-blur-lg border-t border-charcoal-800"
		style="padding-bottom: env(safe-area-inset-bottom, 0);"
		aria-label="Mobile navigation"
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
								aria-label="{badgeCount} favorites"
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
</div>

<style>
	.open-practice-shell {
		--practice-shell-height: 64px;
		position: sticky;
		top: 0;
		z-index: 60;
		height: var(--practice-shell-height);
		border-bottom: 1px solid rgb(241 234 223 / 0.22);
		background: #091426;
		color: #f1eadf;
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

	.open-practice-shell a {
		color: inherit;
		font-size: 0.875rem;
		font-weight: 650;
		text-decoration: none;
	}

	.open-practice-shell__identity {
		justify-self: start;
	}

	.open-practice-shell__desktop {
		display: flex;
		align-self: stretch;
		align-items: center;
		gap: 34px;
	}

	.open-practice-shell__desktop a {
		display: inline-flex;
		height: 100%;
		align-items: center;
		border-bottom: 3px solid transparent;
		color: rgb(241 234 223 / 0.62);
	}

	.open-practice-shell__desktop a:hover,
	.open-practice-shell__desktop a:focus-visible,
	.open-practice-shell__desktop a[aria-current] {
		color: #f1eadf;
	}

	.open-practice-shell__desktop a[aria-current] {
		border-bottom-color: #d07a4e;
	}

	.open-practice-shell__search {
		justify-self: end;
		color: rgb(241 234 223 / 0.62) !important;
	}

	.open-practice-shell__search:hover,
	.open-practice-shell__search:focus-visible {
		color: #f1eadf !important;
	}

	.open-practice-shell :global(:focus-visible) {
		outline: 3px solid #d07a4e;
		outline-offset: 3px;
	}

	.open-practice-shell__mobile {
		display: none;
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
		transition: border-color 160ms ease, color 160ms ease;
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

	/* PERFORMANCE: CSS animation instead of svelte-motion */
	@keyframes header-slide-in {
		from {
			opacity: 0;
			transform: translateY(-20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.header-animate {
		animation: header-slide-in 0.3s ease-out forwards;
	}


	/* Reduce motion for accessibility */
	@media (prefers-reduced-motion: reduce) {
		.header-animate {
			animation: none;
		}
	}

	@media (max-width: 920px) {
		.open-practice-shell {
			--practice-shell-height: 56px;
		}

		.open-practice-shell__inner {
			width: calc(100% - 32px);
			grid-template-columns: 1fr auto;
		}

		.open-practice-shell__desktop,
		.open-practice-shell__search {
			display: none;
		}

		.open-practice-shell__mobile {
			position: relative;
			display: block;
			justify-self: end;
		}

		.open-practice-shell__mobile summary {
			min-height: 44px;
			padding: 10px 12px;
			border: 1px solid rgb(241 234 223 / 0.34);
			border-radius: 2px;
			cursor: pointer;
			font-size: 0.82rem;
			font-weight: 700;
			list-style: none;
		}

		.open-practice-shell__mobile summary::-webkit-details-marker {
			display: none;
		}

		.open-practice-shell__mobile nav {
			position: absolute;
			top: calc(100% + 6px);
			right: 0;
			display: grid;
			width: min(270px, calc(100vw - 32px));
			padding: 8px;
			border: 1px solid rgb(241 234 223 / 0.34);
			background: #091426;
			box-shadow: 0 20px 44px rgb(0 0 0 / 0.42);
		}

		.open-practice-shell__mobile nav a {
			min-height: 44px;
			padding: 10px 12px;
			border-left: 3px solid transparent;
		}

		.open-practice-shell__mobile nav a[aria-current] {
			border-left-color: #d07a4e;
			background: rgb(64 81 237 / 0.16);
		}
	}

	@media (max-width: 639px) {

		.gallery-subnav {
			top: 56px;
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
