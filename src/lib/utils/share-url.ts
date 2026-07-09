/**
 * Share URL Attribution
 *
 * Appends a `?src=<channel>` query param to outbound share URLs so Cloudflare Web
 * Analytics stops bucketing every share click as "direct" traffic. The value is
 * read back on arrival by $lib/analytics/tracker's trackArrival (see the albums/[slug]
 * and homepage loaders), which logs it as a view engagement event.
 */

// Every current caller (ShareMenu, SocialShareButtons) builds an absolute URL
// (`https://photography.ninochavez.co/...` or `data.seo.canonical`), but a relative
// path is handled too via this fallback base in case a future caller passes one.
const FALLBACK_BASE = 'https://photography.ninochavez.co';

/**
 * Append (or overwrite) the `src` query param on a URL headed out of the app.
 * Preserves any existing query params. Falls back to returning the input
 * unchanged if it can't be parsed as a URL — attribution must never break sharing.
 *
 * @example
 * withSrc('https://photography.ninochavez.co/photo/i-AbCdEf', 'share-x')
 * // => 'https://photography.ninochavez.co/photo/i-AbCdEf?src=share-x'
 */
export function withSrc(url: string, src: string): string {
	try {
		const parsed = new URL(url, FALLBACK_BASE);
		parsed.searchParams.set('src', src);
		return parsed.toString();
	} catch {
		return url;
	}
}
