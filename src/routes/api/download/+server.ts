/**
 * Download Proxy API Route
 *
 * Proxies image downloads from Cloudflare Images to avoid CORS issues.
 * This endpoint fetches images server-side and serves them to the client.
 *
 * Usage: GET /api/download?url=[imageUrl]&filename=[filename]
 */

import type { RequestHandler } from './$types';

/** Allowed image source hosts (exact hostname match — NOT substring) */
const ALLOWED_HOSTS = ['imagedelivery.net'];

export const GET: RequestHandler = async ({ url, fetch }) => {
  try {
    // Get parameters from query string
    const imageUrl = url.searchParams.get('url');
    // Sanitize the filename before reflecting it into Content-Disposition (no header injection).
    const filename = (url.searchParams.get('filename') || 'download.jpg')
      .replace(/[^\w.\- ]+/g, '_')
      .slice(0, 100);

    if (!imageUrl) {
      return new Response('Missing url parameter', { status: 400 });
    }

    // Validate the URL by parsed hostname, not substring — a substring check (`includes`) is
    // bypassable with `https://imagedelivery.net.evil.com/x` or `https://evil.com/?x=imagedelivery.net`,
    // turning this into an open proxy. Require https + an exact allowed host.
    let parsed: URL;
    try {
      parsed = new URL(imageUrl);
    } catch {
      return new Response('Invalid URL', { status: 400 });
    }
    const isAllowed = parsed.protocol === 'https:' && ALLOWED_HOSTS.includes(parsed.hostname);
    if (!isAllowed) {
      return new Response('Invalid URL - must be from Cloudflare Images', { status: 400 });
    }

    // Fetch the image
    const response = await fetch(imageUrl, {
      method: 'GET',
      headers: {
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      console.error('[Download Proxy] Upstream responded with:', response.status, response.statusText);
      return new Response(`Failed to fetch image: ${response.status} ${response.statusText}`, { status: response.status });
    }

    // Stream through — pass the ReadableStream directly without buffering
    const headers: Record<string, string> = {
      'Content-Type': response.headers.get('content-type') || 'image/jpeg',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      headers['Content-Length'] = contentLength;
    }

    return new Response(response.body, { status: 200, headers });

  } catch (error) {
    console.error('[Download Proxy] Error:', error);
    return new Response('Internal server error', { status: 500 });
  }
};
