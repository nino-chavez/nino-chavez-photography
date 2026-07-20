#!/usr/bin/env node
/**
 * Publish (or unpublish) an album: the album_settings flip that no ingest
 * script owned until now. Ingest leaves an album visibility='unlisted' with
 * gallery_scope=NULL — invisible on ninochavez.co and letspepper.com — and a
 * video-only album has no album_settings row at all. This script owns the
 * flip that was previously a hand-typed REST PATCH (jpo, 2026-07-19).
 *
 *   visibility='public'   → album appears on ninochavez.co/photography
 *   gallery_scope='lpo'   → album appears on letspepper.com/gallery
 *
 * Required env (.env.local): VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   npx tsx scripts/publish-album.ts --album-key jq1Rp7 [--scope lpo] [--dry-run]
 *   npx tsx scripts/publish-album.ts --album-key jq1Rp7 --unpublish
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const arg = (k: string, d?: string) => {
	const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
	if (hit) return hit.split('=').slice(1).join('=');
	const i = process.argv.indexOf(`--${k}`);
	return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};
const ALBUM_KEY = arg('album-key');
const SCOPE = arg('scope', 'lpo');
const DRY = process.argv.includes('--dry-run');
const UNPUBLISH = process.argv.includes('--unpublish');

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('Missing env (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
	process.exit(1);
}
if (!ALBUM_KEY || !/^[a-zA-Z0-9]{5,8}$/.test(ALBUM_KEY)) {
	console.error(`--album-key must be 5-8 alphanumerics (got: ${ALBUM_KEY})`);
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
	const { data: before, error: readErr } = await supabase
		.from('album_settings').select('album_key, visibility, gallery_scope')
		.eq('album_key', ALBUM_KEY).maybeSingle();
	if (readErr) { console.error(`read failed: ${readErr.message}`); process.exit(1); }
	console.log(`before: ${before ? JSON.stringify(before) : 'no album_settings row (video-only album)'}`);

	const target = UNPUBLISH
		? { visibility: 'unlisted', gallery_scope: null }
		: { visibility: 'public', gallery_scope: SCOPE };
	console.log(`target: ${JSON.stringify({ album_key: ALBUM_KEY, ...target })}`);
	if (DRY) { console.log('dry-run — no write'); return; }

	const { error: writeErr } = before
		? await supabase.from('album_settings').update(target).eq('album_key', ALBUM_KEY)
		: await supabase.from('album_settings').insert({ album_key: ALBUM_KEY, ...target });
	if (writeErr) { console.error(`write failed: ${writeErr.message}`); process.exit(1); }

	const { data: after } = await supabase
		.from('album_settings').select('album_key, visibility, gallery_scope')
		.eq('album_key', ALBUM_KEY).maybeSingle();
	console.log(`after:  ${JSON.stringify(after)}`);
	console.log(UNPUBLISH
		? 'unpublished — hidden from both sites'
		: 'published — ninochavez.co (public) + letspepper.com (scope)');
}

main();
