<!--
  FAQ Page - Auto-generated FAQ content with Schema.org markup

  Features:
  - Auto-generated FAQs from gallery statistics
  - FAQPage Schema.org structured data
  - Searchable/filterable FAQ list
  - Category-based organization
-->

<script lang="ts">
	import type { PageData } from './$types';
	import { page } from '$app/stores';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let faqs = $derived(data.faqs);
	let schema = $derived(data.schema);

	// Search state
	let searchQuery = $state('');
	let selectedCategory = $state<string | null>(null);

	// Filter FAQs based on search and category
	let filteredFAQs = $derived(
		faqs.filter((faq) => {
			const matchesSearch =
				searchQuery === '' ||
				faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
				faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
			const matchesCategory = selectedCategory === null || faq.category === selectedCategory;
			return matchesSearch && matchesCategory;
		})
	);

	// Get unique categories
	let categories = $derived(Array.from(new Set(faqs.map((f) => f.category))));

	// Inject Schema.org JSON-LD
	$effect(() => {
		const script = document.createElement('script');
		script.type = 'application/ld+json';
		script.textContent = JSON.stringify(schema);
		document.head.appendChild(script);

		return () => {
			document.head.removeChild(script);
		};
	});
</script>

<svelte:head>
	<title>FAQ | Nino Chavez Photography</title>
	<meta
		name="description"
		content="Frequently asked questions about the Nino Chavez Photography gallery, including information about photos, albums, search features, and AI enrichment."
	/>
</svelte:head>

<div class="container mx-auto px-4 py-16 max-w-4xl">
	<header class="mb-12 text-center">
		<h1 class="text-4xl font-bold mb-4">Frequently Asked Questions</h1>
		<p class="text-lg text-gray-600">
			Find answers to common questions about the gallery, photos, and features.
		</p>
	</header>

	<!-- Search and Filter -->
	<div class="mb-8 space-y-4">
		<!-- Search Bar -->
		<div class="relative">
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search FAQs..."
				class="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
			/>
			<svg
				class="absolute left-3 top-3.5 w-5 h-5 text-gray-400"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
				/>
			</svg>
		</div>

		<!-- Category Filter -->
		<div class="flex flex-wrap gap-2">
			<button
				onclick={() => (selectedCategory = null)}
				class="px-4 py-2 rounded-lg border transition-colors {selectedCategory === null
					? 'bg-blue-500 text-white border-blue-500'
					: 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'}"
			>
				All
			</button>
			{#each categories as category}
				<button
					onclick={() => (selectedCategory = category)}
					class="px-4 py-2 rounded-lg border transition-colors {selectedCategory === category
						? 'bg-blue-500 text-white border-blue-500'
						: 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'}"
				>
					{category.replace('-', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
				</button>
			{/each}
		</div>
	</div>

	<!-- FAQ List -->
	<div class="space-y-6">
		{#if filteredFAQs.length === 0}
			<div class="text-center py-12 text-gray-500">
				<p>No FAQs match your search criteria.</p>
			</div>
		{:else}
			{#each filteredFAQs as faq (faq.question)}
				<article class="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
					<h2 class="text-xl font-semibold mb-3 text-gray-900">{faq.question}</h2>
					<p class="text-gray-700 leading-relaxed">{faq.answer}</p>
					<div class="mt-3">
						<span
							class="inline-block px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600"
						>
							{faq.category.replace('-', ' ')}
						</span>
					</div>
				</article>
			{/each}
		{/if}
	</div>

	<!-- Results Count -->
	{#if searchQuery || selectedCategory}
		<div class="mt-8 text-center text-sm text-gray-500">
			Showing {filteredFAQs.length} of {faqs.length} FAQs
		</div>
	{/if}
</div>

<style>
	/* Additional styles if needed */
</style>

