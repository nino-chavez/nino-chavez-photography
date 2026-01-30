/**
 * Cloudflare Worker: SmugMug Image Proxy
 *
 * Route: gallery.ninochavez.co/*
 *
 * Features:
 * 1. PROXY MODE: /proxy/photos.smugmug.com/... → proxies SmugMug images
 * 2. EDGE CACHING: 1-year TTL for immutable images
 * 3. PASS-THROUGH MODE: everything else → passes to SmugMug site
 *
 * URL format:
 *   gallery.ninochavez.co/proxy/photos.smugmug.com/photos/i-xxx-L.jpg
 *
 * Benefits:
 * - First-party domain (no third-party cookies)
 * - Edge caching with 1-year TTL
 * - Cache separation by Accept header (WebP/AVIF/JPEG)
 */

const VERSION = '1.1.0';

// Cache TTL (1 year for immutable images)
const CACHE_TTL = 31536000;

// Upstream fetch timeout (10 seconds)
const FETCH_TIMEOUT_MS = 10000;

// Image extensions to proxy
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|avif)$/i;

// Allowed SmugMug hostnames
const ALLOWED_HOSTS = ['photos.smugmug.com', 'ninochavez.smugmug.com'];

export default {
  async fetch(request, _env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Health check endpoint with version info
    if (pathname === '/_worker/health') {
      return Response.json({
        status: 'ok',
        version: VERSION,
        timestamp: Date.now()
      });
    }

    // PROXY MODE: /proxy/photos.smugmug.com/path/to/image.jpg
    if (pathname.startsWith('/proxy/')) {
      return handleProxyRequest(request, ctx, url);
    }

    // PASS-THROUGH MODE: everything else goes to SmugMug site
    return fetch(request);
  }
};

async function handleProxyRequest(request, ctx, url) {
  const pathname = url.pathname;

  // Extract the target URL from the path
  // /proxy/photos.smugmug.com/photos/i-xxx-L.jpg → https://photos.smugmug.com/photos/i-xxx-L.jpg
  const targetPath = pathname.replace('/proxy/', '');
  const targetHost = targetPath.split('/')[0].toLowerCase();
  const targetUrl = `https://${targetPath}`;

  // Validate hostname is an allowed SmugMug domain (prevents SSRF)
  if (!ALLOWED_HOSTS.includes(targetHost)) {
    return new Response('Invalid proxy target', { status: 400 });
  }

  // Determine if this is an image request
  const isImage = IMAGE_EXTENSIONS.test(pathname);

  // For cache separation by Accept header (WebP vs AVIF vs JPEG)
  const acceptHeader = request.headers.get('Accept') || '';
  const supportsAvif = acceptHeader.includes('image/avif');
  const supportsWebp = acceptHeader.includes('image/webp');
  const formatKey = supportsAvif ? 'avif' : supportsWebp ? 'webp' : 'jpeg';

  // Create a cache key that includes the format for proper cache separation
  // Use minimal request to avoid caching auth headers or cookies
  const cacheKeyUrl = new URL(request.url);
  cacheKeyUrl.searchParams.set('_fmt', formatKey);
  const cacheKey = new Request(cacheKeyUrl.toString(), { method: 'GET' });
  const cache = caches.default;

  // Check cache first
  let response = await cache.match(cacheKey);

  if (response) {
    const headers = new Headers(response.headers);
    headers.set('X-Cache', 'HIT');
    headers.set('X-Format-Key', formatKey);
    return new Response(response.body, {
      status: response.status,
      headers
    });
  }

  // Fetch the image from SmugMug with timeout
  let originResponse;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    originResponse = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'NinoChavezGallery/1.0',
        'Accept': acceptHeader || '*/*'
      }
    });
  } catch (e) {
    console.error('Upstream fetch failed:', e);
    const status = e.name === 'AbortError' ? 504 : 502;
    return new Response('Failed to fetch image', { status });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!originResponse.ok) {
    return new Response('Image not found', { status: originResponse.status });
  }

  // Get content type from the response (Cloudflare sets correct type for transformed images)
  const contentType = originResponse.headers.get('Content-Type') || 'image/jpeg';
  const isImageResponse = contentType.startsWith('image/') || isImage;

  if (!isImageResponse) {
    return originResponse;
  }

  const imageBuffer = await originResponse.arrayBuffer();

  // Create response with optimized caching headers
  response = new Response(imageBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': `public, max-age=${CACHE_TTL}, immutable`,
      'CDN-Cache-Control': `public, max-age=${CACHE_TTL}`,
      'Access-Control-Allow-Origin': '*',
      'Vary': 'Accept',
      'X-Cache': 'MISS',
      'X-Format-Key': formatKey,
      'X-Original-URL': targetUrl
    }
  });

  // Store in edge cache
  ctx.waitUntil(cache.put(cacheKey, response.clone()));

  return response;
}
