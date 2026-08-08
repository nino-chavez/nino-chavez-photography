/**
 * Login Page Server Actions
 * Supports password login, magic link, and forgot password flows
 */

import { base } from '$app/paths';
import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createSupabaseServerClient } from '$lib/supabase/server-ssr';
import { SITE_URL } from '$lib/site-url';

/**
 * Build the auth callback URL from the gallery's public address, NOT `url.origin`.
 *
 * The router refetches this app from nino-chavez-photography.pages.dev, so inside
 * here `url.origin` IS the Pages origin — the same trap already annotated in
 * `albums/[slug]/+page.server.ts` and `+layout.svelte`. This is the one place it
 * was still live, and it broke sign-in outright rather than cosmetically.
 *
 * Supabase ignores a `redirectTo` that is not on the project's Redirect URLs
 * allowlist and silently falls back to the Site URL — no error, on either side.
 * So every magic link carried the unlisted pages.dev callback, got swapped for
 * the Site URL, and landed on the gallery home page holding a `?code=` that no
 * route exchanges. The visitor sees the landing page and stays signed out.
 *
 * `SITE_URL` already ends in the `/photography` base path — see $lib/site-url.
 */
function getCallbackUrl(next?: string): string {
	const callback = `${SITE_URL}/auth/callback`;
	return next ? `${callback}?next=${encodeURIComponent(next)}` : callback;
}

// Check if already logged in
export const load: PageServerLoad = async ({ cookies }) => {
	const supabase = createSupabaseServerClient(cookies);
	const {
		data: { user }
	} = await supabase.auth.getUser();

	if (user) {
		throw redirect(302, `${base}/admin/tags`);
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

	magicLink: async ({ request, cookies }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString();

		if (!email) {
			return fail(400, { error: 'Email is required', action: 'magicLink' });
		}

		const supabase = createSupabaseServerClient(cookies);
		const { error: authError } = await supabase.auth.signInWithOtp({
			email,
			options: { emailRedirectTo: getCallbackUrl() }
		});

		if (authError) {
			console.error('[Login] Magic link error:', authError);
			return fail(500, { error: authError.message, action: 'magicLink' });
		}

		return { success: true, action: 'magicLink' };
	},

	forgotPassword: async ({ request, cookies }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString();

		if (!email) {
			return fail(400, { error: 'Email is required', action: 'forgotPassword' });
		}

		const supabase = createSupabaseServerClient(cookies);
		const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
			redirectTo: getCallbackUrl('/reset-password')
		});

		if (authError) {
			console.error('[Login] Password reset error:', authError);
			return fail(500, { error: authError.message, action: 'forgotPassword' });
		}

		return { success: true, action: 'forgotPassword' };
	}
} satisfies Actions;
