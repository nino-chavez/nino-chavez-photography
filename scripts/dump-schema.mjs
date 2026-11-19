#!/usr/bin/env node
/**
 * Rebuild `supabase/schema.sql`: the gallery database's structure, read from the linked production
 * project. Structure, plus the few configuration rows the app cannot run without; never visitor,
 * photo or album rows. Run with `npm run db:schema` from a checkout that holds the
 * project link (`supabase/.temp`) and the database password the Supabase CLI cached at
 * `supabase link` (DEPLOY.md, "Database").
 *
 * Why the file exists: `supabase/migrations` starts from a schema that was already in production,
 * so the migrations alone cannot create the database. This file is that starting point, current to
 * the newest migration, so a new project can be built from the repository (README, "Database").
 *
 * It holds five parts:
 *   1. the extensions the gallery's own schemas use (`pg_dump --schema` leaves extensions out);
 *   2. `supabase db dump` of the `public` and `analytics_private` schemas;
 *   3. the configuration rows in CONFIG_ROWS below, which a new database needs to work;
 *   4. a plain refresh of each materialized view: the dump creates them WITH NO DATA, and the
 *      scheduled `REFRESH ... CONCURRENTLY` fails on a view that has never been populated;
 *   5. the scheduled jobs, which pg_cron keeps as rows and the dump therefore leaves out.
 *
 * It refuses to write when production and this checkout are at different migrations, when the
 * dumped parts hold anything but structure, or when a configuration value is anything but a plain
 * token or number (`lib/schema-dump-guard.mjs`): the file is public.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { configRowProblems, schemaDumpProblems } from './lib/schema-dump-guard.mjs';

const root = resolve(import.meta.dirname, '..');
const OUTPUT = join(root, 'supabase/schema.sql');
const SCHEMAS = ['public', 'analytics_private'];

/**
 * Rows a working database needs that are configuration, not visitor, photo or album data. Each
 * entry was reviewed: the table, the columns copied, and the key that keeps the insert idempotent.
 */
const CONFIG_ROWS = [
	// Popularity weight per engagement type; the popularity views join on it.
	{ table: 'public.engagement_weights', columns: ['event_type', 'weight'], key: 'event_type' },
	// The site-action refresh updates this receipt row. Its run timestamps are state, not copied.
	{ table: 'public.analytics_site_action_summary_status', columns: ['report_name'], key: 'report_name' }
];

const supabase = (args) => execFileSync('supabase', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
// Supabase CLI 3.x: `--remote` targets the linked project, and `--read-only` runs each query in a
// read-only transaction, which is also what lets a hosted query run without a confirmation prompt.
const cliMajor = Number(supabase(['--version']).trim().split('.')[0]);
if (!(cliMajor >= 3)) {
	console.error('npm run db:schema needs Supabase CLI 3 or later (for `db query --read-only`).');
	process.exit(1);
}
const rows = (sql) => JSON.parse(supabase(['db', 'query', '--remote', '--read-only', '-o', 'json', sql])).rows;
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const identifier = (value) => `"${String(value).replaceAll('"', '""')}"`;

const localHead = readdirSync(join(root, 'supabase/migrations'))
	.filter((name) => name.endsWith('.sql'))
	.map((name) => name.split('_')[0])
	.sort()
	.at(-1);
const [{ latest: productionHead }] = rows('select max(version) as latest from supabase_migrations.schema_migrations');
if (productionHead !== localHead) {
	console.error(`Production is at migration ${productionHead}; this checkout's newest is ${localHead}. Bring them level first.`);
	process.exit(1);
}

const extensions = rows(`select e.extname, n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace
	where n.nspname = any(array[${SCHEMAS.map(literal).join(', ')}]) or e.extname = 'pg_cron' order by e.extname`);
const jobs = rows('select jobname, schedule, command from cron.job order by jobname');
const config = CONFIG_ROWS.map((entry) => ({
	...entry,
	values: rows(`select ${entry.columns.join(', ')} from ${entry.table} order by ${entry.key}`)
}));

const work = mkdtempSync(join(tmpdir(), 'schema-dump-'));
let dump;
try {
	supabase(['db', 'dump', '--remote', '--schema', SCHEMAS.join(','), '-f', join(work, 'dump.sql')]);
	dump = readFileSync(join(work, 'dump.sql'), 'utf8');
} finally {
	rmSync(work, { recursive: true, force: true });
}

// Numbers, including the numeric strings the CLI returns for `numeric` columns, are written bare.
const sqlValue = (value) => (typeof value === 'number' || /^-?\d+(\.\d+)?$/.test(String(value)) ? String(value) : literal(value));
const configSql = config.map(({ table, columns, key, values }) =>
	`INSERT INTO ${table} (${columns.join(', ')}) VALUES\n${values.map((row) => `  (${columns.map((c) => sqlValue(row[c])).join(', ')})`).join(',\n')}\nON CONFLICT (${key}) DO NOTHING;`
);
const materializedViews = [...dump.matchAll(/^CREATE MATERIALIZED VIEW ("[^"]+"\."[^"]+")/gm)].map((match) => match[1]);

const extensionsSql = extensions.map(({ extname, nspname }) =>
	extname === 'pg_cron'
		? `CREATE EXTENSION IF NOT EXISTS ${identifier(extname)};`
		: `CREATE EXTENSION IF NOT EXISTS ${identifier(extname)} WITH SCHEMA ${identifier(nspname)};`
);
const jobsSql = jobs.map(({ jobname, schedule, command }) => `SELECT cron.schedule(${literal(jobname)}, ${literal(schedule)}, ${literal(command)});`);

const problems = [
	...schemaDumpProblems([...extensionsSql, dump, ...jobsSql].join('\n')),
	...config.flatMap(({ table, values }) => configRowProblems(values).map((problem) => `${table} ${problem}`))
];
if (problems.length > 0) {
	console.error(`Refusing to write supabase/schema.sql: ${problems.join('; ')}.`);
	process.exit(1);
}

const sql = [
	'-- The gallery database structure, generated by `npm run db:schema` (scripts/dump-schema.mjs).',
	`-- Read from production at migration ${productionHead}, the newest file in supabase/migrations.`,
	'-- Structure plus the configuration rows in part 3; no visitor, photo or album rows.',
	'-- README "Database" says how to build a new project from it.',
	'',
	'-- 1. Extensions the schemas below use',
	...extensionsSql,
	'',
	`-- 2. Schemas ${SCHEMAS.join(' and ')} (supabase db dump)`,
	dump.trim(),
	'',
	'-- 3. Configuration rows the app needs (CONFIG_ROWS in scripts/dump-schema.mjs)',
	...configSql,
	'',
	'-- 4. Populate the materialized views once, so their scheduled concurrent refreshes can run',
	...materializedViews.map((name) => `REFRESH MATERIALIZED VIEW ${name};`),
	'',
	'-- 5. Scheduled jobs (pg_cron)',
	...jobsSql,
	''
].join('\n');

writeFileSync(OUTPUT, sql);
console.log(`Wrote supabase/schema.sql: ${extensions.length} extensions, ${SCHEMAS.length} schemas, ${config.length} configuration tables, ${materializedViews.length} materialized views, ${jobs.length} scheduled jobs, at migration ${productionHead}.`);
