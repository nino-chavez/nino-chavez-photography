import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ANALYTICS_EXCLUSION_COOKIE, ANALYTICS_LINKED_COOKIE } from '$lib/analytics/preferences-contract';

export const POST: RequestHandler = async ({ request, cookies }) => {
	let body: { linkedAnalytics?: unknown; excludeThisBrowser?: unknown };
	try { body = await request.json(); } catch { throw error(400, 'invalid JSON'); }
	if (!body || typeof body !== 'object' || typeof body.linkedAnalytics !== 'boolean' || typeof body.excludeThisBrowser !== 'boolean') {
		throw error(400, 'invalid analytics preferences');
	}
	cookies.set(ANALYTICS_EXCLUSION_COOKIE, body.excludeThisBrowser ? '1' : '0', {
		path: '/', sameSite: 'lax', secure: true, httpOnly: true, maxAge: 90 * 24 * 60 * 60
	});
	cookies.set(ANALYTICS_LINKED_COOKIE, body.linkedAnalytics && !body.excludeThisBrowser ? '1' : '0', {
		path: '/', sameSite: 'lax', secure: true, httpOnly: true, maxAge: 90 * 24 * 60 * 60
	});
	return json({ ok: true, linkedAnalytics: body.linkedAnalytics, excludeThisBrowser: body.excludeThisBrowser });
};
