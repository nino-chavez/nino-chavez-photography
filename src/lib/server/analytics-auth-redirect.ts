import { ANALYTICS_HOST } from '../analytics/report-paths';

/** Keep the PKCE verifier and resulting session on the initiating public host. */
export function analyticsAuthCallbackUrl(hostname: string, galleryUrl: string, next?: string): string {
	const publicBase = hostname === ANALYTICS_HOST
		? `https://${ANALYTICS_HOST}/photography`
		: galleryUrl;
	const callback = new URL(`${publicBase}/auth/callback`);
	if (next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')) {
		callback.searchParams.set('next', next);
	}
	return callback.toString();
}
