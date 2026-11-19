/**
 * `supabase/schema.sql` is committed to a public repository. It may hold structure only: no rows,
 * no credential, no personal address. `scripts/dump-schema.mjs` refuses to write a dump that fails
 * any of these checks; `schema-dump-guard.test.mjs` proves each check fires.
 */

// Data rows are top-level statements at column 0: `COPY ... FROM stdin;`, or `INSERT INTO
// <schema>.<table> ... VALUES` (`supabase db dump --data-only` writes these). An INSERT inside a
// function body is indented code, not a row, and is allowed.
const CHECKS = [
	['data rows (COPY)', /^COPY\s.+\sFROM\s+stdin;\s*$/m],
	['data rows (INSERT)', /^INSERT INTO\s+"?[A-Za-z_]\w*"?\."?\w+"?\s.*\bVALUES\b/m],
	['data rows (pg_dump TABLE DATA section)', /^-- Data for Name: .*; Type: TABLE DATA;/m],
	['a JSON Web Token', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
	['a Supabase or Stripe key', /\b(sb_(secret|publishable)_|sk_(live|test)_)[A-Za-z0-9_-]{10,}/],
	['a private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
	['a bearer token', /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/],
	['an email address', /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/]
];

/** Every reason this SQL must not be committed; empty when it is structure only. */
export function schemaDumpProblems(sql) {
	return CHECKS.filter(([, pattern]) => pattern.test(sql)).map(([what]) => `contains ${what}`);
}

/**
 * Configuration rows copied from production (CONFIG_ROWS in `dump-schema.mjs`) may hold only
 * numbers (or numeric strings) and short lowercase tokens such as `download` or `site_actions`, so no free text, address
 * or credential can ride along. An empty table is a problem too: a new database would lack it.
 */
const TOKEN = /^[a-z][a-z0-9_]{0,63}$/;
// `supabase db query -o json` returns PostgreSQL numeric values as strings, such as "4" or "1.5".
const NUMERIC = /^-?\d{1,15}(\.\d{1,15})?$/;
export function configRowProblems(rows) {
	if (rows.length === 0) return ['has no rows'];
	const bad = rows.flatMap((row) =>
		Object.entries(row).filter(([, value]) => !(Number.isFinite(value) || (typeof value === 'string' && (TOKEN.test(value) || NUMERIC.test(value)))))
	);
	return bad.length === 0 ? [] : [`has values that are not numbers or plain tokens (columns ${[...new Set(bad.map(([column]) => column))].join(', ')})`];
}
