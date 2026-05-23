import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const ZIP_WORKER_URL = 'https://zip.ninochavez.co';

/**
 * Generates an HMAC-signed URL for the album ZIP Worker.
 * Uses SUPABASE_SERVICE_ROLE_KEY as the HMAC signing secret
 * (already available on both Vercel and the Worker).
 *
 * GET /api/zip-url?albumKey=...&quality=large
 * Returns: { url: "https://worker.dev/zip/...?quality=large&ts=...&sig=..." }
 */
export const GET: RequestHandler = async ({ url }) => {
	const albumKey = url.searchParams.get('albumKey');
	const quality = url.searchParams.get('quality');

	if (!albumKey || !quality) {
		return json({ error: 'Missing albumKey or quality parameter' }, { status: 400 });
	}

	const secret = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!secret) {
		throw error(503, 'Server misconfigured');
	}

	const ts = Math.floor(Date.now() / 1000).toString();
	const data = `${albumKey}:${quality}:${ts}`;

	// HMAC-SHA256 signature
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
	const sig = Array.from(new Uint8Array(signature))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');

	const signedUrl = `${ZIP_WORKER_URL}/zip/${encodeURIComponent(albumKey)}?quality=${quality}&ts=${ts}&sig=${sig}`;

	return json({ url: signedUrl });
};
