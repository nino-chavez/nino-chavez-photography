<script lang="ts">
	import { onMount } from 'svelte';

	// Review-only bridge. Public hosts retain the approved graphite/silver palette.
	onMount(() => {
		if (window.location.hostname !== 'photo-accent.localhost') return;
		const reviewOrigin = 'http://photo-accent.localhost:8840';
		const key = 'photography-accent-study';
		const root = document.documentElement;
		const isAccent = (value: unknown): value is 'warm' | 'cool' => value === 'warm' || value === 'cool';
		let stored: string | null = null;
		try { stored = sessionStorage.getItem(key); } catch { /* Preview still works without storage. */ }
		const requested = new URLSearchParams(window.location.search).get('study-accent');
		let accent = isAccent(requested) ? requested : isAccent(stored) ? stored : 'warm';
		function apply(value: 'warm' | 'cool') {
			accent = value;
			root.dataset.photographyAccent = value;
			try { sessionStorage.setItem(key, value); } catch { /* In-memory selection is sufficient. */ }
			if (window.parent !== window) window.parent.postMessage({ type: 'photography-study-ready', accent: value }, reviewOrigin);
		}
		function receive(event: MessageEvent) {
			if (event.origin !== reviewOrigin || event.source !== window.parent) return;
			if (event.data?.type === 'photography-study-accent' && isAccent(event.data.accent)) apply(event.data.accent);
		}
		apply(accent);
		window.addEventListener('message', receive);
		return () => {
			window.removeEventListener('message', receive);
			delete root.dataset.photographyAccent;
		};
	});
</script>
