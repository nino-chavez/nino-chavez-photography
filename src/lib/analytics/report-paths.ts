import { isPublicSitePath } from './events-v2';
/** Public report addresses; the gallery application's build base stays internal. */
export const ANALYTICS_HOST = 'analytics.ninochavez.co';
export function isReportHost(hostname: string) {
	return hostname === ANALYTICS_HOST;
}
export function isAnalyticsWorkspace(routeId: string | null, hostname: string, pathname: string) {
	return routeId === '/analytics/operator' || routeId === '/analytics/sites'
		|| (isReportHost(hostname) && (pathname === '/sites' || pathname === '/gallery'));
}
export function reportPath(hostname: string, report: 'sites' | 'gallery', suffix = '') {
	const path = report === 'sites' ? '/sites' : '/gallery';
	return `${isReportHost(hostname) ? path : `/photography/analytics/${report === 'sites' ? 'sites' : 'operator'}`}${suffix}`;
}
export function internalReportPath(pathname: string): string | null {
	if (pathname === '/sites') return '/photography/analytics/sites';
	if (pathname === '/gallery') return '/photography/analytics/operator';
	if (pathname === '/gallery/export.csv') return '/photography/analytics/operator/export.csv';
	return null;
}
export function cleanReportPath(pathname: string): string | null {
	if (pathname === '/photography/analytics/sites') return '/sites';
	if (pathname === '/photography/analytics' || pathname === '/photography/analytics/operator') return '/gallery';
	if (pathname === '/photography/analytics/operator/export.csv') return '/gallery/export.csv';
	return null;
}

/** Evidence opens on its owning public surface; report links use the analytics shell. */
export function intelligenceEvidenceHref(hostname: string, value: string): string | null {
 if (!value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) return null;
 const url = new URL(value, `https://${ANALYTICS_HOST}`);
 if (['/analytics/operator', '/photography/analytics/operator', '/gallery'].includes(url.pathname)) return reportPath(hostname, 'gallery', url.search + url.hash);
 if (['/photography/analytics/sites', '/sites'].includes(url.pathname)) return reportPath(hostname, 'sites', url.search + url.hash);
 const galleryPath = url.pathname.replace(/^\/photography(?=\/(?:photo|albums)\/)/, '');
 if (/^\/(?:photo|albums)\/[a-zA-Z0-9_%.-]+$/.test(galleryPath)) return `https://ninochavez.co/photography${galleryPath}`;
 return isPublicSitePath(url.pathname) ? `https://ninochavez.co${url.pathname}` : null;
}
