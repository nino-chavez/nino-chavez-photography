import { base } from '$app/paths';
import { fetchPhotos, getAlbumSettings, fetchAlbumVideos, supabaseServer } from '$lib/supabase/server';
import { extractAlbumKey, createAlbumSlug } from '$lib/utils';
import { getTopPhotos } from '$lib/analytics/popularity';
import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, url, setHeaders }) => {
	// Always fresh: album content changes (new/re-tagged photos & videos, settings)
	// must show immediately. stale-while-revalidate was serving ~15-min-stale pages.
	setHeaders({ 'cache-control': 'no-cache' });

	const { slug } = params;

	// Extract the album key from the slug (handles both new and legacy URLs)
	const albumKey = extractAlbumKey(slug);

	// Only the first page is server-rendered (SEO/LCP); the client appends the
	// rest via "Load more" against /api/album-photos, which uses the same size.
	const pageSize = 48;

	// Fetch album info, photos, videos, and settings in parallel.
	// Total count comes from albums_summary.photo_count (already selected below) — not a
	// separate count(exact) over the base table (ADR 0001). Same semantics: the MV is defined
	// WHERE sharpness IS NOT NULL, matching getPhotoCount's filter.
	const [albumData, photos, videos, albumSettings] = await Promise.all([
		// Get album name + cover image + photo_count from albums_summary view
		supabaseServer
			.from('albums_summary')
			.select('album_name, cover_cf_image_id, cover_image_url, primary_sport, photo_count')
			.eq('album_key', albumKey)
			.single(),
		// Get the first page of photos for this album
		fetchPhotos({
			albumKey,
			sortBy: 'newest',
			limit: pageSize,
			offset: 0,
		}),
		// Get videos for this album (CF Stream)
		fetchAlbumVideos(albumKey),
		// Check if album is unlisted
		getAlbumSettings(albumKey)
	]);

	const totalCount = albumData.data?.photo_count ?? 0;

	// Block direct access to unlisted albums (must use share link)
	if (albumSettings?.visibility === 'unlisted') {
		throw error(404, 'Album not found');
	}

	// Existence is decided by the base-table page-1 photos (already fetched above), NOT by the
	// MV count — so a missing/stale albums_summary row can't make a real album 404 (ADR 0001).
	// The MV photo_count stays as the display/pagination total; it's an optimization, not a
	// correctness dependency.
	if (photos.length === 0 && totalCount === 0 && videos.length === 0) {
		throw error(404, 'Album not found or contains no content');
	}

	const album = albumData.data;
	const albumName = album?.album_name || albumKey;

	// If URL is using old format (just the key), redirect to new slug format
	const correctSlug = createAlbumSlug(albumName, albumKey);
	if (slug !== correctSlug && slug === albumKey) {
		throw redirect(301, `${base}/albums/${correctSlug}`);
	}

	const baseUrl = 'https://photography.ninochavez.co';
	const canonicalUrl = `${baseUrl}/albums/${correctSlug}`;
	const sport = album?.primary_sport || 'sports';
	const ogDescription = `${albumName} — ${totalCount} professional ${sport} photos by Nino Chavez`;

	// Branded OG card rendered by /albums/[slug]/og.png. Built from the request
	// origin (+ base path) so it unfurls on whichever host served the page
	// (apex /photography and the photography.* subdomain both serve this app).
	const ogImage = `${url.origin}${base}/albums/${correctSlug}/og.png`;

	// "Popular in this album" — top engaged photos from this album (may be empty).
	const popularInAlbum = await getTopPhotos(supabaseServer, {
		albumKey,
		metric: 'trending',
		limit: 12
	});

	return {
		albumKey,
		albumName,
		slug: correctSlug,
		photos,
		videos,
		totalCount,
		popularInAlbum,
		seo: {
			title: `${albumName} | Nino Chavez Photography`,
			description: ogDescription,
			canonical: canonicalUrl,
			ogImage,
			ogImageAlt: albumName,
			ogImageWidth: 1200,
			ogImageHeight: 630
		}
	};
};
