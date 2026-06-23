import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Data-driven album covers: album_key -> the top-engaged photo's cf_image_id.
 *
 * Reads album_top_photo (anon-readable, refreshed by the popularity cron).
 * Albums with no engagement yet aren't in the map, so callers keep whatever
 * cover they already had (graceful fallback). One batched query.
 */
export async function topPhotoCoverMap(
	client: SupabaseClient,
	albumKeys: string[]
): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	const keys = albumKeys.filter(Boolean);
	if (!keys.length) return map;

	const { data } = await client
		.from('album_top_photo')
		.select('album_key, cf_image_id')
		.in('album_key', keys);

	for (const row of data ?? []) {
		if (row.cf_image_id) map.set(row.album_key, row.cf_image_id);
	}
	return map;
}
