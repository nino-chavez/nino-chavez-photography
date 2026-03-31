import { base } from '$app/paths';
import { fetchPhotos, getPhotoCount, getAlbumSettings, fetchAlbumVideos, supabaseServer } from '$lib/supabase/server';
import { extractAlbumKey, createAlbumSlug } from '$lib/utils';
import { cfImageUrl, hasCFImage } from '$lib/utils/cloudflare-images';
import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, url, setHeaders }) => {
	setHeaders({ 'cache-control': 's-maxage=300, stale-while-revalidate=600' });

	const { slug } = params;

	// Extract the album key from the slug (handles both new and legacy URLs)
	const albumKey = extractAlbumKey(slug);

	// Pagination params from URL
	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
	const pageSize = 48; // Larger page size for album views
	const offset = (page - 1) * pageSize;

	// Fetch album info, photos, count, videos, and settings in parallel
	const [albumData, photos, totalCount, videos, albumSettings] = await Promise.all([
		// Get album name + cover image from albums_summary view
		supabaseServer
			.from('albums_summary')
			.select('album_name, cover_cf_image_id, cover_image_url, primary_sport, photo_count')
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
		getPhotoCount({ albumKey }),
		// Get videos for this album (CF Stream)
		fetchAlbumVideos(albumKey),
		// Check if album is unlisted
		getAlbumSettings(albumKey)
	]);

	// Block direct access to unlisted albums (must use share link)
	if (albumSettings?.visibility === 'unlisted') {
		throw error(404, 'Album not found');
	}

	if (totalCount === 0 && videos.length === 0) {
		throw error(404, 'Album not found or contains no content');
	}

	const album = albumData.data;
	const albumName = album?.album_name || albumKey;

	// If URL is using old format (just the key), redirect to new slug format
	const correctSlug = createAlbumSlug(albumName, albumKey);
	if (slug !== correctSlug && slug === albumKey) {
		const pageParam = page > 1 ? `?page=${page}` : '';
		throw redirect(301, `${base}/albums/${correctSlug}${pageParam}`);
	}

	// Build OG image URL from cover photo
	const coverImageUrl = hasCFImage(album?.cover_cf_image_id)
		? cfImageUrl(album.cover_cf_image_id, 'large')
		: album?.cover_image_url || null;

	const baseUrl = 'https://photography.ninochavez.co';
	const canonicalUrl = `${baseUrl}/albums/${correctSlug}`;
	const sport = album?.primary_sport || 'sports';
	const ogDescription = `${albumName} — ${totalCount} professional ${sport} photos by Nino Chavez`;

	return {
		albumKey,
		albumName,
		slug: correctSlug,
		photos,
		videos,
		totalCount,
		currentPage: page,
		pageSize,
		seo: {
			title: `${albumName} | Nino Chavez Photography`,
			description: ogDescription,
			canonical: canonicalUrl,
			ogImage: coverImageUrl
		}
	};
};
