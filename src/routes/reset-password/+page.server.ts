/**
 * Reset Password Page
 * User arrives here after clicking the password reset link in their email.
 * The auth callback route has already exchanged the code for a session.
 */

import { base } from '$app/paths';
import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createSupabaseServerClient } from '$lib/supabase/server-ssr';

export const load: PageServerLoad = async ({ cookies }) => {
	const supabase = createSupabaseServerClient(cookies);
	const {
		data: { user }
	} = await supabase.auth.getUser();

	if (!user) {
		throw redirect(302, `${base}/login`);
	}

	return {};
};

export const actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const password = data.get('password')?.toString();
		const confirmPassword = data.get('confirmPassword')?.toString();

		if (!password || !confirmPassword) {
			return fail(400, { error: 'Both password fields are required' });
		}

		if (password.length < 8) {
			return fail(400, { error: 'Password must be at least 8 characters' });
		}

		if (password !== confirmPassword) {
			return fail(400, { error: 'Passwords do not match' });
		}

		const supabase = createSupabaseServerClient(cookies);
		const { error: authError } = await supabase.auth.updateUser({ password });

		if (authError) {
			console.error('[Reset Password] Error:', authError);
			return fail(500, { error: authError.message });
		}

		throw redirect(303, `${base}/admin/tags`);
	}
} satisfies Actions;
