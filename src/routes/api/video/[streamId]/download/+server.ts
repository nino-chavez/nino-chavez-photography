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

	// `?name=` is the base name; this route owns the extension. It used to append `.mp4`
	// unconditionally, and the player passed `video.title` — which IS the source filename and
	// already ended in `.mp4` — so every download in the gallery's history saved as
	// `C2154.mp4.mp4` (confirmed on the live content-disposition header). The caller now sends a
	// clean name (see clipDownloadName), and stripping a trailing video extension here means an
	// old cached link, or any future caller that gets it wrong, cannot reproduce it.
	const rawName = url.searchParams.get('name') || streamId;
	const baseName = rawName.replace(/[^\w.\- ]+/g, '_').replace(/\.(mp4|mov|m4v)$/i, '').slice(0, 80);
	const filename = `${baseName || streamId}.mp4`;

	return new Response(upstream.body, {
		headers: {
			'Content-Type': 'video/mp4',
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Cache-Control': 'public, max-age=3600'
		}
	});
};
