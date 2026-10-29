import { error, redirect, type Cookies } from '@sveltejs/kit';
import { base } from '$app/paths';
import { createSupabaseServerClient } from '$lib/supabase/server-ssr';
import { isAllowedAdmin } from '$lib/server/admin-auth';

/** The signed-in owner, or null. Never throws: a page that shows the same aggregate to everyone uses this to decide what else to show. */
export async function currentOperator(cookies: Cookies) {
	const { data: { user } } = await createSupabaseServerClient(cookies).auth.getUser();
	return user && isAllowedAdmin(user.email) ? user : null;
}

/** For a write: the signed-in owner, or a redirect to sign in, or a refusal for someone who is not the owner. */
export async function requireOperator(cookies: Cookies) {
	const { data: { user } } = await createSupabaseServerClient(cookies).auth.getUser();
	if (!user) throw redirect(302, `${base}/login`);
	if (!isAllowedAdmin(user.email)) throw error(403, 'Operator access required');
	return user;
}
