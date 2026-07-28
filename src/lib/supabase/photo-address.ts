/**
 * Which identifier addresses a photo in a URL.
 *
 * Pure — no Supabase, no `$env` — so it can be run under `tsx --test`. The query that feeds it
 * lives in `resolve-photo-by-key.ts`, and the sitemap applies the same rule in bulk.
 *
 * THE PROBLEM IN ONE LINE: `image_key` is the camera's frame name, DSC numbers reset per card,
 * and 113 of them are shared by two photos in different albums (measured over all 20,655
 * published rows, 2026-07-28). So `/photo/DSC05553` names two photos, and only one can have it.
 *
 * `cf_image_id` is the escape hatch: 20,655 distinct values over 20,655 rows, never null, and
 * no value ever collides with a *different* photo's `image_key` — so the two identifier spaces
 * can share one URL segment without ambiguity.
 *
 * THE RULE: prefer `image_key`, because that is what every already-indexed URL uses and what
 * the sitemap emits for the 20,542 keys that name exactly one photo. Fall back to `cf_image_id`
 * only where the key is shared. Changing all 20,655 URLs to `cf_image_id` would also be
 * unambiguous, and would throw away the existing index for the 99.5% of photos that were never
 * broken.
 */

/** Stringified nulls are not identifiers — they are a caller that interpolated a missing value. */
export const NON_KEYS = new Set(['null', 'undefined', 'NaN']);

/**
 * Camera frame names and Cloudflare image ids use only this alphabet. The check doubles as the
 * guard that keeps a URL segment out of PostgREST's `or()` filter grammar, where a comma or a
 * parenthesis would be read as syntax rather than as a value.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export function isAddressableSegment(segment: string | null | undefined): boolean {
	return !!segment && !NON_KEYS.has(segment) && SAFE_SEGMENT.test(segment);
}

export interface PhotoIdentity {
	photo_id: string;
	image_key: string;
	cf_image_id: string | null;
	album_key: string | null;
}

/**
 * The segment that addresses `chosen` and no other photo.
 *
 * @param chosen     the photo that was resolved
 * @param candidates every row the lookup returned — used to detect a shared `image_key`
 * @param segment    the URL segment the visitor arrived on
 */
export function canonicalPhotoSegment(
	chosen: PhotoIdentity,
	candidates: PhotoIdentity[],
	segment: string
): string {
	const keyIsShared = candidates.filter((row) => row.image_key === chosen.image_key).length > 1;
	// Arriving on a cf_image_id that differs from the image_key means the sitemap sent us here
	// precisely because the key was contested; keep the visitor on that address.
	const arrivedByCfId = chosen.cf_image_id === segment && chosen.image_key !== segment;
	if ((keyIsShared || arrivedByCfId) && chosen.cf_image_id) return chosen.cf_image_id;
	return chosen.image_key;
}

/**
 * Bulk form for the sitemap: the address for every photo, given the whole set.
 *
 * Returns a Map keyed by `photo_id` so callers keep their own row objects.
 */
export function photoAddresses(rows: PhotoIdentity[]): Map<string, string> {
	const keyCounts = new Map<string, number>();
	for (const row of rows) {
		keyCounts.set(row.image_key, (keyCounts.get(row.image_key) ?? 0) + 1);
	}
	const out = new Map<string, string>();
	for (const row of rows) {
		const shared = (keyCounts.get(row.image_key) ?? 0) > 1;
		out.set(row.photo_id, shared && row.cf_image_id ? row.cf_image_id : row.image_key);
	}
	return out;
}
