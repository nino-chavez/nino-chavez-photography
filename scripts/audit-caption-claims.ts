#!/usr/bin/env node
/**
 * Read-only audit of stored AI captions against the same contract enforced at
 * ingest. Requires .env.local Supabase credentials. It never changes rows.
 *
 * Usage:
 *   npx tsx scripts/audit-caption-claims.ts
 *   npx tsx scripts/audit-caption-claims.ts --json
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve(process.cwd(), '.env.local'), quiet: true });
import { createClient } from '@supabase/supabase-js';
import { inspectCaption } from '../src/lib/ai/caption-contract';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
	console.error('Supabase credentials required (.env.local: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
	process.exit(2);
}

interface Row {
	photo_id: string;
	image_key: string;
	album_key: string;
	caption: string;
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const rows: Row[] = [];
const pageSize = 1000;
for (let from = 0; ; from += pageSize) {
	const { data, error } = await sb
		.from('photo_metadata')
		.select('photo_id,image_key,album_key,caption')
		.not('caption', 'is', null)
		.order('photo_id', { ascending: true })
		.range(from, from + pageSize - 1);
	if (error) throw new Error(`caption fetch: ${error.message}`);
	if (!data?.length) break;
	rows.push(...data as Row[]);
	if (data.length < pageSize) break;
}

const findings = rows.flatMap((row) => inspectCaption(row.caption).map((issue) => ({
	photo_id: row.photo_id,
	image_key: row.image_key,
	album_key: row.album_key,
	caption: row.caption,
	...issue
})));

const counts = Object.fromEntries(
	[...new Set(findings.map((item) => item.code))].sort().map((code) => [code, findings.filter((item) => item.code === code).length])
);
const report = { captionsScanned: rows.length, captionsFlagged: new Set(findings.map((item) => item.photo_id)).size, findings: findings.length, counts, items: findings };

if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
	console.log(`caption claims audit: ${findings.length ? 'REVIEW' : 'PASS'}`);
	console.log(`${rows.length} caption(s) scanned · ${report.captionsFlagged} caption(s) flagged · ${findings.length} finding(s)`);
	for (const [code, count] of Object.entries(counts)) console.log(`${code}: ${count}`);
	for (const item of findings) console.log(`${item.code}\t${item.photo_id}\t${item.album_key}\t${item.caption}`);
}

if (findings.length) process.exitCode = 1;
