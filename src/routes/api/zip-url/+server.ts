import { json, error } from '@sveltejs/kit';
import { ZIP_SIGNING_SECRET, ZIP_WORKER_URL } from '$env/static/private';
import type { RequestHandler } from './$types';

/**
 * Generates an HMAC-signed URL for the album ZIP Worker.
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

	if (!ZIP_SIGNING_SECRET || !ZIP_WORKER_URL) {
		return json({
			message: 'ZIP Worker not configured',
			debug: {
				hasSecret: !!ZIP_SIGNING_SECRET,
				secretLen: ZIP_SIGNING_SECRET?.length ?? 0,
				hasWorkerUrl: !!ZIP_WORKER_URL,
				workerUrlLen: ZIP_WORKER_URL?.length ?? 0
			}
		}, { status: 503 });
	}

	const ts = Math.floor(Date.now() / 1000).toString();
	const data = `${albumKey}:${quality}:${ts}`;

	// HMAC-SHA256 signature
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(ZIP_SIGNING_SECRET),
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
