/**
 * Admin authorization (defense-in-depth over authentication).
 *
 * Admin surfaces — /admin/*, /analytics, /api/admin/* — confirm a valid Supabase session AND
 * check this allowlist. Both are required: authentication says who you are, this says whether
 * you are the operator. Everything behind it runs with service_role.
 *
 * FAILS CLOSED. An unset `ADMIN_EMAILS` means nobody is an admin, not everybody.
 *
 * This function used to return `true` when `ADMIN_EMAILS` was unset, on the stated assumption
 * that Supabase signup was disabled, so "any authenticated user" == the operator. Both halves
 * of that assumption were checked on 2026-07-28 and both were false: the project reported
 * `disable_signup: false`, and `ADMIN_EMAILS` was not set on the Pages project. A freshly
 * self-registered account loaded /admin/albums, /admin/tags and /analytics in full.
 *
 * The failure direction is the whole point. A lockout is loud — the operator notices in seconds
 * and sets the variable. An open admin surface is silent, and stayed silent. Denying on missing
 * configuration is the only version of this check that cannot fail unnoticed.
 */
import { env } from '$env/dynamic/private';
import { isAllowedAdminEmail } from './admin-allowlist';

export { isAllowedAdminEmail };

export function isAllowedAdmin(email: string | null | undefined): boolean {
	const raw = env.ADMIN_EMAILS;

	if (!raw?.trim()) {
		// Say it out loud. An operator locked out by a missing variable should find the reason in
		// the logs immediately rather than debugging a 403 with no explanation.
		console.error(
			'[admin-auth] ADMIN_EMAILS is not set — denying all admin access. ' +
				'Set it in the Cloudflare Pages environment and redeploy.'
		);
		return false;
	}

	return isAllowedAdminEmail(email, raw);
}
