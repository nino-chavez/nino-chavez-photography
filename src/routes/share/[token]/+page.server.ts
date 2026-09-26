import { getAlbumByShareToken, fetchPhotos, getPhotoCount, ALBUM_PHOTO_SORT } from '$lib/supabase/server';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { ALBUM_PHOTO_PAGE_SIZE } from '$lib/albums/pagination';
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

	// Share targets are typically UNLISTED albums, whose photo_metadata rows are gated from the anon
	// client by RLS. Read them with the service_role client — the share token is the access boundary.
	const admin = createSupabaseAdminClient();

	// Pagination. Must stay in step with ALBUM_PHOTO_PAGE_SIZE elsewhere (the public album
	// page's SSR page, /api/album-photos' page mode, and this page's own client-side
	// "continue past this page" fetch below) — the lightbox's accumulated list is only
	// contiguous if every page-N fetch, from any of these three call sites, uses the same size.
	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
	const pageSize = ALBUM_PHOTO_PAGE_SIZE;
	const offset = (page - 1) * pageSize;

	// Fetch album metadata, photos, and count in parallel
	const [albumData, photos, totalCount] = await Promise.all([
		admin
			.from('albums_summary')
			.select('album_name')
			.eq('album_key', albumKey)
			.single(),
		fetchPhotos(
			{
				albumKey,
				sortBy: ALBUM_PHOTO_SORT,
				limit: pageSize,
				offset,
			},
			admin
		),
		getPhotoCount({ albumKey }, admin)
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
		// `data.seo` supplies the description only. The TITLE stays in the page's own
		// <svelte:head> deliberately: the layout feeds `seo.title` straight into `og:title`, so
		// routing it through here would put a private album's name — "<Family> Portraits" — into
		// the preview card every chat app builds when a client pastes their link. The <title>
		// serves the person who already holds the token (tab, bookmark, history); og:title
		// serves everyone else in the thread. They should not be the same string here.
		//
		// The description had no such nuance and was simply wrong: with no `seo` at all, every
		// private gallery inherited the site default — "MOTION. EMOTION. Frame by Frame …
		// volleyball, basketball, softball" — as the description of a family portrait session.
		//
		// No `canonical`: the layout suppresses all three URL tags on this route. See
		// canPublishRouteUrl in $lib/routes.
		seo: {
			description: 'A private album shared by Nino Chavez Photography.'
		}
	};
};
