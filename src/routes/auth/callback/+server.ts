import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { createSupabaseServerClient } from '$lib/supabase/server-ssr';
import { authReturnPath } from '$lib/server/analytics-auth-redirect';
import { ANALYTICS_HOST } from '$lib/analytics/report-paths';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies, setHeaders }) => {
 setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
 const code = url.searchParams.get('code');
 const tokenHash = url.searchParams.get('token_hash');
 const type = url.searchParams.get('type');
 const next = authReturnPath(url.searchParams.get('next'), url.hostname === ANALYTICS_HOST ? '/analytics/home' : '/admin/tags');
 if (!code && !(tokenHash && (type === 'magiclink' || type === 'recovery' || type === 'email'))) redirect(303, `${base}/login?error=auth_callback_failed`);
 const supabase = createSupabaseServerClient(cookies);
 // Supports Supabase's server-side token-hash email template as well as the
 // existing PKCE flow. Token-hash links do not require the sending browser's
 // verifier cookie. No token, session, or email is logged.
 const { error } = tokenHash && (type === 'magiclink' || type === 'recovery' || type === 'email')
  ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
  : await supabase.auth.exchangeCodeForSession(code!);
 if (error) redirect(303, `${base}/login?error=auth_callback_failed`);
 redirect(303, `${base}${next}`);
};
