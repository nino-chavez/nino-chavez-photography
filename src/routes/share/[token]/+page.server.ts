import { getAlbumByShareToken, fetchPhotos, getPhotoCount, supabaseServer } from '$lib/supabase/server';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async ({ params, url }) => {
	const { token } = params;

	// Validate UUID format before hitting DB
	if (!UUID_REGEX.test(token)) {
		throw error(404, 'Album not found');
	}

	// Look up album by share token
	const albumSettings = await getAlbumByShareToken(token);
	if (!albumSettings) {
		throw error(404, 'Album not found');
	}

	const albumKey = albumSettings.album_key;

	// Pagination
	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
	const pageSize = 48;
	const offset = (page - 1) * pageSize;

	// Fetch album metadata, photos, and count in parallel
	const [albumData, photos, totalCount] = await Promise.all([
		supabaseServer
			.from('albums_summary')
			.select('album_name')
			.eq('album_key', albumKey)
			.single(),
		fetchPhotos({
			albumKey,
			sortBy: 'newest',
			limit: pageSize,
			offset,
		}),
		getPhotoCount({ albumKey })
	]);

	if (totalCount === 0) {
		throw error(404, 'Album not found');
	}

	const albumName = albumData.data?.album_name || albumKey;

	return {
		albumKey,
		albumName,
		photos,
		totalCount,
		currentPage: page,
		pageSize,
		shareToken: token
	};
};
