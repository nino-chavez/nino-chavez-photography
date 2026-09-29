export const ANALYTICS_EXCLUSION_COOKIE = 'gallery_analytics_excluded_v2';
export const ANALYTICS_LINKED_COOKIE = 'gallery_analytics_linked_v2';

/** Self-exclusion is a functional preference, never a permission grant. */
export function hasAnalyticsBrowserExclusion(cookies: { get(name: string): string | undefined }): boolean {
	return cookies.get(ANALYTICS_EXCLUSION_COOKIE) === '1';
}

/** The server cookie wins over stale local storage when deciding whether IDs may persist or export. */
export function hasLinkedAnalyticsConsent(cookies: { get(name: string): string | undefined }): boolean {
	return cookies.get(ANALYTICS_LINKED_COOKIE) === '1' && !hasAnalyticsBrowserExclusion(cookies);
}
