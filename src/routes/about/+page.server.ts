import { fetchPhotos } from '$lib/supabase/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Fetch one top-quality photo for the visual section
	const photos = await fetchPhotos({ limit: 1, sortBy: 'quality' });
	const featuredPhoto = photos[0] || null;

	return { featuredPhoto };
};
