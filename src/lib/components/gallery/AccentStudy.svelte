<script lang="ts">
	import { onMount } from 'svelte';

	// Review-only bridge. Public hosts retain the approved graphite/silver palette.
	onMount(() => {
		if (window.location.hostname !== 'photo-accent.localhost') return;
		const reviewOrigin = 'http://photo-accent.localhost:8840';
		const key = 'photography-accent-study';
		const root = document.documentElement;
		const compositionKey = 'photography-composition-study';
		const isComposition = (value: unknown): value is 'before' | 'refined' => value === 'before' || value === 'refined';
		let storedComposition: string | null = null;
		try { storedComposition = sessionStorage.getItem(compositionKey); } catch { /* In-memory preview still works. */ }
		const requestedComposition = new URLSearchParams(window.location.search).get('study-composition');
		let composition = isComposition(requestedComposition) ? requestedComposition : isComposition(storedComposition) ? storedComposition : 'before';
		const isAccent = (value: unknown): value is 'warm' | 'cool' | 'gold' => value === 'warm' || value === 'cool' || value === 'gold';
		let stored: string | null = null;
		try { stored = sessionStorage.getItem(key); } catch { /* Preview still works without storage. */ }
		const requested = new URLSearchParams(window.location.search).get('study-accent');
		let accent = isAccent(requested) ? requested : isAccent(stored) ? stored : 'cool';
		function apply(value: 'warm' | 'cool' | 'gold') {
			accent = value;
			root.dataset.photographyAccent = value;
			try { sessionStorage.setItem(key, value); } catch { /* In-memory selection is sufficient. */ }
			if (window.parent !== window) window.parent.postMessage({ type: 'photography-study-ready', accent: value, composition }, reviewOrigin);
		}
		function applyComposition(value: 'before' | 'refined') {
			composition = value;
			root.dataset.photographyComposition = value;
			try { sessionStorage.setItem(compositionKey, value); } catch { /* In-memory preview still works. */ }
			apply(accent);
		}
		function receive(event: MessageEvent) {
			if (event.origin !== reviewOrigin || event.source !== window.parent) return;
			if (event.data?.type === 'photography-study-accent' && isAccent(event.data.accent)) apply(event.data.accent);
			if (event.data?.type === 'photography-study-composition' && isComposition(event.data.composition)) applyComposition(event.data.composition);
		}
		applyComposition(composition);
		window.addEventListener('message', receive);
		return () => {
			window.removeEventListener('message', receive);
			delete root.dataset.photographyAccent;
			delete root.dataset.photographyComposition;
		};
	});
</script>
