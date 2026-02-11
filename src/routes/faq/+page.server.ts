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
		faqs,
		schema: faqPageSchema
	};
};

