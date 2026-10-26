<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { Grid, Folder, Heart, Calendar } from 'lucide-svelte';
	import GlobalSearch from '$lib/components/ui/GlobalSearch.svelte';
	import { cn } from '$lib/utils';
	import { favorites } from '$lib/stores/favorites.svelte';

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

	let currentPath = $derived(page.url.pathname);

	function isActive(path: string): boolean {
		if (path === base || path === `${base}/`) {
			return currentPath === base || currentPath === `${base}/`;
		}
		return currentPath.startsWith(path);
	}
</script>

<header class="gallery-subnav sticky z-50 w-full">
	<div class="gallery-subnav__inner">
		<a
			class="gallery-subnav__section"
			href={`${base}/albums`}
			data-sveltekit-preload="tap"
			aria-label="Nino Chavez Photography events"
		>
			<span aria-hidden="true"></span>
			<strong>Nino Chavez Photography</strong>
		</a>

		<nav class="gallery-subnav__routes" aria-label="Photography navigation">
			{#each navItems as item (item.path)}
				{@const active = isActive(item.path)}
				{@const badgeCount = item.badge?.() || 0}
				<a
					href={item.path}
					data-sveltekit-preload="tap"
					class={{ active }}
					aria-current={active ? 'page' : undefined}
				>
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

<nav
	class="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-charcoal-950/95 backdrop-blur-lg border-t border-charcoal-800"
	style="padding-bottom: env(safe-area-inset-bottom, 0);"
	aria-label="Mobile photography navigation"
>
	<div class="flex justify-around py-2">
		{#each navItems as item (item.path)}
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
	:global(:root) { --gallery-header-height: 50px; }
	@media (max-width: 639px) { :global(:root) { --gallery-header-height: 48px; } }

	.gallery-subnav {
		top: 0;
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

	@media (max-width: 639px) {
		.gallery-subnav {
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
