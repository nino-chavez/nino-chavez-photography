#!/usr/bin/env node
/**
 * Audits the LIVE DATABASE against src/lib/ai/taxonomy.ts.
 *
 * `taxonomy-check.ts` is a different job and does not cover this. It re-renders the
 * generated artifacts and asserts the committed FILES match the source — which says
 * nothing about whether the database ever adopted them. It does not, and never has:
 * `photo_category` is `varchar` and `play_type` is `text`, so `photo_category_enum`
 * and `play_type_enum` are created by the generated SQL and used by no column.
 *
 * Two independent checks, both read-only:
 *
 *   1. VALUES  — every distinct value in each enrichment column is in its vocabulary.
 *   2. PAIRS   — every play_type belongs to its row's sport (PLAY_TYPES_BY_SPORT).
 *   3. GUARDS  — no CHECK constraint contains NULL inside an `ANY(ARRAY[...])`.
 *
 * Check 2 is the one that generalizes, and it is why check 1 was needed at all.
 * `x = ANY(ARRAY['a','b',NULL])` evaluates to NULL when x matches nothing, and a CHECK
 * passes on NULL — only FALSE rejects. So one stray NULL in the list makes a constraint
 * accept every value while still reporting `convalidated: true`. `valid_play_type` is
 * written that way and has never rejected anything; `valid_sport_type`, written
 * `sport_type IS NULL OR sport_type IN (...)`, works. The data shows it exactly:
 * sport_type has zero out-of-vocabulary values, play_type has forty.
 *
 * NOT WIRED INTO `npm run build` OR `npm run check`, deliberately: it needs live
 * service-role credentials that a build environment has no business holding, and it
 * fails today on a backlog that is a product decision, not a code fix. A gate that
 * always fails gets ignored, then deleted. Run it by hand: `npm run taxonomy:audit`.
 *
 * Exits 1 on any finding so it can gate a cleanup once the backlog is resolved.
 */

import { createClient } from '@supabase/supabase-js';
import {
	SPORTS,
	PHOTO_CATEGORIES,
	ALL_PLAY_TYPES,
	PLAY_TYPES_BY_SPORT
} from '../src/lib/ai/taxonomy';

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
	console.error(
		'taxonomy-audit needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.\n' +
			'  with-secret "Supabase photography" -- npm run taxonomy:audit'
	);
	process.exit(2);
}

const db = createClient(url, key, { auth: { persistSession: false } });

async function query<T>(sql: string): Promise<T[]> {
	const { data, error } = await db.rpc('exec_sql', { sql });
	if (error) throw new Error(`${error.message}\n  sql: ${sql}`);
	return (data ?? []) as T[];
}

/** Renders a JS string array as a SQL literal list. */
const sqlList = (values: readonly string[]) =>
	values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ');

const COLUMNS: Array<{ column: string; vocabulary: readonly string[] }> = [
	{ column: 'sport_type', vocabulary: SPORTS },
	{ column: 'photo_category', vocabulary: PHOTO_CATEGORIES },
	{ column: 'play_type', vocabulary: ALL_PLAY_TYPES }
];

let findings = 0;

console.log('taxonomy audit — live database vs src/lib/ai/taxonomy.ts\n');

// --- 1. values ---------------------------------------------------------------
for (const { column, vocabulary } of COLUMNS) {
	const rows = await query<{ val: string; n: number }>(
		`select ${column} as val, count(*)::int as n from photo_metadata
		 where ${column} is not null and ${column} not in (${sqlList(vocabulary)})
		 group by 1 order by 2 desc`
	);
	if (rows.length === 0) {
		console.log(`  ok    ${column}: every value is in the vocabulary (${vocabulary.length} allowed)`);
		continue;
	}
	findings += rows.length;
	const total = rows.reduce((sum, r) => sum + r.n, 0);
	console.log(
		`  FAIL  ${column}: ${rows.length} value(s) outside the vocabulary, ${total} row(s)`
	);
	for (const r of rows.slice(0, 12)) console.log(`          ${r.n.toString().padStart(6)}  ${r.val}`);
	if (rows.length > 12) console.log(`          … and ${rows.length - 12} more`);
}

// --- 2. pairs ----------------------------------------------------------------
// The flat vocabulary cannot say `spike` is meaningless on a basketball photo. This is
// the half of the rule taxonomy.ts always described and nothing enforced until
// `valid_play_for_sport`. A play on a row with NO sport counts as a violation too.
{
	const arms = Object.entries(PLAY_TYPES_BY_SPORT)
		.filter(([, plays]) => plays.length > 0)
		.map(([sport, plays]) => `(sport_type = '${sport}' AND play_type IN (${sqlList(plays)}))`);
	const rows = await query<{ sport: string; play_type: string; n: number }>(
		`select coalesce(sport_type, '(no sport)') as sport, play_type, count(*)::int as n
		 from photo_metadata
		 where play_type is not null and not (sport_type is not null and (${arms.join(' or ')}))
		 group by 1, 2 order by 3 desc`
	);
	console.log('');
	if (rows.length === 0) {
		console.log('  ok    pairs: every play_type belongs to its row\'s sport');
	} else {
		findings += rows.length;
		const total = rows.reduce((sum, r) => sum + r.n, 0);
		console.log(`  FAIL  pairs: ${rows.length} sport/play combination(s) impossible, ${total} row(s)`);
		for (const r of rows.slice(0, 12)) {
			console.log(`          ${r.n.toString().padStart(6)}  ${r.sport} / ${r.play_type}`);
		}
		if (rows.length > 12) console.log(`          … and ${rows.length - 12} more`);
	}
}

// --- 3. guards ---------------------------------------------------------------
// A CHECK is inert when its predicate can only be TRUE or NULL. The reachable way to
// write that by accident is a NULL literal inside the ANY(ARRAY[...]) it compares to.
const constraints = await query<{ conname: string; def: string; table: string }>(
	`select rel.relname as table, con.conname, pg_get_constraintdef(con.oid) as def
	 from pg_constraint con
	 join pg_class rel on rel.oid = con.conrelid
	 join pg_namespace n on n.oid = rel.relnamespace
	 where n.nspname = 'public' and con.contype = 'c'
	 order by rel.relname, con.conname`
);

const inert = constraints.filter((c) => /ANY\s*\(\s*ARRAY\[[^\]]*\bNULL\b/i.test(c.def));

console.log('');
if (inert.length === 0) {
	console.log(`  ok    guards: none of ${constraints.length} CHECK constraint(s) are inert`);
} else {
	findings += inert.length;
	console.log(`  FAIL  guards: ${inert.length} CHECK constraint(s) accept every value`);
	for (const c of inert) {
		console.log(`          ${c.table}.${c.conname}`);
		console.log(`          ${c.def}`);
		console.log(
			`          NULL inside ANY(ARRAY[…]) — a non-matching value yields NULL, and a\n` +
				`          CHECK passes on NULL. Rewrite as \`col IS NULL OR col IN (…)\`, the\n` +
				`          shape valid_sport_type already uses.`
		);
	}
}

console.log('');
if (findings > 0) {
	console.log(`${findings} finding(s). Nothing was modified — this audit is read-only.`);
	process.exit(1);
}
console.log('No findings.');
