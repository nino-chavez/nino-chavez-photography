import { matviewClient } from '$lib/supabase/server';

/**
 * Data-driven album covers: album_key -> the top-engaged photo's cf_image_id.
 *
 * Reads album_top_photo, a MATERIALIZED VIEW (no RLS, anon REVOKE'd — flaky grant, see
 * matviewClient), so the read goes through service_role. Reading it via the anon client
 * silently returned nothing, so every album quietly fell back to its static cover instead
 * of the top-engaged photo. Albums with no engagement yet aren't in the map, so callers keep
 * whatever cover they already had (graceful fallback). One batched query.
 */
export async function topPhotoCoverMap(albumKeys: string[]): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	const keys = albumKeys.filter(Boolean);
	if (!keys.length) return map;

	try {
		const { data } = await matviewClient()
			.from('album_top_photo')
			.select('album_key, cf_image_id')
			.in('album_key', keys);

		for (const row of data ?? []) {
			if (row.cf_image_id) map.set(row.album_key, row.cf_image_id);
		}
	} catch (e) {
		console.error('[topPhotoCoverMap] matview read failed:', (e as Error)?.message);
	}
	return map;
}
