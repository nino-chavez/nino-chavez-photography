/**
 * Admin authorization (defense-in-depth over authentication).
 *
 * The gallery uses a single-user admin model: admin surfaces (/admin/*, /analytics, /api/admin/*)
 * only confirm a valid Supabase session, relying on signup being DISABLED in the Supabase dashboard
 * so "any authenticated user" == the operator. That assumption is unenforced in code — if signup is
 * ever enabled, any registered user reaches admin endpoints (which run with service_role).
 *
 * `ADMIN_EMAILS` closes that gap: a comma-separated allowlist of admin emails. When set, only those
 * emails pass `isAllowedAdmin`. When UNSET, behavior is unchanged (any authenticated user passes) so
 * a missing env var can never lock the operator out — set ADMIN_EMAILS in the Cloudflare Pages env
 * to activate the allowlist.
 */
import { env } from '$env/dynamic/private';

export function isAllowedAdmin(email: string | null | undefined): boolean {
	const allow = (env.ADMIN_EMAILS ?? '')
		.split(',')
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean);
	if (allow.length === 0) return true; // not configured → preserve legacy single-user behavior
	return !!email && allow.includes(email.toLowerCase());
}
