import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const ZIP_WORKER_URL = 'https://zip.ninochavez.co';

/**
 * The only variant the ZIP worker builds. It fetches `/large` from Cloudflare Images
 * unconditionally, which is the same variant the gallery's own srcset serves every visitor, so
 * the archive is a convenience over the page rather than a higher-fidelity copy of it.
 *
 * `quality` still travels in the signed payload because that payload is a contract between two
 * independently deployed services and cannot be changed on one side alone. Rejecting anything
 * else keeps the field from carrying arbitrary attacker-chosen text into a signature.
 */
const ALLOWED_QUALITIES = new Set(['large']);

/**
 * Album keys are SmugMug-derived — all 262 in the database are exactly six alphanumeric
 * characters. This bound is looser than that so a future ingest with a different key format is
 * not silently broken, and tight enough to exclude what matters: path separators, the `:` that
 * delimits the signed payload, and unbounded length.
 *
 * This was missing entirely. The note above about `quality` — that rejecting other values
 * "keeps the field from carrying arbitrary attacker-chosen text into a signature" — applied
 * word for word to the field beside it, which was signing `../../etc/passwd`,
 * `A:large:9999999999` and a 500-character string on request. The verifying worker applies the
 * identical pattern (cloudflare-worker/album-zip/src/request-guards.ts).
 */
const ALBUM_KEY_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

/**
 * Mint an HMAC-signed URL for the album ZIP worker.
 *
 * GET /api/zip-url?albumKey=...&quality=large  ->  { url: "https://zip.ninochavez.co/zip/..." }
 *
 * WHAT THE SIGNATURE IS AND IS NOT
 *
 * This endpoint is unauthenticated on purpose: the album key is the capability, the same
 * boundary /api/album-photos documents for single-album reads. The signature is therefore not
 * an access-control decision — anyone can obtain one — it binds the request to a five-minute
 * window so the worker is not a permanently addressable bulk-download endpoint.
 *
 * WHY THIS NO LONGER SIGNS WITH THE SUPABASE KEY
 *
 * It used to use SUPABASE_SERVICE_ROLE_KEY, which was already present on both sides.
 * HMAC-SHA256 does not reveal its key, so nothing was leaking. The objection is narrower and
 * still worth acting on: an unauthenticated endpoint that returns HMAC(k, attacker-chosen
 * input) on demand is an oracle, and pointing an oracle at the database credential buys nothing
 * while making every future change to this file a database-severity change. It also meant the
 * Supabase key could not be rotated without breaking album downloads, so it never was.
 *
 * See cloudflare-worker/album-zip/src/index.ts for the verifying half, including the
 * previous-secret slot that makes rotating this key a non-event.
 */
export const GET: RequestHandler = async ({ url }) => {
	const albumKey = url.searchParams.get('albumKey');
	const quality = url.searchParams.get('quality');

	if (!albumKey || !quality) {
		return json({ error: 'Missing albumKey or quality parameter' }, { status: 400 });
	}

	if (!ALBUM_KEY_PATTERN.test(albumKey)) {
		return json({ error: 'Invalid albumKey' }, { status: 400 });
	}

	if (!ALLOWED_QUALITIES.has(quality)) {
		return json({ error: 'Unsupported quality' }, { status: 400 });
	}

	const secret = env.ZIP_SIGNING_SECRET;
	if (!secret) {
		// Fail closed rather than fall back to another key. A signature the worker rejects is a
		// visibly broken download; one minted with the wrong secret is a silently broken one.
		console.error('[zip-url] ZIP_SIGNING_SECRET is not set — cannot sign download URLs.');
		throw error(503, 'Server misconfigured');
	}

	const ts = Math.floor(Date.now() / 1000).toString();
	const payload = `${albumKey}:${quality}:${ts}`;

	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
	const sig = Array.from(new Uint8Array(signature))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');

	const signedUrl = `${ZIP_WORKER_URL}/zip/${encodeURIComponent(albumKey)}?quality=${quality}&ts=${ts}&sig=${sig}`;

	return json({ url: signedUrl });
};
