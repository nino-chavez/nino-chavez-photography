import { oldAddressTarget } from '../analytics/old-addresses';
import { ANALYTICS_HOST, cleanReportPath } from '../analytics/report-paths';

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

/** A callback destination is a path in this app, never an external URL. */
export function authReturnPath(value: string | null, fallback = '/admin/tags'): string {
 if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f]/.test(value)) return fallback;
 try { const target = new URL(value, 'https://auth.invalid'); return target.origin === 'https://auth.invalid' ? `${target.pathname}${target.search}${target.hash}` : fallback; } catch { return fallback; }
}


/** An existing owner session returns to the same public report address. A return address from the old gallery report goes straight to where that report went. */
export function signedInReturnPath(hostname: string, appBase: string, value: string | null): string {
 const next = authReturnPath(value, hostname === ANALYTICS_HOST ? '/analytics/home' : `${appBase}/admin/tags`);
 if (hostname !== ANALYTICS_HOST) return next;
 const full = new URL(`${appBase}${next}`, 'https://auth.invalid');
 const moved = oldAddressTarget(full.pathname, full.search);
 return moved ? `${moved.pathname}${moved.search}${moved.hash}` : cleanReportPath(full.pathname) ? `${cleanReportPath(full.pathname)}${full.search}${full.hash}` : next;
}
