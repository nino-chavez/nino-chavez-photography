/**
 * Head tags for /privacy.
 *
 * This page had no load function at all; its title and description lived in `<svelte:head>`
 * inside +page.svelte, which meant the layout's generic pair rendered first and this one was
 * the copy crawlers ignored. The layout is the single emitter of head tags, so the page's job
 * is to supply the strings, not the markup. Enforced by scripts/check-head-tags.mjs.
 *
 * Static, so it runs at build/prerender time with no server work.
 */
import type { PageLoad } from './$types';

export const load: PageLoad = () => ({
	seo: {
		title: 'Privacy Policy - Nino Chavez Photography',
		description:
			'Privacy policy for ninochavez.co/photography. Learn how we collect and protect athlete data.'
	}
});
