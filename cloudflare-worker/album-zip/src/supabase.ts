import type { AlbumPhoto } from './types';

/**
 * Lightweight Supabase REST client for Workers.
 * Fetches the album photo list without the full @supabase/supabase-js SDK.
 */
export async function fetchAlbumPhotos(
	supabaseUrl: string,
	serviceRoleKey: string,
	albumKey: string
): Promise<AlbumPhoto[]> {
	const params = new URLSearchParams({
		select: 'cf_image_id,image_key',
		album_key: `eq.${albumKey}`,
		sharpness: 'not.is.null',
		cf_image_id: 'not.is.null'
	});

	const url = `${supabaseUrl}/rest/v1/photo_metadata?${params}`;

	const response = await fetch(url, {
		headers: {
			apikey: serviceRoleKey,
			Authorization: `Bearer ${serviceRoleKey}`,
			Accept: 'application/json'
		}
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Supabase query failed (${response.status}): ${text}`);
	}

	return (await response.json()) as AlbumPhoto[];
}
