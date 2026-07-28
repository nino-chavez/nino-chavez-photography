import { PHOTOS_READ } from '$lib/supabase/columns';
import { supabaseServer } from '$lib/supabase/server';
import {
	canonicalPhotoSegment,
	isAddressableSegment,
	type PhotoIdentity
} from '$lib/supabase/photo-address';

// Re-exported for the two route guards that reject stringified nulls before spending a query.
export { NON_KEYS } from '$lib/supabase/photo-address';

/**
 * Resolve a photo from the identifying segment of a `/photo/:id` URL.
 *
 * WHY THIS IS NOT `.eq(image_key).single()`
 *
 * `image_key` is NOT unique. It is the camera's frame name (DSC06939), and DSC numbers reset
 * per card, so the same key recurs across albums — 113 keys are shared by exactly two photos
 * each (measured 2026-07-28 over all 20,655 published rows). `.single()` raises on more than
 * one row, which turns an ordinary duplicate into a 404; that is what 404'd the tag route while
 * the detail route beside it worked.
 *
 * WHY IT ALSO ACCEPTS `cf_image_id`
 *
 * Resolving a collision is not enough, because one of the two photos then has no address at
 * all: both want `/photo/DSC05553`, only one can have it, and the loser is unreachable and
 * unindexable. `cf_image_id` IS unique — 20,655 distinct values over 20,655 rows, never null,
 * and no value collides with a *different* photo's `image_key` — so it is a second, always-safe
 * address. The sitemap emits it for exactly the colliding photos; see sitemap.xml/+server.ts.
 *
 * WHAT `canonicalSegment` IS FOR
 *
 * Two URLs that resolve to two different photos must not declare the same canonical, or search
 * engines fold them back together and the collision is un-fixed. The resolver knows whether the
 * segment was ambiguous, so it returns the segment that uniquely addresses the photo it found:
 * `image_key` in the ordinary case, `cf_image_id` when the key is shared. Callers build their
 * canonical URL from this, never from the raw URL segment.
 *
 * DISAMBIGUATION, in order:
 *   1. an exact `cf_image_id` hit — unique by construction, so nothing else can be meant;
 *   2. the album the link came from (`?a=`) — the photo the visitor actually clicked;
 *   3. a photo from a LISTED album, so an unlisted album never shadows the real one;
 *   4. the lowest `photo_id`. Ordering matters: without it Postgres returns candidates in
 *      physical order, so the same URL could show a different photo between two requests.
 */

const MAX_CANDIDATES = 5;

export interface ResolvedPhoto<T> {
	row: T;
	/**
	 * The URL segment that addresses this photo and no other. Use it to build canonical
	 * URLs — `params.id` is not safe for that, because a shared `image_key` arrives at two
	 * different photos.
	 */
	canonicalSegment: string;
}

export async function resolvePhotoByImageKey<T>(
	segment: string,
	columns: string,
	albumHint?: string | null
): Promise<ResolvedPhoto<T> | null> {
	if (!isAddressableSegment(segment)) return null;

	const { data, error } = await supabaseServer
		.from(PHOTOS_READ)
		.select(columns)
		.or(`image_key.eq.${segment},cf_image_id.eq.${segment}`)
		.order('photo_id', { ascending: true })
		.limit(MAX_CANDIDATES);

	if (error || !data || data.length === 0) return null;

	const rows = data as unknown as PhotoIdentity[];

	// An exact cf_image_id match is unique by construction, so it settles the question before
	// any preference ordering applies.
	const exactCfMatch = rows.find((row) => row.cf_image_id === segment);
	if (exactCfMatch) {
		return finish<T>(exactCfMatch, rows, segment);
	}

	const sharingKey = rows.filter((row) => row.image_key === segment);
	if (sharingKey.length === 1) return finish<T>(sharingKey[0], rows, segment);

	if (albumHint) {
		const exact = sharingKey.find((row) => row.album_key === albumHint);
		if (exact) return finish<T>(exact, rows, segment);
	}

	// Only reached on a genuine collision, so the extra round trip is rare rather than routine.
	const albumKeys = [...new Set(sharingKey.map((row) => row.album_key).filter(Boolean))] as string[];
	const { data: unlisted } = await supabaseServer
		.from('album_settings')
		.select('album_key')
		.eq('visibility', 'unlisted')
		.in('album_key', albumKeys);

	const unlistedSet = new Set((unlisted ?? []).map((a) => a.album_key));
	const chosen = sharingKey.find((row) => row.album_key && !unlistedSet.has(row.album_key)) ?? sharingKey[0];
	return finish<T>(chosen, rows, segment);
}

/** Pair the resolved row with the address that reaches it — see $lib/supabase/photo-address. */
function finish<T>(chosen: PhotoIdentity, rows: PhotoIdentity[], segment: string): ResolvedPhoto<T> {
	return { row: chosen as unknown as T, canonicalSegment: canonicalPhotoSegment(chosen, rows, segment) };
}
