<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { onDestroy } from 'svelte';
	import { favorites } from '$lib/stores/favorites.svelte';
	let info = $state<HTMLDialogElement>();
	let trigger: HTMLButtonElement | null = null;
	let previousOverflow = '';
	const home = $derived(page.route.id === '/');
	const navItems = [
		{ label: 'Browse Galleries', path: `${base}/albums` },
		{ label: 'Browse Timeline', path: `${base}/timeline` },
		{ label: 'Saved', path: `${base}/favorites` }
	];
	function openInfo(event: MouseEvent) {
		trigger = event.currentTarget as HTMLButtonElement;
		previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		info?.showModal();
	}
	function closeInfo() {
		document.body.style.overflow = previousOverflow;
		trigger?.focus({ preventScroll: true });
	}
	onDestroy(() => {
		if (typeof document !== 'undefined' && info?.open) document.body.style.overflow = previousOverflow;
	});
</script>

<a class="skip" href="#main">Skip to photographs</a>
<header class="photography-header" class:home>
	<a class="brand" href={`${base}/`} aria-label="Nino Chavez Photography home"><strong>Nino Chavez</strong><span>Photography</span></a>
	<button class="info-link" onclick={openInfo} aria-haspopup="dialog">About &amp; contact</button>
	<nav aria-label="Photography navigation">
		{#each navItems as item (item.path)}
			<a href={item.path} aria-current={page.url.pathname.startsWith(item.path) ? 'page' : undefined}
				>{item.label}{#if item.label === 'Saved' && favorites.count > 0}<span class="saved-count">{favorites.count}</span>{/if}</a
			>
		{/each}
	</nav>
</header>
<dialog bind:this={info} class="info-dialog" aria-labelledby="info-title" onclose={closeInfo}>
	<div class="info-heading">
		<h2 id="info-title">Nino Chavez</h2>
		<button onclick={() => info?.close()} aria-label="Close about and contact">×</button>
	</div>
	<p>Volleyball, action sports, and the people around them.</p>
	<nav aria-label="About and contact links">
		<a href="https://ninochavez.co/photography/coverage" target="_blank" rel="noopener">Request coverage ↗</a>
		<a href="mailto:nino@ninochavez.co">nino@ninochavez.co</a>
		<a href="https://www.instagram.com/nino.chavez.photo" target="_blank" rel="noopener">Instagram ↗</a>
		<a href="https://ninochavez.co" target="_blank" rel="noopener">Profile ↗</a>
	</nav>
</dialog>

<style>
	:global(:root) {
		--gallery-header-height: 0px;
	}
	.photography-header {
		position: relative;
		z-index: 20;
		display: flex;
		align-items: center;
		gap: 28px;
		padding: 28px 48px 26px;
		max-width: 1600px;
		width: 100%;
		margin: auto;
		color: #f5f5f2;
		font-family: Arial, Helvetica, sans-serif;
	}
	.photography-header.home {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		max-width: none;
		padding: 30px 48px;
	}
	.brand {
		display: flex;
		flex-direction: column;
		margin-right: auto;
		white-space: nowrap;
		text-decoration: none;
		color: inherit;
		line-height: 1.25;
	}
	.brand strong {
		font-family: Montserrat, Arial, sans-serif;
		font-size: 23px;
		font-weight: 600;
		letter-spacing: -0.7px;
	}
	.brand span {
		font-size: 12px;
		letter-spacing: 0.04em;
		margin-top: 5px;
		color: #ddd;
	}
	nav {
		display: flex;
		align-items: center;
		gap: 32px;
		order: 1;
		font-size: 14px;
	}
	nav a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		white-space: nowrap;
		color: inherit;
		text-decoration: none;
	}
	nav a:hover,
	nav a[aria-current] {
		text-decoration: underline;
		text-underline-offset: 6px;
	}
	.info-link {
		order: 2;
		padding: 10px 12px;
		min-height: 44px;
		border: 1px solid #ffffff80;
		font-size: 14px;
		border-radius: 3px;
		line-height: 1.2;
		white-space: nowrap;
		background: #18181870;
		color: inherit;
		cursor: pointer;
	}
	.info-link:hover {
		background: #ffffff18;
		border-color: #fff;
	}
	.saved-count {
		margin-left: 6px;
	}
	.skip {
		position: absolute;
		top: -100px;
		left: 20px;
		z-index: 100;
		background: #fff;
		color: #111;
		padding: 12px;
	}
	.skip:focus {
		top: 4px;
	}
	:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 4px;
	}
	.info-dialog {
		width: min(500px, calc(100vw - 32px));
		max-height: calc(100dvh - 32px);
		padding: 28px;
		background: #222;
		color: #f5f5f2;
		border: 1px solid #777;
		border-radius: 5px;
		margin: auto;
		font-family: Arial, Helvetica, sans-serif;
	}
	.info-dialog::backdrop {
		background: #000b;
	}
	.info-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
	}
	.info-heading h2 {
		font-size: 28px;
		line-height: 1.2;
		margin: 0;
	}
	.info-heading button {
		min-height: 44px;
		min-width: 44px;
		font-size: 28px;
		background: transparent;
		color: inherit;
		border: 0;
		cursor: pointer;
	}
	.info-dialog p {
		color: #c1c1bb;
		font-size: 18px;
		margin-top: 16px;
	}
	.info-dialog nav {
		display: flex;
		align-items: flex-start;
		flex-direction: column;
		gap: 4px;
		margin-top: 24px;
		font-size: 16px;
	}
	@media (max-width: 1000px) {
		.photography-header,
		.photography-header.home {
			padding: 24px 32px;
			gap: 20px;
		}
		nav {
			gap: 20px;
		}
	}
	@media (max-width: 700px) {
		.photography-header,
		.photography-header.home {
			padding: 22px 20px;
			display: grid;
			grid-template-columns: 1fr auto;
			gap: 12px;
			align-items: start;
		}
		.brand strong {
			font-size: 19px;
		}
		.brand span {
			font-size: 11px;
		}
		.info-link {
			order: 0;
			font-size: 13px;
		}
		nav {
			grid-column: 1/-1;
			width: 100%;
			justify-content: space-between;
			gap: 10px;
			font-size: 13px;
		}
	}
	@media (max-width: 350px) {
		.photography-header,
		.photography-header.home {
			padding: 18px 16px;
		}
		.brand strong {
			font-size: 17px;
		}
		.info-link {
			padding-inline: 10px;
			font-size: 12px;
		}
		nav {
			font-size: 12px;
		}
	}
</style>
