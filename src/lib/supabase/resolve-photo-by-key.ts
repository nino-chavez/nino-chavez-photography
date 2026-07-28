import { PHOTOS_READ } from '$lib/supabase/columns';
import { supabaseServer } from '$lib/supabase/server';

/**
 * Resolve a photo from an `image_key` URL segment.
 *
 * WHY THIS IS NOT `.eq(image_key).single()`
 *
 * `image_key` is NOT unique. It is the camera's frame name (DSC06939), and DSC numbers reset
 * per card, so the same key recurs across albums. `.single()` raises on more than one row,
 * which turns an ordinary duplicate into a 404 — that is what 404'd every photo after a
 * duplicate album was ingested, and it is what produced 404s on the tag route while the detail
 * route beside it worked.
 *
 * Both routes now come through here so the rule has one definition. Whichever route gets
 * written next inherits it instead of rediscovering the collision.
 *
 * DISAMBIGUATION, in order:
 *   1. the album the link came from (`?a=`) — the photo the visitor actually clicked;
 *   2. otherwise a photo from a LISTED album, so an unlisted or duplicate album never shadows
 *      the real one;
 *   3. otherwise the first candidate.
 */

/** Stringified nulls are not image keys. See the callers for why these arrive at all. */
export const NON_KEYS = new Set(['null', 'undefined', 'NaN']);

const MAX_CANDIDATES = 5;

export async function resolvePhotoByImageKey<T>(
	imageKey: string,
	columns: string,
	albumHint?: string | null
): Promise<T | null> {
	const { data: candidates, error } = await supabaseServer
		.from(PHOTOS_READ)
		.select(columns)
		.eq('image_key', imageKey)
		.limit(MAX_CANDIDATES);

	if (error || !candidates || candidates.length === 0) return null;
	if (candidates.length === 1) return candidates[0] as T;

	const rows = candidates as unknown as Array<{ album_key: string }>;

	if (albumHint) {
		const exact = rows.find((row) => row.album_key === albumHint);
		if (exact) return exact as T;
	}

	// Only reached on a genuine collision, so the extra round trip is rare rather than routine.
	const albumKeys = [...new Set(rows.map((row) => row.album_key))];
	const { data: unlisted } = await supabaseServer
		.from('album_settings')
		.select('album_key')
		.eq('visibility', 'unlisted')
		.in('album_key', albumKeys);

	const unlistedSet = new Set((unlisted ?? []).map((a) => a.album_key));
	return (rows.find((row) => !unlistedSet.has(row.album_key)) ?? rows[0]) as T;
}
