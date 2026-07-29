import { fetchPhotos } from '$lib/supabase/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Fetch one top-quality photo for the visual section
	const photos = await fetchPhotos({ limit: 1, sortBy: 'quality' });
	const featuredPhoto = photos[0] || null;

	return {
		// Head tags belong to the loader, never to +page.svelte — the layout is the single
		// emitter, and a page that also emits them ships a duplicate that renders SECOND.
		// Also the source for the ProfilePage schema's `description` in +page.svelte, so the
		// structured data and the meta description cannot drift apart.
		seo: {
			title: 'About - Nino Chavez Photography',
			description:
				"Nino Chavez is a sports photographer who started courtside at his kid's volleyball games and never left. Thousands of matches later, every frame still matters."
		},
		featuredPhoto
	};
};
