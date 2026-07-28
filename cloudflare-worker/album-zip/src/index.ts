import type { Env } from './types';
import { fetchAlbumManifest, ManifestUnavailable } from './manifest';
import { computeContentHash, cacheKey } from './hash';
import { buildZip } from './zip-builder';

const MAX_PHOTOS = 300;
const SIGNATURE_MAX_AGE_S = 300; // 5 minutes

/**
 * Signature verification for the download URL minted by /api/zip-url.
 *
 * The signed payload is `albumKey:quality:timestamp`.
 *
 * WHY A DEDICATED SECRET
 *
 * This used to sign with SUPABASE_SERVICE_ROLE_KEY, because that key was already present on
 * both sides. HMAC-SHA256 does not reveal its key, so nothing was leaking — but /api/zip-url is
 * unauthenticated, which made it an open oracle computing a function of the database
 * credential over attacker-chosen input, on demand and without limit. The construction holds
 * that up fine; the objection is that it puts the database key on an adversarial surface for
 * no benefit, so any later slip in this code path escalates to full database access instead of
 * to "someone can mint zip links". It also welded the two together: rotating the Supabase key
 * silently broke every album download, which in practice meant never rotating it.
 *
 * `quality` is part of the signed payload but selects nothing — buildZip serves the `large`
 * variant unconditionally, which is the same variant the gallery's own srcset hands every
 * visitor. It stays in the payload because the payload is a contract between two independently
 * deployed services; /api/zip-url rejects any other value so the field cannot carry junk.
 */
const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

async function signPayload(secret: string, payload: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
	return Array.from(new Uint8Array(signature), (b) => HEX[b]).join('');
}

/**
 * Constant-time string comparison. `a === b` short-circuits on the first differing byte, which
 * leaks how much of a guessed signature was correct. Not a practical attack against a 5-minute
 * window over the public internet, but comparing secrets in variable time is the kind of thing
 * that is free to get right and awkward to explain later.
 */
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/**
 * Verify against the current signing secret, then the previous one.
 *
 * The second slot is permanent, not a migration leftover. The signer and the verifier are
 * separately deployed — a Pages build and a Worker deploy — so with a single slot every
 * rotation has a window where one side signs with a key the other does not accept, and any
 * download attempted in that window fails. Accepting the outgoing secret makes rotation
 * ordinary: set the new one on both sides, then drop the old one whenever convenient.
 */
async function verifySignature(env: Env, payload: string, sig: string): Promise<boolean> {
	for (const secret of [env.ZIP_SIGNING_SECRET, env.ZIP_SIGNING_SECRET_PREVIOUS]) {
		if (!secret) continue;
		if (timingSafeEqual(await signPayload(secret, payload), sig)) return true;
	}
	return false;
}

function corsHeaders(origin: string): Record<string, string> {
	return {
		'Access-Control-Allow-Origin': origin,
		'Access-Control-Allow-Methods': 'GET, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type'
	};
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const allowedOrigin = env.ALLOWED_ORIGIN;

		// CORS preflight
		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
		}

		// Health check
		if (url.pathname === '/health') {
			return new Response('OK', { status: 200, headers: corsHeaders(allowedOrigin) });
		}

		// Route: GET /zip/:albumKey
		const zipMatch = url.pathname.match(/^\/zip\/([^/]+)$/);
		if (!zipMatch || request.method !== 'GET') {
			return new Response('Not Found', { status: 404, headers: corsHeaders(allowedOrigin) });
		}

		const albumKey = decodeURIComponent(zipMatch[1]);
		const quality = url.searchParams.get('quality');
		const ts = url.searchParams.get('ts');
		const sig = url.searchParams.get('sig');

		// 0. Per-IP rate limit (before signature work) — best-effort dampener for sustained
		// bandwidth/R2-egress floods. CF's binding is permissive + eventually-consistent (per-isolate
		// local counters), so it won't hard-gate small bursts; it kicks in under sustained high volume.
		// Hard limiting would need a Durable Object — over-engineering given the signature + R2 cache +
		// 300-photo cap already bound the blast radius. Keyed on the real client IP from CF's edge.
		const clientIp = request.headers.get('CF-Connecting-IP') ?? 'unknown';
		const { success: withinLimit } = await env.ZIP_RATE_LIMITER.limit({ key: clientIp });
		if (!withinLimit) {
			return new Response('Rate limit exceeded — try again shortly', {
				status: 429,
				headers: corsHeaders(allowedOrigin)
			});
		}

		// 1. Verify HMAC signature
		if (!quality || !ts || !sig) {
			return new Response('Missing signature parameters', {
				status: 403,
				headers: corsHeaders(allowedOrigin)
			});
		}

		const now = Math.floor(Date.now() / 1000);
		const tsNum = parseInt(ts, 10);
		if (isNaN(tsNum) || now - tsNum > SIGNATURE_MAX_AGE_S) {
			return new Response('Signature expired', {
				status: 403,
				headers: corsHeaders(allowedOrigin)
			});
		}

		if (!env.ZIP_SIGNING_SECRET) {
			// Fail closed and say why. Serving without verification would turn this into an open
			// bulk-download endpoint for every album on the account.
			console.error('[album-zip] ZIP_SIGNING_SECRET is not set — refusing to verify.');
			return new Response('Server misconfigured', {
				status: 503,
				headers: corsHeaders(allowedOrigin)
			});
		}

		const valid = await verifySignature(env, `${albumKey}:${quality}:${ts}`, sig);
		if (!valid) {
			return new Response('Invalid signature', {
				status: 403,
				headers: corsHeaders(allowedOrigin)
			});
		}

		try {
			// 2. Fetch photo list from Supabase
			let photos;
			try {
				photos = await fetchAlbumManifest(env.PHOTOGRAPHY_ORIGIN, albumKey);
			} catch (err) {
				// 502, not 404. "Album not found or empty" is a claim about the album, and saying it
				// when the upstream simply did not answer sends someone looking for a missing album
				// instead of a broken dependency.
				console.error('[album-zip] manifest unavailable:', err);
				const status = err instanceof ManifestUnavailable ? 502 : 500;
				return new Response('Album manifest unavailable', {
					status,
					headers: corsHeaders(allowedOrigin)
				});
			}

			if (photos.length === 0) {
				return new Response('Album not found or empty', {
					status: 404,
					headers: corsHeaders(allowedOrigin)
				});
			}

			// 3. Enforce photo count cap
			if (photos.length > MAX_PHOTOS) {
				return new Response(
					JSON.stringify({ error: 'Album too large', count: photos.length, max: MAX_PHOTOS }),
					{
						status: 413,
						headers: { 'Content-Type': 'application/json', ...corsHeaders(allowedOrigin) }
					}
				);
			}

			// 4. Compute content hash and check R2 cache
			const contentHash = await computeContentHash(photos);
			const key = cacheKey(albumKey, contentHash);
			const cached = await env.ZIP_CACHE.get(key);

			if (cached) {
				// Cache HIT — stream from R2
				return new Response(cached.body, {
					status: 200,
					headers: {
						'Content-Type': 'application/zip',
						'Content-Disposition': `attachment; filename="${albumKey}.zip"`,
						'Content-Length': cached.size.toString(),
						'X-Cache': 'HIT',
						...corsHeaders(allowedOrigin)
					}
				});
			}

			// 5. Cache MISS — build ZIP
			const zipData = await buildZip(photos, env.CF_ACCOUNT_HASH);

			// Upload to R2 in the background (don't block response)
			ctx.waitUntil(
				env.ZIP_CACHE.put(key, zipData.buffer as ArrayBuffer, {
					httpMetadata: { contentType: 'application/zip' }
				})
			);

			// Serve the ZIP immediately
			return new Response(zipData, {
				status: 200,
				headers: {
					'Content-Type': 'application/zip',
					'Content-Disposition': `attachment; filename="${albumKey}.zip"`,
					'Content-Length': zipData.byteLength.toString(),
					'X-Cache': 'MISS',
					...corsHeaders(allowedOrigin)
				}
			});
		} catch (err) {
			console.error('[album-zip-worker] Error:', err);
			return new Response('Internal server error', {
				status: 500,
				headers: corsHeaders(allowedOrigin)
			});
		}
	}
} satisfies ExportedHandler<Env>;
