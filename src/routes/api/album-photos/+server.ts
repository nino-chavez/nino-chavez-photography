import { json } from '@sveltejs/kit';
import { fetchAlbumPhotosForDownload } from '$lib/supabase/server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const albumKey = url.searchParams.get('albumKey');

	if (!albumKey) {
		return json({ error: 'Missing albumKey parameter' }, { status: 400 });
	}

	const photos = await fetchAlbumPhotosForDownload(albumKey);

	return json({ photos });
};
