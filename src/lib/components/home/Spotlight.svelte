<script module lang="ts">
	// Only populated in the browser; one random deck per document, preserved on SPA return.
	let session: { seed: number; paused: boolean; desktop: number; mobile: number } | undefined;
</script>

<script lang="ts">
	import { browser } from '$app/environment';
	import { base } from '$app/paths';
	import { onMount, tick, untrack } from 'svelte';
	import { portfolio, photoStrip, rotatePortfolio, type PortfolioPhoto } from '$lib/portfolio';
	let { start }: { start: number } = $props();
	const initialStart = untrack(() => start);
	const saved = browser
		? (session ??= { seed: initialStart, paused: matchMedia('(prefers-reduced-motion: reduce)').matches, desktop: 0, mobile: 0 })
		: { seed: initialStart, paused: true, desktop: 0, mobile: 0 };
	const portraits = rotatePortfolio(portfolio, saved.seed);
	const landscapes = rotatePortfolio(photoStrip, saved.seed).filter((p) => p.width > p.height);
	const desktop = rotatePortfolio(
		[[landscapes[0]], portraits.slice(0, 3), [landscapes[1]], portraits.slice(3, 6), portraits.slice(6, 9), portraits.slice(9, 12)],
		saved.seed
	);
	const decks = [
		{ size: 'desktop', frames: desktop },
		{ size: 'mobile', frames: portraits.map((p) => [p]) }
	] as const;
	let root: HTMLDivElement;
	let outgoingFrame = $state<readonly PortfolioPhoto[] | null>(null);
	let outgoingElement = $state<HTMLDivElement>();
	let paused = $state(saved.paused);
	let ready = $state(false);
	let position = $state(1);
	let count = $state(6);
	let move = (_delta: number) => {};
	let toggle = () => {};
	onMount(() => {
		const motion = matchMedia('(prefers-reduced-motion: reduce)');
		let timer: ReturnType<typeof setTimeout>;
		let generation = 0,
			dragging = false,
			visible = true;
		let animation: Animation | undefined;
		const tracks = Array.from(root.querySelectorAll<HTMLElement>('[data-hero-track]'));
		const track = () => tracks.find((node) => node.clientWidth > 0);
		function stop() {
			clearTimeout(timer);
			generation++;
			animation?.cancel();
			outgoingFrame = null;
		}
		function canPlay() {
			const bounds = track()?.getBoundingClientRect();
			return (
				!paused &&
				bounds &&
				bounds.bottom > 0 &&
				bounds.top < innerHeight &&
				!dragging &&
				!document.hidden &&
				!document.querySelector('dialog[open]') &&
				!document.activeElement?.matches('input,textarea,[data-hero-track]')
			);
		}
		function update() {
			const node = track();
			if (!node) return;
			const index = Math.round(node.scrollLeft / node.clientWidth);
			position = index + 1;
			count = node.children.length;
			saved[node.dataset.heroTrack as 'desktop' | 'mobile'] = index;
		}
		function queue() {
			clearTimeout(timer);
			const token = ++generation;
			if (!canPlay()) return;
			const preload = track()!;
			const nextIndex = (Math.round(preload.scrollLeft / preload.clientWidth) + 1) % preload.children.length;
			preload.children[nextIndex].querySelectorAll('img').forEach((img) => (img.loading = 'eager'));
			timer = setTimeout(async () => {
				if (token !== generation || !canPlay()) return;
				const node = track()!,
					current = Math.round(node.scrollLeft / node.clientWidth);
				const next = (current + 1) % node.children.length;
				const images = Array.from(node.children[next].querySelectorAll('img'));
				images.forEach((img) => (img.loading = 'eager'));
				try {
					await Promise.all(images.map((img) => img.decode()));
				} catch {
					if (token === generation) queue();
					return;
				}
				if (token !== generation || !node.isConnected || !canPlay()) return;
				if (!motion.matches) {
					outgoingFrame = node.dataset.heroTrack === 'desktop' ? desktop[current] : [portraits[current]];
					await tick();
					if (token !== generation || !canPlay()) {
						outgoingFrame = null;
						return;
					}
					animation = outgoingElement!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1200, easing: 'ease-in-out' });
					const fade = animation;
					fade.finished.then(
						() => {
							if (animation === fade) outgoingFrame = null;
						},
						() => {}
					);
				}
				node.scrollTo({ left: next * node.clientWidth, behavior: 'instant' });
				update();
				queue();
			}, 8000);
		}
		function restart() {
			stop();
			queue();
		}
		move = (delta) => {
			stop();
			const node = track();
			if (!node) return;
			const index = (Math.round(node.scrollLeft / node.clientWidth) + delta + node.children.length) % node.children.length;
			node.scrollTo({ left: index * node.clientWidth, behavior: 'instant' });
			update();
			queue();
		};
		toggle = () => {
			paused = !paused;
			saved.paused = paused;
			restart();
		};
		const abort = new AbortController(),
			signal = abort.signal;
		for (const node of tracks) {
			node.scrollLeft = saved[node.dataset.heroTrack as 'desktop' | 'mobile'] * node.clientWidth;
			node.addEventListener(
				'scroll',
				() => {
					update();
					queue();
				},
				{ passive: true, signal }
			);
			node.addEventListener('wheel', restart, { passive: true, signal });
			node.addEventListener(
				'pointerdown',
				() => {
					dragging = true;
					restart();
				},
				{ passive: true, signal }
			);
			node.addEventListener(
				'keydown',
				(event) => {
					if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
						event.preventDefault();
						move(event.key === 'ArrowLeft' ? -1 : 1);
					}
				},
				{ signal }
			);
		}
		const release = () => {
			dragging = false;
			restart();
		};
		window.addEventListener('pointerup', release, { signal });
		window.addEventListener('pointercancel', release, { signal });
		window.addEventListener(
			'resize',
			() => {
				for (const node of tracks) node.scrollLeft = saved[node.dataset.heroTrack as 'desktop' | 'mobile'] * node.clientWidth;
				update();
				restart();
			},
			{ signal }
		);
		document.addEventListener('visibilitychange', restart, { signal });
		// Focus can change while Svelte removes a route. Wait until that render completes.
		const focusChanged = () =>
			queueMicrotask(() => {
				if (root.isConnected) restart();
			});
		document.addEventListener('focusin', focusChanged, { signal });
		document.addEventListener('focusout', focusChanged, { signal });
		motion.addEventListener(
			'change',
			() => {
				if (motion.matches) {
					paused = true;
					saved.paused = true;
				}
				restart();
			},
			{ signal }
		);
		const observer = new IntersectionObserver(([entry]) => {
			if (visible !== entry.isIntersecting) {
				visible = entry.isIntersecting;
				restart();
			}
		});
		observer.observe(root);
		ready = true;
		update();
		queue();
		return () => {
			clearTimeout(timer);
			generation++;
			animation?.cancel();
			abort.abort();
			observer.disconnect();
		};
	});
</script>

<div class="hero-photographs" bind:this={root}>
	{#each decks as deck (deck.size)}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable photo region supports keyboard paging.) -->
		<div
			class="hero-track {deck.size}"
			data-hero-track={deck.size}
			role="region"
			aria-label="Selected Works. Photographs advance automatically; pause or use the previous and next controls."
			tabindex="0"
		>
			{#each deck.frames as frame, i (frame[0].src)}
				<div class={['hero-frame', { triptych: frame.length > 1 }]}>
					{#each frame as photo (photo.src)}<img
							src={`${base}${photo.src}`}
							alt={photo.alt}
							width={photo.width}
							height={photo.height}
							loading={i === 0 ? 'eager' : 'lazy'}
							fetchpriority={i === 0 ? 'high' : 'low'}
							draggable="false"
						/>{/each}
				</div>
			{/each}
		</div>
	{/each}
	{#if outgoingFrame}<div
			bind:this={outgoingElement}
			class={['hero-frame', 'hero-outgoing', { triptych: outgoingFrame.length > 1 }]}
			aria-hidden="true"
		>
			{#each outgoingFrame as photo (photo.src)}<img src={`${base}${photo.src}`} alt="" width={photo.width} height={photo.height} />{/each}
		</div>{/if}
</div>
<div class="hero-work-controls">
	<a href={`${base}/work`}>Selected Works</a><span class="hero-position" aria-live={paused ? 'polite' : 'off'}>{position} / {count}</span>
	<button disabled={!ready} onclick={() => move(-1)} aria-label="Previous selected work">←</button><button
		disabled={!ready}
		onclick={() => move(1)}
		aria-label="Next selected work">→</button
	>
	<button
		disabled={!ready}
		onclick={() => toggle()}
		data-hero-play
		aria-label={`${paused ? 'Play' : 'Pause'} Selected Works`}
		title={`${paused ? 'Play' : 'Pause'} Selected Works`}
		><svg viewBox="0 0 24 24" aria-hidden="true"
			>{#if paused}<path d="m8 5 11 7-11 7Z" />{:else}<path d="M8 5v14M16 5v14" />{/if}</svg
		></button
	>
</div>

<style>
	.hero-photographs {
		position: absolute;
		inset: 0;
		z-index: -2;
	}
	.hero-track {
		display: flex;
		width: 100%;
		height: 100%;
		overflow-x: auto;
		overflow-y: hidden;
		scroll-snap-type: x mandatory;
		scrollbar-width: none;
		overscroll-behavior-x: contain;
	}
	.hero-track::-webkit-scrollbar {
		display: none;
	}
	.hero-track.mobile {
		display: none;
	}
	.hero-frame {
		flex: 0 0 100%;
		height: 100%;
		scroll-snap-align: start;
		scroll-snap-stop: always;
	}
	.hero-frame img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: 53% 43%;
		user-select: none;
	}
	.hero-frame.triptych {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 3px;
	}
	.hero-frame.triptych img {
		object-position: center;
	}
	.hero-outgoing {
		position: absolute;
		inset: 0;
		z-index: 1;
		pointer-events: none;
	}
	.hero-work-controls {
		position: absolute;
		top: 110px;
		left: 48px;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 8px 6px 14px;
		background: #181818c4;
		border: 1px solid #ffffff65;
		border-radius: 3px;
		font:
			13px Arial,
			Helvetica,
			sans-serif;
	}
	.hero-work-controls > a {
		font-weight: 600;
		color: inherit;
		text-decoration: none;
	}
	.hero-work-controls > a:hover {
		text-decoration: underline;
		text-underline-offset: 5px;
	}
	.hero-position {
		min-width: 36px;
		color: #ddd;
		font-size: 12px;
	}
	.hero-work-controls button {
		display: grid;
		place-items: center;
		min-width: 44px;
		min-height: 44px;
		padding: 8px;
		font-size: 20px;
		border: 1px solid #ffffff80;
		border-radius: 4px;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}
	.hero-work-controls button:hover {
		background: #ffffff20;
	}
	.hero-work-controls svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.5;
	}
	:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 4px;
	}
	.hero-track:focus-visible {
		outline-offset: -4px;
	}
	@media (max-width: 1000px) {
		.hero-work-controls {
			left: 32px;
			top: 105px;
		}
	}
	@media (max-width: 700px) {
		.hero-track.desktop {
			display: none;
		}
		.hero-track.mobile {
			display: flex;
		}
		.hero-frame img {
			object-position: center 40%;
		}
		.hero-work-controls {
			top: 136px;
			left: 20px;
			gap: 8px;
			padding: 5px 6px 5px 12px;
			font-size: 12px;
		}
		.hero-position {
			font-size: 11px;
			min-width: 32px;
		}
	}
	@media (max-width: 350px) {
		.hero-work-controls {
			left: 16px;
			top: 130px;
		}
		.hero-position {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.hero-track {
			scroll-behavior: auto;
		}
	}
</style>
