import { json } from '@sveltejs/kit';
import { fetchAlbumPhotosForDownload, fetchPhotos, getPhotoCount } from '$lib/supabase/server';
import type { RequestHandler } from './$types';

const PAGE_SIZE = 48;

// GET /api/album-photos?albumKey=...
//
// Two modes, keyed off the `page` param:
//
// 1. No `page` (legacy): returns the full download manifest
//    (cf_image_id + image_key only) consumed by BulkDownloadButton.
//
// 2. With `page`: returns a single page of full Photo rows plus totalCount,
//    so the album lightbox can load the next page client-side and keep
//    navigating across page boundaries. Sort order MUST match the album
//    page load (sortBy: 'newest') so the accumulated list stays contiguous.
export const GET: RequestHandler = async ({ url }) => {
	const albumKey = url.searchParams.get('albumKey');

	if (!albumKey) {
		return json({ error: 'Missing albumKey' }, { status: 400 });
	}

	const pageParam = url.searchParams.get('page');

	// Legacy download-manifest mode — preserve existing behavior exactly.
	if (pageParam === null) {
		const photos = await fetchAlbumPhotosForDownload(albumKey);
		return json({ photos });
	}

	// Paginated mode for cross-page lightbox navigation.
	const page = Math.max(1, parseInt(pageParam || '1'));

	const [photos, totalCount] = await Promise.all([
		fetchPhotos({
			albumKey,
			sortBy: 'newest',
			limit: PAGE_SIZE,
			offset: (page - 1) * PAGE_SIZE
		}),
		getPhotoCount({ albumKey })
	]);

	return json({ photos, totalCount, page });
};
