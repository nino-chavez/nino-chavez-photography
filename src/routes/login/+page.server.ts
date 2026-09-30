/**
 * Login Page Server Actions
 * Supports password login, magic link, and forgot password flows
 */

import { base } from '$app/paths';
import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createSupabaseServerClient } from '$lib/supabase/server-ssr';
import { SITE_URL } from '$lib/site-url';
import { analyticsAuthCallbackUrl, authReturnPath } from '$lib/server/analytics-auth-redirect';

/**
 * Keep the callback on the initiating analytics host so its verifier cookie
 * can complete sign-in. Routed gallery requests use the canonical gallery URL;
 * the upstream pages.dev origin must never become an email destination.
 * Supabase's redirect allowlist must include both supported callbacks.
 */
function getCallbackUrl(url: URL, next?: string): string {
	return analyticsAuthCallbackUrl(url.hostname, SITE_URL, next);
}

// Check if already logged in
export const load: PageServerLoad = async ({ cookies, url }) => {
	const supabase = createSupabaseServerClient(cookies);
	const {
		data: { user }
	} = await supabase.auth.getUser();

	if (user) {
		throw redirect(302, authReturnPath(url.searchParams.get('next'), url.hostname === 'analytics.ninochavez.co' ? '/gallery' : `${base}/admin/tags`));
	}

	return {};
};

export const actions = {
	login: async ({ request, cookies }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString();
		const password = data.get('password')?.toString();

		if (!email || !password) {
			return fail(400, { error: 'Email and password are required', action: 'login' });
		}

		const supabase = createSupabaseServerClient(cookies);
		const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

		if (authError) {
			console.error('[Login] Auth error:', authError);
			return fail(401, { error: authError.message, action: 'login' });
		}

		throw redirect(303, `${base}/admin/tags`);
	},

	magicLink: async ({ request, cookies, url }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString();

		if (!email) {
			return fail(400, { error: 'Email is required', action: 'magicLink' });
		}

		const supabase = createSupabaseServerClient(cookies);
		const { error: authError } = await supabase.auth.signInWithOtp({
			email,
			options: { emailRedirectTo: getCallbackUrl(url, '/analytics/operator'), shouldCreateUser: false }
		});

		if (authError) {
			console.error('[Login] Magic link error:', authError);
			return fail(500, { error: authError.message, action: 'magicLink' });
		}

		return { success: true, action: 'magicLink' };
	},

	forgotPassword: async ({ request, cookies, url }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString();

		if (!email) {
			return fail(400, { error: 'Email is required', action: 'forgotPassword' });
		}

		const supabase = createSupabaseServerClient(cookies);
		const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
			redirectTo: getCallbackUrl(url, '/reset-password')
		});

		if (authError) {
			console.error('[Login] Password reset error:', authError);
			return fail(500, { error: authError.message, action: 'forgotPassword' });
		}

		return { success: true, action: 'forgotPassword' };
	}
} satisfies Actions;
