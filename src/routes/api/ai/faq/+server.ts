/**
 * AI-Friendly FAQ API
 *
 * Provides auto-generated FAQ content for AI crawlers and answer engines.
 * Supports JSON and JSON-LD (Schema.org FAQPage) formats.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateFAQs } from '$lib/aeo/faq-generator';

const BASE_URL = 'https://ninochavez.co/photography';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const format = url.searchParams.get('format') || 'json';

		// Generate FAQs
		const faqs = await generateFAQs();

		if (format === 'jsonld') {
			// Return JSON-LD FAQPage schema
			const jsonld = {
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

			return json(jsonld, {
				headers: {
					'Content-Type': 'application/ld+json'
				}
			});
		}

		// Return simple JSON format
		return json({
			faqs: faqs
		});
	} catch (error) {
		console.error('[API] Error generating FAQs:', error);
		return json({ error: 'Failed to generate FAQs' }, { status: 500 });
	}
};

