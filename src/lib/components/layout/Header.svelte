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
	import { Camera, Grid, Sparkles, Folder, Heart, Calendar } from 'lucide-svelte';
	import Typography from '$lib/components/ui/Typography.svelte';
	import GlobalSearch from '$lib/components/ui/GlobalSearch.svelte';
	import { cn } from '$lib/utils';
	import { favorites } from '$lib/stores/favorites.svelte';

	interface NavItem {
		label: string;
		path: string;
		icon: typeof Camera;
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
					<a href={item.href} aria-current={item.href === '/work' ? 'location' : undefined}>
						{item.label}
					</a>
				{/each}
			</nav>
			<a class="open-practice-shell__search" href="/search">Search site</a>
			<details class="open-practice-shell__mobile">
				<summary>Site menu</summary>
				<nav aria-label="Nino Chavez site">
					{#each practiceLinks as item}
						<a href={item.href} aria-current={item.href === '/work' ? 'location' : undefined}>
							{item.label}
						</a>
					{/each}
					<a href="/search">Search site</a>
				</nav>
			</details>
		</div>
	</div>

	<header
		class="gallery-header sticky z-50 w-full border-b border-charcoal-800 bg-charcoal-950/95 backdrop-blur-lg"
	>
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="flex items-center justify-between h-16">
				<!-- Logo/Brand -->
				<a
					href="{base}/"
					class="flex items-center gap-3 cursor-pointer group"
					aria-label="Go to homepage"
				>
					<div
						class="p-2 rounded-lg bg-gold-500/10 group-hover:bg-gold-500/20 transition-colors"
						aria-hidden="true"
					>
						<Camera class="w-6 h-6 text-gold-500" />
					</div>
					<!--
						`element="span"` keeps the h3 styling and drops the heading semantics.
						This wordmark is a logo, not a section heading, and it was emitting TWO
						h3 elements above the h1 on every page in the app — so a screen-reader
						user navigating by heading hit "Nino Chavez Photography" and "NCP"
						before reaching what the page is actually about. The link's accessible
						name comes from aria-label="Go to homepage" on the anchor, not from
						these being headings.
					-->
					<Typography
						variant="h3"
						element="span"
						class="hidden sm:block group-hover:text-gold-500 transition-colors"
					>
						Nino Chavez Photography
					</Typography>
					<Typography
						variant="h3"
						element="span"
						class="sm:hidden group-hover:text-gold-500 transition-colors"
					>
						NCP
					</Typography>
				</a>

				<!-- Navigation -->
				<nav class="flex items-center gap-1" aria-label="Main navigation">
					{#each navItems as item}
						{@const active = isActive(item.path)}
						{@const Icon = item.icon}
						{@const badgeCount = item.badge?.() || 0}
						<a
							href={item.path}
							data-sveltekit-preload="tap"
							class={cn(
								'nav-item-hover relative flex items-center gap-2 px-3 py-3 sm:px-4 sm:py-2 rounded-lg text-sm font-medium transition-all min-h-[44px]',
								active
									? 'bg-gold-500/10 text-gold-500'
									: 'text-charcoal-300 hover:text-white hover:bg-charcoal-800'
							)}
							aria-current={active ? 'page' : undefined}
						>
							<Icon class="w-5 h-5 sm:w-4 sm:h-4" aria-hidden="true" />
							<span class="hidden sm:inline">{item.label}</span>
							<span class="sr-only sm:hidden">{item.label}</span>

							<!-- Badge Count (NEW - Week 3 Bonus) -->
							{#if badgeCount > 0}
								<span
									class="absolute -top-1 -right-1 flex items-center justify-center min-w-5 h-5 px-1 text-xs font-bold rounded-full bg-red-500 text-white"
									aria-label="{badgeCount} favorites"
								>
									{badgeCount > 99 ? '99+' : badgeCount}
								</span>
							{/if}
						</a>
					{/each}
				</nav>

				<!-- Global Search -->
				<div class="max-w-md ml-4">
					<GlobalSearch />
				</div>
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

	.gallery-header {
		top: 64px;
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

	/* Nav item hover effect (replaces Motion whileHover) */
	.nav-item-hover {
		transition: transform 0.15s ease-out, background-color 0.2s, color 0.2s;
	}

	.nav-item-hover:hover {
		transform: scale(1.05);
	}

	/* Reduce motion for accessibility */
	@media (prefers-reduced-motion: reduce) {
		.header-animate {
			animation: none;
		}
		.nav-item-hover:hover {
			transform: none;
		}
	}

	@media (max-width: 767px) {
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

		.gallery-header {
			top: 56px;
		}
	}
</style>
