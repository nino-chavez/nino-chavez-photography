#!/usr/bin/env node
/**
 * Publish (or unpublish) an album: the album_settings flip that no ingest
 * script owned until now. Ingest leaves an album visibility='unlisted' with
 * gallery_scope=NULL — invisible on ninochavez.co and letspepper.com — and a
 * video-only album has no album_settings row at all. This script owns the
 * flip that was previously a hand-typed REST PATCH (jpo, 2026-07-19).
 *
 *   visibility='public'   → album appears on ninochavez.co/photography
 *   gallery_scope='lpo'   → album ALSO appears on letspepper.com/gallery (opt-in;
 *                           only for Let's Pepper series events)
 *
 * PUBLISH GATE: before flipping visibility='public' this runs the same checks as
 * `scripts/verify-album.ts` (imported, not duplicated) — caption/embedding/quality-scores/
 * cf_image_id/extraction_version completeness, sport_type == albums.sport, no failed checkpoint
 * entries, sightings exist. A failing album is refused unless `--force "<reason>"` is passed;
 * the reason is printed (to the run's own output, not silently swallowed) so a forced publish
 * is never invisible in the log. --unpublish is never gated — hiding a bad album is always safe.
 *
 * ANNOUNCE: when an album goes from hidden to public, this starts the standing "gallery-announce"
 * campaign (Nino, 2026-09-25/26): it runs the Let's Pepper social publisher's builder, which picks
 * the photos, writes the caption and alt text, queues the carousel HELD for 12 hours and sends the
 * phone alert with the veto command, then seeds the item into the posting Worker's queue. The
 * series (which account posts) comes from this album's own gallery_scope: 'lpo' posts from
 * letspepper.open, anything else from nino.chavez.photo, with flickday.media as a Collab.
 * Re-publishing an already-public album does not announce it again; pass --announce to announce
 * one anyway (the builder refuses a duplicate queue item, so a repeat is harmless), or
 * --no-announce to publish without it. The builder lives in the letspepper repo; set
 * LETSPEPPER_SOCIAL_DIR if it is not at ~/Workspace/dev/apps/letspepper/scripts/social-publish.
 * A missing builder is skipped with a notice; a failed build exits 2 after the publish succeeded.
 *
 * Required env (.env.local): VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   npx tsx scripts/publish-album.ts --album-key jq1Rp7 [--dry-run]
 *   npx tsx scripts/publish-album.ts --album-key jq1Rp7 --scope lpo   # Let's Pepper events only
 *   npx tsx scripts/publish-album.ts --album-key jq1Rp7 --unpublish
 *   npx tsx scripts/publish-album.ts --album-key jq1Rp7 --force "reviewed the 3 flagged rows by hand"
 *   npx tsx scripts/publish-album.ts --album-key jq1Rp7 --announce      # announce an already-public album
 *   npx tsx scripts/publish-album.ts --album-key jq1Rp7 --no-announce   # publish without the social post
 */
import { config } from 'dotenv';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { execFileSync } from 'child_process';

// Paths resolve from this file, not the shell's working directory, so the script runs the same
// from any folder (it was being run from ~ and failing to find .env.local).
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(REPO_ROOT, '.env.local') });
import { createClient } from '@supabase/supabase-js';
import { verifyAlbum } from './verify-album';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const arg = (k: string, d?: string) => {
	const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
	if (hit) return hit.split('=').slice(1).join('=');
	const i = process.argv.indexOf(`--${k}`);
	return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};
const ALBUM_KEY = arg('album-key');
/**
 * gallery_scope is OPT-IN. It defaults to null so publishing means "public on
 * ninochavez.co" and nothing more; cross-posting an album to letspepper.com is a
 * separate editorial decision that has to be typed (`--scope lpo`). The old default
 * of 'lpo' silently put every published album — including events with no connection
 * to the Let's Pepper series — onto letspepper.com/gallery.
 */
const SCOPE = arg('scope', undefined) ?? null;
const DRY = process.argv.includes('--dry-run');
const UNPUBLISH = process.argv.includes('--unpublish');
// --force must carry a reason (a bare `--force` is rejected below) — see the publish-gate note above.
const FORCE_PRESENT = process.argv.includes('--force') || process.argv.some((a) => a.startsWith('--force='));
const FORCE_REASON = arg('force');
const ANNOUNCE_FORCED = process.argv.includes('--announce');
const NO_ANNOUNCE = process.argv.includes('--no-announce');
const SOCIAL_DIR = process.env.LETSPEPPER_SOCIAL_DIR || join(homedir(), 'Workspace/dev/apps/letspepper/scripts/social-publish');

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error('Missing env (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
	process.exit(1);
}
if (!ALBUM_KEY || !/^[a-zA-Z0-9]{5,8}$/.test(ALBUM_KEY)) {
	console.error(`--album-key must be 5-8 alphanumerics (got: ${ALBUM_KEY})`);
	process.exit(1);
}
if (ANNOUNCE_FORCED && (NO_ANNOUNCE || process.argv.includes('--unpublish'))) {
	console.error('--announce cannot be combined with --no-announce or --unpublish');
	process.exit(1);
}
if (FORCE_PRESENT && !FORCE_REASON) {
	console.error('--force requires a reason: --force "why this is safe to publish despite failing verification"');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
	// Publish gate (never applied to --unpublish — hiding an album is always safe).
	if (!UNPUBLISH) {
		const result = await verifyAlbum(supabase, ALBUM_KEY!);
		console.log(`verify: ${result.rowCount} row(s), ${result.sightingCount} sighting(s) — ${result.ok ? 'PASS' : `FAIL (${result.issues.length} issue(s))`}`);
		for (const note of result.notes) console.log(`   ℹ️  [${note.code}] ${note.message}`);
		if (!result.ok) {
			for (const issue of result.issues) console.log(`   - [${issue.code}] ${issue.message}`);
			if (!FORCE_REASON) {
				console.error(`\nrefusing to publish — verify-album failed. Re-run with --force "<reason>" to publish anyway.`);
				process.exit(1);
			}
			console.log(`\n⚠️  publishing despite failed verification — forced, reason: "${FORCE_REASON}"`);
		}
	}

	const { data: before, error: readErr } = await supabase
		.from('album_settings').select('album_key, visibility, gallery_scope')
		.eq('album_key', ALBUM_KEY).maybeSingle();
	if (readErr) { console.error(`read failed: ${readErr.message}`); process.exit(1); }
	console.log(`before: ${before ? JSON.stringify(before) : 'no album_settings row (video-only album)'}`);

	const target = UNPUBLISH
		? { visibility: 'unlisted', gallery_scope: null }
		: { visibility: 'public', gallery_scope: SCOPE };
	console.log(`target: ${JSON.stringify({ album_key: ALBUM_KEY, ...target })}`);
	const willAnnounce = !UNPUBLISH && !NO_ANNOUNCE && (ANNOUNCE_FORCED || before?.visibility !== 'public');
	if (DRY) {
		console.log('dry-run — no write');
		if (willAnnounce) console.log(`would announce: ${SOCIAL_DIR}/build-gallery-announce.mjs --album-key ${ALBUM_KEY} --series ${SCOPE === 'lpo' ? 'lpo' : 'other'}`);
		return;
	}

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
		: SCOPE
			? `published — ninochavez.co (public) + letspepper.com (gallery_scope=${SCOPE})`
			: 'published — ninochavez.co (public); no gallery_scope, so it does NOT appear on letspepper.com');

	if (!willAnnounce) {
		if (!UNPUBLISH && !NO_ANNOUNCE) console.log('announce: skipped — the album was already public (pass --announce to announce it anyway)');
		return;
	}
	announce(after?.gallery_scope === 'lpo' ? 'lpo' : 'other');
}

/** Build the held carousel (phone alert included) and seed it into the posting Worker's queue. */
function announce(series: 'lpo' | 'other'): void {
	const builder = join(SOCIAL_DIR, 'build-gallery-announce.mjs');
	if (!existsSync(builder)) {
		console.log(`announce: skipped — no builder at ${builder} (set LETSPEPPER_SOCIAL_DIR, or pull the letspepper repo)`);
		return;
	}
	const steps: string[][] = [
		[builder, '--album-key', ALBUM_KEY!, '--series', series],
		[join(SOCIAL_DIR, 'seed-kv.mjs'), '--event', 'gallery-announce', '--append', '--put'],
	];
	console.log(`\nannounce: ${series === 'lpo' ? 'letspepper.open' : 'nino.chavez.photo'} + flickday.media Collab, held 12h`);
	for (const step of steps) {
		try {
			execFileSync(process.execPath, step, { cwd: SOCIAL_DIR, stdio: 'inherit' });
		} catch {
			console.error(`\nannounce FAILED at: node ${step.join(' ')}`);
			console.error('The album IS published. Fix the cause, then re-run with --announce (a duplicate queue item is refused, so it is safe).');
			process.exit(2);
		}
	}
}

main();
