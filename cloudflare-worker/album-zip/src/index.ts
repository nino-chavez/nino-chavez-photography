import type { Env } from './types';
import { fetchAlbumPhotos } from './supabase';
import { computeContentHash, cacheKey } from './hash';
import { buildZip } from './zip-builder';

const MAX_PHOTOS = 300;
const SIGNATURE_MAX_AGE_S = 300; // 5 minutes

/**
 * Verify HMAC-SHA256 signature on the request URL.
 * Signature covers: albumKey + ":" + quality + ":" + timestamp
 */
async function verifySignature(
	secret: string,
	albumKey: string,
	quality: string,
	ts: string,
	sig: string
): Promise<boolean> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const data = encoder.encode(`${albumKey}:${quality}:${ts}`);
	const signature = await crypto.subtle.sign('HMAC', key, data);
	const expected = Array.from(new Uint8Array(signature))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return expected === sig;
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

		// Use SUPABASE_SERVICE_ROLE_KEY as shared HMAC secret (available on both Vercel and Worker)
		const valid = await verifySignature(env.SUPABASE_SERVICE_ROLE_KEY, albumKey, quality, ts, sig);
		if (!valid) {
			return new Response('Invalid signature', {
				status: 403,
				headers: corsHeaders(allowedOrigin)
			});
		}

		try {
			// 2. Fetch photo list from Supabase
			const photos = await fetchAlbumPhotos(
				env.SUPABASE_URL,
				env.SUPABASE_SERVICE_ROLE_KEY,
				albumKey
			);

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
