import type { AlbumPhoto } from './types';

/**
 * Which photos are in an album, according to the gallery app.
 *
 * WHY THIS IS NOT A DATABASE QUERY
 *
 * This worker used to hold SUPABASE_SERVICE_ROLE_KEY and run its own PostgREST query against
 * `photo_metadata`. That put the database's master credential — the one that bypasses every RLS
 * policy — in a second environment, to answer a question the gallery app already answers over
 * HTTP at `/api/album-photos`.
 *
 * It also made this worker a second implementation of "which photos are in an album", and the
 * two had to agree on rules that live in the app: album-key scoping, `cf_image_id IS NOT NULL`,
 * and the project-wide `sharpness IS NOT NULL` filter that excludes unprocessed photos. Two
 * copies of an invariant drift; the copy nobody looks at drifts first, and here that would mean
 * a ZIP quietly containing photos the gallery refuses to show.
 *
 * So the app owns the query and this worker asks it. `fetchAlbumPhotosForDownload` in
 * src/lib/supabase/server.ts is the single definition, and `/api/album-photos` is its wire
 * form — the same endpoint the browser's own download button reads.
 *
 * WHY THE pages.dev ORIGIN
 *
 * The public hostname sits behind the zone's bot protection, which correctly refuses
 * non-browser clients — including this worker. The Pages origin is off-zone, which is the same
 * reason apps/router targets it.
 *
 * WHY THE DEPENDENCY IS NOT A NEW ONE
 *
 * The signed URL that reached this worker was minted by that same app no more than five minutes
 * ago. If the app is down there is no signature to present, so this adds no failure mode that
 * was not already fatal to the request.
 */

/** The manifest could not be established. Distinct from "the album is empty". */
export class ManifestUnavailable extends Error {}

export async function fetchAlbumManifest(
	origin: string,
	albumKey: string
): Promise<AlbumPhoto[]> {
	const url = `${origin}/photography/api/album-photos?albumKey=${encodeURIComponent(albumKey)}`;

	let response: Response;
	try {
		response = await fetch(url);
	} catch (cause) {
		throw new ManifestUnavailable(`manifest fetch failed: ${cause}`);
	}

	if (!response.ok) {
		throw new ManifestUnavailable(`manifest responded ${response.status}`);
	}

	// The endpoint sends `cache-control: s-maxage=300`, so this list can be up to five minutes
	// behind the database. That is deliberate and harmless: the list feeds computeContentHash,
	// which is the R2 cache key, so a stale manifest yields a consistent — if briefly
	// out-of-date — archive rather than a corrupt one, and the next request past the TTL
	// produces a new hash and a new ZIP.
	const body = (await response.json()) as { photos?: unknown };

	if (!Array.isArray(body.photos)) {
		throw new ManifestUnavailable('manifest response had no photos array');
	}

	return body.photos as AlbumPhoto[];
}
