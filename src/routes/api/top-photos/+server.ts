import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabase/server';
import { getTopPhotos, type PopularityMetric } from '$lib/analytics/popularity';
import { photoPageTitle } from '$lib/seo/photo-title';

// GET /api/top-photos?metric=trending|all_time&limit=10[&albumKey=...]
//
// Public, anon-readable feed of the most-engaged photos (reads the popularity
// matview; unlisted albums are already excluded by getTopPhotos). Powers the
// social drip's "top shots to post" carousel and any other consumer that wants
// the gallery's standout frames. Mirrors the no-DB-creds contract of
// /api/album-photos so external tooling can fetch it directly.
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const metricParam = url.searchParams.get('metric');
	const metric: PopularityMetric = metricParam === 'all_time' ? 'all_time' : 'trending';
	const albumKey = url.searchParams.get('albumKey') ?? undefined;
	const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 12));

	const photos = await getTopPhotos(supabaseServer, { metric, albumKey, limit });

	// Cache at the edge for 10 min — matches the popularity matview refresh cadence.
	setHeaders({ 'cache-control': 's-maxage=600, stale-while-revalidate=1200' });

	return json({
		metric,
		albumKey: albumKey ?? null,
		count: photos.length,
		photos: photos.map((p) => ({
			id: p.id,
			image_key: p.image_key,
			album_key: p.album_key ?? null,
			album_name: p.album_name ?? null,
			cf_image_id: p.cf_image_id ?? null,
			// `title` was `Photo.title`, which transformPhotoRow sets to `image_key` — so this feed
			// published `"title": "DSC07313"` to the social drip's carousel, a camera filename where
			// a caption belonged, duplicating the `image_key` field two lines up. Composed the same
			// way as the photo page's <title> and /api/ai/photos. `album_name` is exposed alongside
			// so a consumer can name the event without re-splitting this string.
			title: photoPageTitle(p.album_name ?? null, p.caption ?? null),
			caption: p.caption
		}))
	});
};
