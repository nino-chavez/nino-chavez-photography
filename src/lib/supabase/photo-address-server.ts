/**
 * Server-side companion to photo-address.ts.
 *
 * `photoAddresses()` decides whether a photo needs its cf_image_id by counting how many rows in
 * the set share its image_key — which is only correct when the set is complete. The sitemap
 * passes all 20,655 rows, so it is. An API page of 50 photos is not: 113 image_keys are shared
 * across the gallery, and both halves of a collision almost never land on the same page, so a
 * page-local count would report "unique" and publish a URL that resolves to the OTHER photo.
 *
 * This closes that gap with one bounded query: fetch every photo sharing an image_key with the
 * page, then hand that superset to the pure function.
 */

import { supabaseServer } from './server';
import { PHOTOS_READ } from './columns';
import type { PhotoIdentity } from './photo-address';

export interface PhotoIdentityRow extends PhotoIdentity {
	album_name: string | null;
}

/**
 * Every photo sharing an image_key with one of `rows`, including `rows` themselves.
 *
 * Read through the anon client, the same one the sitemap uses, so both surfaces publish the
 * same address for the same photo. Returns the input rows unchanged if the lookup fails —
 * callers get page-local addressing rather than no addressing.
 *
 * Deliberately unbounded: this is the one query in the file that MUST NOT truncate, since a
 * missing peer row reads as "key is unique" and reintroduces the wrong-photo URL. It is safe
 * because callers cap their page at 100 photos and collisions are pairs — ~200 rows against
 * PostgREST's 1000-row default. If a caller ever raises that cap past ~400, page this query.
 */
export async function photoIdentityPeers(
	rows: ReadonlyArray<PhotoIdentityRow>
): Promise<PhotoIdentityRow[]> {
	const keys = [...new Set(rows.map((row) => row.image_key).filter(Boolean))];
	if (keys.length === 0) return [...rows];

	const { data, error } = await supabaseServer
		.from(PHOTOS_READ)
		.select('photo_id, image_key, cf_image_id, album_key, album_name')
		.in('image_key', keys)
		.not('sharpness', 'is', null);

	if (error || !data) {
		console.error('[photoIdentityPeers] lookup failed, falling back to page-local:', error?.message);
		return [...rows];
	}

	return data as PhotoIdentityRow[];
}
