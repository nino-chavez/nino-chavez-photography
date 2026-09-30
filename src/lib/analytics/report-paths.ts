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
