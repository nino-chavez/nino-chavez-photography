import { isPublicSitePath } from './events-v2';
/** Public report addresses; the gallery application's build base stays internal. */
export const ANALYTICS_HOST = 'analytics.ninochavez.co';
export function isReportHost(hostname: string) {
	return hostname === ANALYTICS_HOST;
}
/** An album key as the gallery writes it. Anything else is not an album address. */
const ALBUM_KEY = /^[A-Za-z0-9_-]{1,64}$/;
export function isAlbumKey(value: string): boolean {
	return ALBUM_KEY.test(value);
}
const INTERNAL_ALBUM = /^\/photography\/analytics\/albums\/([^/]+)$/;
const CLEAN_ALBUM = /^\/albums\/([^/]+)$/;
function albumKeyFrom(pattern: RegExp, pathname: string): string | null {
	const key = pattern.exec(pathname)?.[1];
	return key !== undefined && isAlbumKey(key) ? key : null;
}
/** Where an album's launch report lives: the clean address on the report host, the internal route elsewhere. */
export function albumReportPath(hostname: string, albumKey: string, suffix = '') {
	if (!isAlbumKey(albumKey)) throw new RangeError('not an album key');
	return `${isReportHost(hostname) ? '' : '/photography/analytics'}/albums/${albumKey}${suffix}`;
}
/** Where the album index lives: the clean address on the report host, the internal route elsewhere. */
export function albumIndexPath(hostname: string, suffix = '') {
	return `${isReportHost(hostname) ? '' : '/photography/analytics'}/albums${suffix}`;
}

export function isAnalyticsWorkspace(routeId: string | null, hostname: string, pathname: string) {
	return routeId === '/analytics/operator' || routeId === '/analytics/sites' || routeId === '/analytics/albums' || routeId === '/analytics/albums/[albumKey]'
		|| (isReportHost(hostname) && (pathname === '/sites' || pathname === '/gallery' || pathname === '/albums' || albumKeyFrom(CLEAN_ALBUM, pathname) !== null));
}
export function reportPath(hostname: string, report: 'sites' | 'gallery', suffix = '') {
	const path = report === 'sites' ? '/sites' : '/gallery';
	return `${isReportHost(hostname) ? path : `/photography/analytics/${report === 'sites' ? 'sites' : 'operator'}`}${suffix}`;
}
export function internalReportPath(pathname: string): string | null {
	if (pathname === '/sites') return '/photography/analytics/sites';
	if (pathname === '/gallery') return '/photography/analytics/operator';
	if (pathname === '/gallery/export.csv') return '/photography/analytics/operator/export.csv';
	if (pathname === '/albums') return '/photography/analytics/albums';
	if (pathname === '/albums/export.csv') return '/photography/analytics/albums/export.csv';
	const album = albumKeyFrom(CLEAN_ALBUM, pathname);
	if (album) return `/photography/analytics/albums/${album}`;
	return null;
}
export function cleanReportPath(pathname: string): string | null {
	if (pathname === '/photography/analytics/sites') return '/sites';
	if (pathname === '/photography/analytics' || pathname === '/photography/analytics/operator') return '/gallery';
	if (pathname === '/photography/analytics/operator/export.csv') return '/gallery/export.csv';
	if (pathname === '/photography/analytics/albums') return '/albums';
	if (pathname === '/photography/analytics/albums/export.csv') return '/albums/export.csv';
	const album = albumKeyFrom(INTERNAL_ALBUM, pathname);
	if (album) return `/albums/${album}`;
	return null;
}

/** Evidence opens on its owning public surface; report links use the analytics shell. */
export function intelligenceEvidenceHref(hostname: string, value: string): string | null {
 if (!value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) return null;
 const url = new URL(value, `https://${ANALYTICS_HOST}`);
 if (['/analytics/operator', '/photography/analytics/operator', '/gallery'].includes(url.pathname)) return reportPath(hostname, 'gallery', url.search + url.hash);
 if (['/photography/analytics/sites', '/sites'].includes(url.pathname)) return reportPath(hostname, 'sites', url.search + url.hash);
 // `/albums/<key>` is the public gallery's own album page, so it is not read as a report address here.
 const album = albumKeyFrom(INTERNAL_ALBUM, url.pathname) ?? albumKeyFrom(/^\/analytics\/albums\/([^/]+)$/, url.pathname);
 if (album) return albumReportPath(hostname, album, url.search + url.hash);
 const galleryPath = url.pathname.replace(/^\/photography(?=\/(?:photo|albums)\/)/, '');
 if (/^\/(?:photo|albums)\/[a-zA-Z0-9_%.-]+$/.test(galleryPath)) return `https://ninochavez.co/photography${galleryPath}`;
 return isPublicSitePath(url.pathname) ? `https://ninochavez.co${url.pathname}` : null;
}
