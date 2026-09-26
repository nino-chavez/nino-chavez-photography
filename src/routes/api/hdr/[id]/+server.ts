/**
 * Streams a photo's web-sized Ultra HDR (gain-map) JPEG from R2.
 *
 * GET /api/hdr/[id] — [id] is a photo_id (`${album_key}-${image_key}`). Callers (PhotoDetailModal,
 * /photo/[id]/+page.svelte) only build this URL when `photo.hdr_web_available` is true, but this
 * route defends itself anyway: an empty/missing R2 object, a missing binding (local `vite dev`
 * has no R2 platform binding), or a malformed id all 404, and every caller's `<img onerror>`
 * already falls back to the Cloudflare Images URL — see hdr-photo-url.ts's doc comment.
 *
 * The object was uploaded by scripts/ingest-album.ts (via `wrangler r2 object put`, run on the
 * operator's machine — not through this binding) to the deterministic key `hdr/${photoId}.jpg`.
 * No DB lookup needed: `hdr_web_available` is the only thing that gates whether this URL is ever
 * requested, and the key is always derivable from the id in the URL.
 */
import type { RequestHandler } from './$types';
import type { R2Bucket } from '@cloudflare/workers-types';

/** Matches every real photo_id shape (`${albumKey}-${imageKey}`, e.g. "Re7kho-acc-v-jca-077") —
 * alphanumerics, underscore, hyphen only. Rejects anything that could reach outside the `hdr/`
 * prefix (`/`, `..`, etc.) before it ever becomes an R2 key. */
const PHOTO_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export const GET: RequestHandler = async ({ params, platform }) => {
	const photoId = params.id;
	if (!photoId || !PHOTO_ID_RE.test(photoId)) {
		return new Response('Not found', { status: 404 });
	}

	const bucket = platform?.env?.HDR_ORIGINALS as R2Bucket | undefined;
	if (!bucket) {
		// No binding — local dev without `wrangler pages dev`, or the binding failed to provision.
		// Callers fall back to Cloudflare Images on any non-2xx, so this degrades silently for a
		// visitor; it is loud in the server log for whoever's watching it.
		console.warn('[api/hdr] HDR_ORIGINALS R2 binding not available on this platform');
		return new Response('Not found', { status: 404 });
	}

	let object;
	try {
		object = await bucket.get(`hdr/${photoId}.jpg`);
	} catch (e) {
		console.error('[api/hdr] R2 get failed:', e);
		return new Response('Not found', { status: 404 });
	}
	if (!object) {
		return new Response('Not found', { status: 404 });
	}

	return new Response(object.body as unknown as ReadableStream, {
		headers: {
			'Content-Type': 'image/jpeg',
			'Content-Length': String(object.size),
			// Immutable: a re-export replaces the object in place (scripts/ingest-album.ts --replace
			// uploads under the SAME key), and R2's ETag reflects that — but this route has no way to
			// bust a browser's cached copy on replace today, so keep the ceiling well under a day.
			'Cache-Control': 'public, max-age=3600',
			ETag: object.httpEtag
		}
	});
};
