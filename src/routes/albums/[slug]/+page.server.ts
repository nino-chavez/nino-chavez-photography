import { fetchPhotos, getPhotoCount, supabaseServer } from '$lib/supabase/server';
import { extractAlbumKey, createAlbumSlug } from '$lib/utils';
import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, url }) => {
	const { slug } = params;

	// Extract the album key from the slug (handles both new and legacy URLs)
	const albumKey = extractAlbumKey(slug);

	// Pagination params from URL
	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
	const pageSize = 48; // Larger page size for album views
	const offset = (page - 1) * pageSize;

	// Fetch album info, photos, and count in parallel
	const [albumData, photos, totalCount] = await Promise.all([
		// Get album name from albums_summary view
		supabaseServer
			.from('albums_summary')
			.select('album_name')
			.eq('album_key', albumKey)
			.single(),
		// Get paginated photos for this album
		fetchPhotos({
			albumKey,
			sortBy: 'newest',
			limit: pageSize,
			offset,
		}),
		// Get total count for pagination
		getPhotoCount({ albumKey })
	]);

	if (totalCount === 0) {
		throw error(404, 'Album not found or contains no enriched photos');
	}

	const albumName = albumData.data?.album_name || albumKey;

	// If URL is using old format (just the key), redirect to new slug format
	const correctSlug = createAlbumSlug(albumName, albumKey);
	if (slug !== correctSlug && slug === albumKey) {
		const pageParam = page > 1 ? `?page=${page}` : '';
		throw redirect(301, `/albums/${correctSlug}${pageParam}`);
	}

	return {
		albumKey,
		albumName,
		slug: correctSlug,
		photos,
		totalCount,
		currentPage: page,
		pageSize
	};
};
