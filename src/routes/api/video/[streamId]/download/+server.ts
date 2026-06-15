import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

/**
 * Same-origin proxy for a Cloudflare Stream MP4 download.
 *
 * The Stream download endpoint 302-redirects, and that redirect isn't
 * CORS-permitted, so the browser can't fetch the file cross-origin for
 * navigator.share({files}) or a forced download. Streaming it through this
 * route makes it same-origin: the client can fetch the blob to share to
 * Instagram, and the attachment disposition makes the Download button save.
 */
const STREAM_SUBDOMAIN = 'mztsxz382jswgq00';

export const GET: RequestHandler = async ({ params, url, fetch }) => {
	const streamId = params.streamId;
	if (!streamId || !/^[a-f0-9]{32}$/i.test(streamId)) throw error(400, 'Invalid stream id');

	const src = `https://customer-${STREAM_SUBDOMAIN}.cloudflarestream.com/${streamId}/downloads/default.mp4`;
	const upstream = await fetch(src, { redirect: 'follow' });
	if (!upstream.ok || !upstream.body) throw error(404, 'Video not available for download');

	const rawName = url.searchParams.get('name') || streamId;
	const filename = `${rawName.replace(/[^\w.\- ]+/g, '_').slice(0, 80)}.mp4`;

	return new Response(upstream.body, {
		headers: {
			'Content-Type': 'video/mp4',
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Cache-Control': 'public, max-age=3600'
		}
	});
};
