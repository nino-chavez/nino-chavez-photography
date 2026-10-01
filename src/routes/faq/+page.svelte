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


<div class="faq-page">
	<header class="faq-opening">
		<p class="faq-eyebrow">Gallery help</p>
		<h1>Frequently asked questions</h1>
		<p>Find practical answers about browsing, saving, sharing, and downloading photographs.</p>
	</header>

	<!-- Search and Filter -->
	<section class="faq-tools" aria-label="Find an answer">
		<!-- Search Bar -->
		<div class="faq-search">
			<label for="faq-search">Search questions</label>
			<input
				id="faq-search"
				type="search"
				bind:value={searchQuery}
				placeholder="Try downloads, saved photos, or sharing"
			/>
		</div>

		<!-- Category Filter -->
		<div class="faq-categories" aria-label="Question categories">
			<button
				onclick={() => (selectedCategory = null)}
				class:active={selectedCategory === null}
			>
				All
			</button>
			{#each categories as category}
				<button
					onclick={() => (selectedCategory = category)}
					class:active={selectedCategory === category}
				>
					{category.replace('-', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
				</button>
			{/each}
		</div>
	</section>

	<!-- FAQ List -->
	<div class="faq-list">
		{#if filteredFAQs.length === 0}
			<div class="faq-empty">
				<p>No FAQs match your search criteria.</p>
			</div>
		{:else}
			{#each filteredFAQs as faq (faq.question)}
				<article>
					<p class="faq-category">
							{faq.category.replace('-', ' ')}
					</p>
					<h2>{faq.question}</h2>
					<p class="faq-answer">{faq.answer}</p>
				</article>
			{/each}
		{/if}
	</div>

	<!-- Results Count -->
	{#if searchQuery || selectedCategory}
		<div class="faq-results-count" aria-live="polite">
			Showing {filteredFAQs.length} of {faqs.length} FAQs
		</div>
	{/if}
</div>

<style>
	.faq-page { width: min(920px, calc(100% - 64px)); margin-inline: auto; padding-block: 40px 72px; color: var(--color-charcoal-50); }
	.faq-opening { max-width: 720px; padding-bottom: 28px; }
	.faq-eyebrow { margin-bottom: 14px; color: var(--color-gold-500); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
	.faq-opening h1 { margin: 0; font-family: Montserrat, sans-serif; font-size: clamp(32px, 4vw, 46px); font-weight: 750; line-height: 1.08; letter-spacing: -.035em; }
	.faq-opening > p:last-child { margin-top: 12px; color: var(--color-charcoal-300); font-size: 16px; line-height: 1.55; }
	.faq-tools { padding-block: 18px; border-block: 1px solid var(--color-charcoal-800); }
	.faq-search label { display: block; margin-bottom: 8px; font-size: 14px; font-weight: 650; }
	.faq-search input { width: 100%; min-height: 44px; padding: 10px 14px; border: 1px solid var(--color-charcoal-700); border-radius: 0; background: var(--color-charcoal-950); color: var(--color-charcoal-50); font-size: 16px; }
	.faq-categories { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
	.faq-categories button { min-height: 44px; padding: 9px 13px; border: 1px solid var(--color-charcoal-700); border-radius: 0; color: var(--color-charcoal-300); text-transform: capitalize; }
	.faq-categories button.active { border-color: var(--color-gold-500); color: var(--color-gold-400); }
	.faq-search input:focus-visible, .faq-categories button:focus-visible { outline: 2px solid var(--color-gold-500); outline-offset: 3px; }
	.faq-list article { padding-block: 26px; border-bottom: 1px solid var(--color-charcoal-800); }
	.faq-category { margin-bottom: 9px; color: var(--color-gold-400); font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
	.faq-list h2 { font-family: Montserrat, sans-serif; font-size: 20px; font-weight: 700; line-height: 1.3; }
	.faq-answer { margin-top: 10px; color: var(--color-charcoal-300); line-height: 1.7; }
	.faq-empty { padding-block: 56px; color: var(--color-charcoal-400); text-align: center; }
	.faq-results-count { margin-top: 18px; color: var(--color-charcoal-400); font-size: 13px; }
	@media (max-width: 640px) { .faq-page { width: calc(100% - 40px); padding-block: 24px 56px; } }
</style>
