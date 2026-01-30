/**
 * Cloudflare Worker: SmugMug Image Proxy with WebP/AVIF Conversion
 *
 * Route: gallery.ninochavez.co/*
 *
 * Features:
 * 1. PROXY MODE: /proxy/photos.smugmug.com/... → proxies SmugMug images
 * 2. IMAGE OPTIMIZATION: Converts JPEG to WebP/AVIF using /cdn-cgi/image/
 * 3. EDGE CACHING: 1-year TTL for immutable images
 * 4. PASS-THROUGH MODE: everything else → passes to SmugMug site
 *
 * URL format:
 *   gallery.ninochavez.co/proxy/photos.smugmug.com/photos/i-xxx-L.jpg
 *
 * Benefits:
 * - First-party domain (no third-party cookies)
 * - Automatic WebP/AVIF conversion (saves ~30-50% bandwidth)
 * - Edge caching with 1-year TTL
 * - Free tier: 5,000 unique transformations/month
 */

// Cache TTL (1 year for immutable images)
const CACHE_TTL = 31536000;

// Image extensions to transform
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp)$/i;

export default {
  async fetch(request, _env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Health check endpoint
    if (pathname === '/_worker/health') {
      return new Response('OK', { status: 200 });
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
  const targetUrl = `https://${targetPath}`;

  // Validate it's a SmugMug URL (photos.smugmug.com or ninochavez.smugmug.com)
  if (!targetPath.includes('smugmug.com/')) {
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
  const cacheKeyUrl = new URL(request.url);
  cacheKeyUrl.searchParams.set('_fmt', formatKey);
  const cacheKey = new Request(cacheKeyUrl.toString(), request);
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

  // For images, use Cloudflare Image Transformations via /cdn-cgi/image/
  let originResponse;
  try {
    if (isImage && (supportsAvif || supportsWebp)) {
      // Use the /cdn-cgi/image/ URL transformation endpoint
      // This uses the zone's Image Transformations feature (5,000 free/month)
      const format = supportsAvif ? 'avif' : 'webp';
      const transformUrl = `https://gallery.ninochavez.co/cdn-cgi/image/format=${format},quality=85,fit=scale-down/${targetUrl}`;

      originResponse = await fetch(transformUrl, {
        headers: {
          'User-Agent': 'NinoChavezGallery/1.0',
          'Accept': acceptHeader || '*/*'
        }
      });
    } else {
      // Non-image or no modern format support - fetch directly
      originResponse = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'NinoChavezGallery/1.0',
          'Accept': acceptHeader || '*/*'
        }
      });
    }
  } catch (e) {
    return new Response('Failed to fetch image: ' + e.message, { status: 502 });
  }

  if (!originResponse.ok) {
    // If transformation fails, fall back to direct fetch
    if (isImage && originResponse.status >= 400) {
      try {
        originResponse = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'NinoChavezGallery/1.0',
            'Accept': acceptHeader || '*/*'
          }
        });
      } catch (e) {
        return new Response('Failed to fetch image: ' + e.message, { status: 502 });
      }
    }

    if (!originResponse.ok) {
      return new Response('Image not found', { status: originResponse.status });
    }
  }

  // Get content type from the response
  const contentType = originResponse.headers.get('Content-Type') || '';
  const isImageResponse = contentType.startsWith('image/') || isImage;

  if (!isImageResponse) {
    return originResponse;
  }

  const imageBuffer = await originResponse.arrayBuffer();

  // Create response with optimized caching headers
  response = new Response(imageBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType || 'image/jpeg',
      'Cache-Control': `public, max-age=${CACHE_TTL}, immutable`,
      'CDN-Cache-Control': `public, max-age=${CACHE_TTL}`,
      'Access-Control-Allow-Origin': '*',
      'Vary': 'Accept',
      'X-Cache': 'MISS',
      'X-Format-Key': formatKey,
      'X-Original-URL': targetUrl,
      'X-Transformed': isImage && (supportsAvif || supportsWebp) ? 'true' : 'false'
    }
  });

  // Store in edge cache
  ctx.waitUntil(cache.put(cacheKey, response.clone()));

  return response;
}
