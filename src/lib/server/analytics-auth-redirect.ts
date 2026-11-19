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

/**
 * A callback destination is a path in this app, never an external URL. The check runs on the
 * path as the URL parser normalises it too: `..` segments can collapse to a leading `//`, which a
 * browser reads as another host.
 */
export function authReturnPath(value: string | null, fallback = '/admin/tags'): string {
 if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f]/.test(value)) return fallback;
 try {
  const target = new URL(value, 'https://auth.invalid');
  if (target.origin !== 'https://auth.invalid' || target.pathname.startsWith('//')) return fallback;
  return `${target.pathname}${target.search}${target.hash}`;
 } catch { return fallback; }
}


/**
 * Where an owner who is already signed in goes from the login page. Return paths are app paths
 * without the base (the callback adds it the same way); the base is always added here, and on the
 * analytics host a report path is then shortened to its clean public address. A return address from
 * the old gallery report goes straight to where that report went.
 */
export function signedInReturnPath(hostname: string, appBase: string, value: string | null): string {
 const next = authReturnPath(value, hostname === ANALYTICS_HOST ? '/analytics/home' : '/admin/tags');
 const full = new URL(`${appBase}${next}`, 'https://auth.invalid');
 const inApp = `${full.pathname}${full.search}${full.hash}`;
 if (hostname !== ANALYTICS_HOST) return inApp;
 const moved = oldAddressTarget(full.pathname, full.search);
 const clean = cleanReportPath(full.pathname);
 return moved ? `${moved.pathname}${moved.search}${moved.hash}` : clean ? `${clean}${full.search}${full.hash}` : inApp;
}
