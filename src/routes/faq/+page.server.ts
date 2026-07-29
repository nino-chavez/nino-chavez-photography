/**
 * FAQ Page - Server-Side Data Loading
 *
 * Loads auto-generated FAQ content and provides Schema.org structured data.
 */

import type { PageServerLoad } from './$types';
import { generateFAQs } from '$lib/aeo/faq-generator';

export const load: PageServerLoad = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': 's-maxage=3600, stale-while-revalidate=7200' });

	// Generate FAQs
	const faqs = await generateFAQs();

	// Create FAQPage Schema.org JSON-LD
	const faqPageSchema = {
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: faqs.map((faq) => ({
			'@type': 'Question',
			name: faq.question,
			acceptedAnswer: {
				'@type': 'Answer',
				text: faq.answer
			}
		}))
	};

	return {
		// Head tags belong to the loader, never to +page.svelte — the layout is the single
		// emitter, and a page that also emits them ships a duplicate that renders SECOND.
		// "AI enrichment" was in the shadowed original. reader-contract.json's gallery-interface
		// surface denies internal processing language ("enrichment pipeline" → "photo details"),
		// and this string is about to become a real search snippet for the first time.
		seo: {
			title: 'FAQ | Nino Chavez Photography',
			description:
				'Frequently asked questions about the Nino Chavez Photography gallery — what is in it, how to search it, how albums work, and how photo details are written.'
		},
		faqs,
		schema: faqPageSchema
	};
};

