/**
 * The admin allowlist decision, with no framework imports.
 *
 * Kept separate from `admin-auth.ts` so the rule can be tested directly: `admin-auth.ts` reads
 * `$env/dynamic/private`, which only resolves inside SvelteKit, and a security control this
 * small should not need a framework booted to prove it works. `admin-auth.ts` supplies the
 * configuration; this decides.
 */

/**
 * Is `email` on the allowlist parsed from `rawAllowlist`?
 *
 * FAILS CLOSED: an empty or absent allowlist admits nobody. See `admin-auth.ts` for why that
 * direction is not negotiable — the inverse shipped, and it silently opened the admin surface.
 */
export function isAllowedAdminEmail(
	email: string | null | undefined,
	rawAllowlist: string | undefined | null
): boolean {
	const allow = (rawAllowlist ?? '')
		.split(',')
		.map((entry) => entry.trim().toLowerCase())
		.filter(Boolean);

	if (allow.length === 0) return false;
	// Exact match on the whole address — never a prefix or substring, so a lookalike domain
	// like admin@ninochavez.co.evil.com cannot pass.
	return !!email && allow.includes(email.trim().toLowerCase());
}
