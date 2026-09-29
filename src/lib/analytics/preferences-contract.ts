export const ANALYTICS_EXCLUSION_COOKIE = 'gallery_analytics_excluded_v2';

/** Self-exclusion is a functional preference, never a permission grant. */
export function hasAnalyticsBrowserExclusion(cookies: { get(name: string): string | undefined }): boolean {
	return cookies.get(ANALYTICS_EXCLUSION_COOKIE) === '1';
}
