import { randomUUID } from 'node:crypto';
import { dev } from '$app/environment';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { env } from '$env/dynamic/private';
import { ANALYTICS_EXCLUSION_COOKIE, ANALYTICS_IDENTITY_COOKIE, ANALYTICS_LINKED_COOKIE, verifiedAnalyticsIdentityBinding, issueAnalyticsIdentityBinding } from '$lib/analytics/preferences-contract';

export const POST: RequestHandler = async ({ request, cookies }) => {
	let body: { linkedAnalytics?: unknown; excludeThisBrowser?: unknown };
	try { body = await request.json(); } catch { throw error(400, 'invalid JSON'); }
	if (!body || typeof body !== 'object' || typeof body.linkedAnalytics !== 'boolean' || typeof body.excludeThisBrowser !== 'boolean') {
		throw error(400, 'invalid analytics preferences');
	}
	const secret = env.ANALYTICS_IDENTITY_BINDING_SECRET?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim();
	const withdrawing = !body.linkedAnalytics || body.excludeThisBrowser;
	if (withdrawing) {
		const browserId = verifiedAnalyticsIdentityBinding(cookies.get(ANALYTICS_IDENTITY_COOKIE), secret);
		if (browserId) {
			const { error: revokeError } = await createSupabaseAdminClient().rpc('analytics_revoke_browser_exports_v2', { p_browser_id: browserId });
			// No cookie update on failure: the client retains the local identity and retries safely.
			if (revokeError) return json({ ok: false, error: 'revocation_unavailable' }, { status: 503 });
		}
	} else {
		// Issue the browser binding before linked collection starts. Never sign a visitor-supplied ID.
		const existingBrowserId = verifiedAnalyticsIdentityBinding(cookies.get(ANALYTICS_IDENTITY_COOKIE), secret);
		const browserId = existingBrowserId ?? randomUUID();
		const binding = issueAnalyticsIdentityBinding(browserId, secret ?? '');
		if (!binding) return json({ ok: false, error: 'consent_unavailable' }, { status: 503 });
		if (!existingBrowserId) cookies.set(ANALYTICS_IDENTITY_COOKIE, binding, { path: '/', sameSite: 'lax', secure: !dev, httpOnly: true, maxAge: 90 * 24 * 60 * 60 });
	}
	cookies.set(ANALYTICS_EXCLUSION_COOKIE, body.excludeThisBrowser ? '1' : '0', {
		path: '/', sameSite: 'lax', secure: !dev, httpOnly: true, maxAge: 90 * 24 * 60 * 60
	});
	cookies.set(ANALYTICS_LINKED_COOKIE, body.linkedAnalytics && !body.excludeThisBrowser ? '1' : '0', {
		path: '/', sameSite: 'lax', secure: !dev, httpOnly: true, maxAge: 90 * 24 * 60 * 60
	});
	if (withdrawing) cookies.delete(ANALYTICS_IDENTITY_COOKIE, { path: '/' });
	return json({ ok: true, linkedAnalytics: body.linkedAnalytics && !body.excludeThisBrowser, excludeThisBrowser: body.excludeThisBrowser });
};
