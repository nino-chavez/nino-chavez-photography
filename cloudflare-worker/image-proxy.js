/**
 * Cloudflare Worker: SmugMug Image Proxy (Pass-through + Image Proxy)
 *
 * Route: gallery.ninochavez.co/*
 *
 * Two modes:
 * 1. PROXY MODE: /proxy/photos.smugmug.com/... → proxies SmugMug images with caching
 * 2. PASS-THROUGH MODE: everything else → passes to SmugMug site
 *
 * Your SvelteKit app should use URLs like:
 *   gallery.ninochavez.co/proxy/photos.smugmug.com/photos/i-xxx-L.jpg
 *
 * Benefits:
 * - First-party domain (no third-party cookies)
 * - Edge caching with 1-year TTL
 * - Future: WebP/AVIF conversion with Cloudflare Pro
 */

// Cache TTL (1 year for immutable images)
const CACHE_TTL = 31536000;

// Image extensions to cache
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
      return handleProxyRequest(request, ctx, pathname);
    }

    // PASS-THROUGH MODE: everything else goes to SmugMug site
    return fetch(request);
  }
};

async function handleProxyRequest(request, ctx, pathname) {
  // Extract the target URL from the path
  // /proxy/photos.smugmug.com/photos/i-xxx-L.jpg → https://photos.smugmug.com/photos/i-xxx-L.jpg
  const targetPath = pathname.replace('/proxy/', '');
  const targetUrl = `https://${targetPath}`;

  // Validate it's a SmugMug URL (photos.smugmug.com or ninochavez.smugmug.com)
  if (!targetPath.includes('smugmug.com/')) {
    return new Response('Invalid proxy target', { status: 400 });
  }

  // Check cache first
  const url = new URL(request.url);
  const cacheKey = new Request(url.toString(), request);
  const cache = caches.default;
  let response = await cache.match(cacheKey);

  if (response) {
    const headers = new Headers(response.headers);
    headers.set('X-Cache', 'HIT');
    return new Response(response.body, {
      status: response.status,
      headers
    });
  }

  // Fetch from SmugMug
  let originResponse;
  try {
    originResponse = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'NinoChavezGallery/1.0',
        'Accept': request.headers.get('Accept') || '*/*'
      }
    });
  } catch (e) {
    return new Response('Failed to fetch image', { status: 502 });
  }

  if (!originResponse.ok) {
    return new Response('Image not found', { status: originResponse.status });
  }

  // Only cache images
  const contentType = originResponse.headers.get('Content-Type') || '';
  const isImage = contentType.startsWith('image/') || IMAGE_EXTENSIONS.test(pathname);

  if (!isImage) {
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
      'X-Cache': 'MISS'
    }
  });

  // Store in edge cache
  ctx.waitUntil(cache.put(cacheKey, response.clone()));

  return response;
}
