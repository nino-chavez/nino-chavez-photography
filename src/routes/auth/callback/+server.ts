import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { createSupabaseServerClient } from '$lib/supabase/server-ssr';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const next = url.searchParams.get('next') || '/admin/tags';

	if (!code) {
		throw redirect(303, `${base}/login?error=auth_callback_failed`);
	}

	const supabase = createSupabaseServerClient(cookies);
	const { error } = await supabase.auth.exchangeCodeForSession(code);

	if (error) {
		console.error('[Auth Callback] Code exchange failed:', error.message);
		throw redirect(303, `${base}/login?error=auth_callback_failed`);
	}

	throw redirect(303, `${base}${next}`);
};
