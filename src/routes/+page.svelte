<script lang="ts">
	import { SITE_URL } from '$lib/site-url';
</script>

<svelte:head>
	<title>Photography | Nino Chavez</title>
	<meta name="robots" content="noindex, follow" />
</svelte:head>

<main class="canonical-handoff">
	<p>Opening the Nino Chavez photography landing page.</p>
	<a href={SITE_URL} data-sveltekit-reload>Continue to photography</a>
</main>

<style>
	.canonical-handoff {
		display: grid;
		min-height: 60vh;
		padding: 2rem;
		place-content: center;
		text-align: center;
	}

	.canonical-handoff p {
		margin: 0 0 1rem;
	}

	.canonical-handoff a {
		color: inherit;
		font-weight: 700;
	}
</style>
