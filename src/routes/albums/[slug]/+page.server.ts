import { base } from '$app/paths';
import { fetchPhotos, getAlbumSettings, fetchAlbumVideos, supabaseServer, matviewClient } from '$lib/supabase/server';
import { extractAlbumKey, createAlbumSlug } from '$lib/utils';
import { getTopPhotos } from '$lib/analytics/popularity';
import { trackArrival, keepTrackingAlive } from '$lib/analytics/tracker';
import { isValidSrcParam } from '$lib/analytics/share';
import { computeSessionHash } from '$lib/analytics/session';
import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { SITE_URL } from '$lib/site-url';

export const load: PageServerLoad = async ({ params, url, setHeaders, request, getClientAddress, platform }) => {
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
		// Get album name + cover image + photo_count from albums_summary (a MATERIALIZED VIEW,
		// anon REVOKE'd — read via service_role; the anon read 42501'd, so the name fell back to
		// the album key and the count to 0). See matviewClient.
		matviewClient()
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

	// Block direct access to unlisted albums (must use share link).
	//
	// The unknown case comes FIRST and fails closed. `getAlbumSettings` used to fold a failed read
	// into the same null this predicate reads as "public", so one broken query published every
	// private album — measured in production for ~2 minutes while a column grant and a partially
	// rolled-out deploy disagreed. 503 rather than 404 because the album may be perfectly public
	// and we simply cannot tell; a 404 would tell a client their real album is gone.
	if (!albumSettings.ok) {
		throw error(503, 'This album is temporarily unavailable.');
	}
	if (albumSettings.settings?.visibility === 'unlisted') {
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
	// `albums_summary` is defined WHERE sharpness IS NOT NULL, so a video-only album has no
	// row in it at all and `albumData.data` is null — the page still exists (ADR 0001 decides
	// existence from base-table photos OR videos), but the name has nowhere to come from and
	// used to fall through to `albumKey`. That rendered the h1, the <title>, the OG
	// description and the OG alt text as an opaque suffix like "p4J2jk" on two live albums.
	// The videos already carry the name — `fetchAlbumVideos` selects `album_name` — so no
	// extra query is needed; the album list resolves the same albums the same way, from
	// `videos_summary`. Skip that function's 'Unknown Album' sentinel, which is its own
	// display fallback and not a real name.
	const videoAlbumName = videos.find(
		(v) => v.album_name && v.album_name !== 'Unknown Album'
	)?.album_name;
	const albumName = album?.album_name || videoAlbumName || albumKey;

	// If URL is using old format (just the key), redirect to new slug format
	const correctSlug = createAlbumSlug(albumName, albumKey);
	if (slug !== correctSlug && slug === albumKey) {
		throw redirect(301, `${base}/albums/${correctSlug}`);
	}

	const baseUrl = SITE_URL;
	const canonicalUrl = `${baseUrl}/albums/${correctSlug}`;
	const sport = album?.primary_sport || videos[0]?.sport_type || 'sports';
	// Same rule as the on-page header and the OG card: a zero count is omitted, never
	// printed. A video-only album previously unfurled as "… — 0 professional sports
	// photos by Nino Chavez", which is both wrong and the first thing a share shows.
	// The sport qualifies the first segment only — "119 professional volleyball photos and
	// 82 videos", not "…volleyball photos and 82 volleyball videos".
	const contents: string[] = [];
	if (totalCount > 0) {
		contents.push(`${totalCount} professional ${sport} photo${totalCount === 1 ? '' : 's'}`);
	}
	if (videos.length > 0) {
		const qualifier = contents.length ? '' : `professional ${sport} `;
		contents.push(`${videos.length} ${qualifier}video${videos.length === 1 ? '' : 's'}`);
	}
	const ogDescription = contents.length
		? `${albumName} — ${contents.join(' and ')} by Nino Chavez`
		: `${albumName} — sports photography by Nino Chavez`;

	// Branded OG card rendered by /albums/[slug]/og.png.
	// Absolute on SITE_URL, NOT `url.origin`. The router refetches from
	// nino-chavez-photography.pages.dev, so inside this app `url.origin` IS the Pages
	// origin — which published every album's share card as
	// https://nino-chavez-photography.pages.dev/... It resolved, so nothing looked
	// broken, but it advertised the internal origin to every crawler and routed them
	// around the edge. The "unfurls on whichever host served the page" rationale was
	// written when the photography.* subdomain still served this app; it now 301s.
	const ogImage = `${SITE_URL}/albums/${correctSlug}/og.png`;

	// "Popular in this album" — top engaged photos from this album (may be empty).
	const popularInAlbum = await getTopPhotos(supabaseServer, {
		albumKey,
		metric: 'trending',
		limit: 12
	});

	// Arrival attribution → popularity engine. Only fires when the incoming link carried
	// a valid ?src= channel (share links minted by $lib/utils/share-url); normal
	// navigation inserts nothing. Non-blocking, mirrors the photo page's fire-and-forget
	// view tracking — never awaited, never allowed to affect the response.
	const src = url.searchParams.get('src');
	if (isValidSrcParam(src)) {
		const userAgent = request.headers.get('user-agent') ?? '';
		keepTrackingAlive(
			platform,
			computeSessionHash(getClientAddress(), userAgent).then(
				(sessionHash) => trackArrival({ albumKey, src, sessionHash, userAgent })
			)
		);
	}

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
