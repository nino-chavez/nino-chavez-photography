import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const ANALYTICS_EXCLUSION_COOKIE = 'gallery_analytics_excluded_v2';
export const ANALYTICS_LINKED_COOKIE = 'gallery_analytics_linked_v2';
export const ANALYTICS_IDENTITY_COOKIE = 'gallery_analytics_identity_v2';
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Self-exclusion is a functional preference, never a permission grant. */
export function hasAnalyticsBrowserExclusion(cookies: { get(name: string): string | undefined }): boolean {
	return cookies.get(ANALYTICS_EXCLUSION_COOKIE) === '1';
}

/** The server cookie wins over stale local storage when deciding whether IDs may persist or export. */
export function hasLinkedAnalyticsConsent(cookies: { get(name: string): string | undefined }): boolean {
	return cookies.get(ANALYTICS_LINKED_COOKIE) === '1' && !hasAnalyticsBrowserExclusion(cookies);
}

function signIdentity(browserId: string, secret: string): string {
	return createHmac('sha256', secret).update(`analytics-browser.v2.${browserId}`).digest('base64url');
}

/** The server signs its own random browser ID when linked permission is enabled. */
export function issueAnalyticsIdentityBinding(browserId: string, secret: string): string | null {
	if (!ID_PATTERN.test(browserId) || !secret) return null;
	return `${browserId}.${signIdentity(browserId, secret)}`;
}

/** A posted UUID is never revocation authority; only this signed cookie is. */
export function verifiedAnalyticsIdentityBinding(cookie: string | undefined, secret: string | undefined): string | null {
	if (!cookie || !secret) return null;
	const [browserId, supplied, extra] = cookie.split('.');
	if (!browserId || !supplied || extra || !ID_PATTERN.test(browserId)) return null;
	const expected = signIdentity(browserId, secret);
	const actualBytes = Buffer.from(supplied);
	const expectedBytes = Buffer.from(expected);
	if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null;
	return browserId;
}
