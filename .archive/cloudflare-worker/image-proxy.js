/**
 * Cloudflare Worker: SmugMug Image Proxy
 *
 * Route: gallery.ninochavez.co/*
 *
 * Features:
 * 1. PROXY MODE: /proxy/photos.smugmug.com/... → proxies SmugMug images
 * 2. IMAGE TRANSFORMATION: WebP/AVIF conversion via Cloudflare Images
 * 3. EDGE CACHING: Automatic caching of transformed variants
 * 4. PASS-THROUGH MODE: everything else → passes to SmugMug site
 *
 * URL format:
 *   gallery.ninochavez.co/proxy/photos.smugmug.com/photos/i-xxx-L.jpg
 *
 * Benefits:
 * - First-party domain (no third-party cookies)
 * - Automatic WebP/AVIF conversion (60-80% smaller files)
 * - Edge caching with 1-year TTL
 * - 5,000 free transformations/month
 *
 * @see https://developers.cloudflare.com/images/transform-images/transform-via-workers/
 */

const VERSION = '2.0.0';

// Cache TTL (1 year for immutable images)
const CACHE_TTL = 31536000;

// Image extensions to proxy
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|avif)$/i;

// Allowed SmugMug hostnames
const ALLOWED_HOSTS = ['photos.smugmug.com', 'ninochavez.smugmug.com'];

export default {
  async fetch(request, _env, _ctx) {
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
      return handleProxyRequest(request, url);
    }

    // PASS-THROUGH MODE: everything else goes to SmugMug site
    return fetch(request);
  }
};

async function handleProxyRequest(request, url) {
  const pathname = url.pathname;

  // Prevent infinite loops - Cloudflare adds this header when resizing
  if (/image-resizing/.test(request.headers.get('Via') || '')) {
    return fetch(request);
  }

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

  // Detect browser format support from Accept header
  const acceptHeader = request.headers.get('Accept') || '';
  const supportsAvif = acceptHeader.includes('image/avif');
  const supportsWebp = acceptHeader.includes('image/webp');

  // Determine optimal format (AVIF > WebP > original)
  let outputFormat = 'jpeg';
  if (supportsAvif) {
    outputFormat = 'avif';
  } else if (supportsWebp) {
    outputFormat = 'webp';
  }

  // For non-image requests, just proxy through
  if (!isImage) {
    return fetch(targetUrl, {
      headers: { 'User-Agent': 'NinoChavezGallery/2.0' }
    });
  }

  // Fetch with Cloudflare Image Transformation
  // Cloudflare automatically caches transformed variants
  // @see https://developers.cloudflare.com/images/transform-images/transform-via-workers/
  let response;
  try {
    response = await fetch(targetUrl, {
      cf: {
        image: {
          format: outputFormat,
          quality: 85,
          metadata: 'copyright', // Preserve copyright info only
          fit: 'scale-down'      // Never upscale
        },
        // Cloudflare caches transformed images automatically
        cacheTtl: CACHE_TTL,
        cacheEverything: true
      }
    });
  } catch (e) {
    console.error('Image transformation failed:', e);
    // Fallback: fetch original without transformation
    response = await fetch(targetUrl, {
      headers: { 'User-Agent': 'NinoChavezGallery/2.0' }
    });
  }

  // Handle transformation errors (e.g., 9422 = quota exceeded)
  if (!response.ok) {
    // If transformation failed, try fetching original
    if (response.status >= 400 && response.status < 500) {
      console.error(`Transform error ${response.status}, fetching original`);
      response = await fetch(targetUrl, {
        headers: { 'User-Agent': 'NinoChavezGallery/2.0' }
      });
    }
    if (!response.ok) {
      return new Response('Image not found', { status: response.status });
    }
  }

  // Clone response and add custom headers
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', `public, max-age=${CACHE_TTL}, immutable`);
  headers.set('CDN-Cache-Control', `public, max-age=${CACHE_TTL}`);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Vary', 'Accept');
  headers.set('X-Image-Format', outputFormat);
  headers.set('X-Proxy-Version', VERSION);

  return new Response(response.body, {
    status: response.status,
    headers
  });
}
