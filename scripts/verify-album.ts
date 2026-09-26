#!/usr/bin/env node
/**
 * Verify an album's ingested rows before publishing it. ENRICHMENT_WORKFLOW.md's "Verify"
 * section used to say "adapt someone's .temp script" — this is the standing replacement.
 *
 * Exports `verifyAlbum()` (a pure read; takes an already-constructed Supabase client) so
 * scripts/publish-album.ts can run the SAME checks as a publish gate instead of duplicating
 * them. The CLI below is a thin wrapper: parse args, build a client, call verifyAlbum, print,
 * exit non-zero on failure.
 *
 * Checks:
 *   - row count equals the file count in --dir (when --dir is given)
 *   - every row has: caption, embedding, image_embedding (the search vector since ADR 0006),
 *     sharpness_measured, cf_image_id, extraction_version, all 4 quality
 *     sub-scores (sharpness/composition_score/exposure_accuracy/emotional_impact), and
 *     play_type when photo_category is "action" (never required otherwise — see taxonomy.ts)
 *   - every row's sport_type equals albums.sport (the album-authoritative mirror, ADR 0002)
 *   - the ingest checkpoint (.temp/ingest-<album-key>.checkpoint.json), if present, has no
 *     entries left in `failed`
 *   - at least one photo_jersey_sightings row exists for the album
 *
 * Usage:
 *   npx tsx scripts/verify-album.ts --album-key xSqPJB [--dir /path/to/album]
 */
import { config } from 'dotenv';
import { resolve, join } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readdir } from 'fs/promises';
import { existsSync, readFileSync, realpathSync } from 'fs';
import { fileURLToPath } from 'url';

export interface VerifyIssue {
	code: string;
	message: string;
}

export interface VerifyResult {
	albumKey: string;
	ok: boolean;
	rowCount: number;
	fileCount: number | null;
	sightingCount: number;
	/** Blocking — a non-empty list means ok=false (this is what the publish gate refuses on). */
	issues: VerifyIssue[];
	/** Informational — surfaced to the operator, never blocks a publish. */
	notes: VerifyIssue[];
}

const REQUIRED_QUALITY_FIELDS = ['sharpness', 'composition_score', 'exposure_accuracy', 'emotional_impact'] as const;

interface PhotoRow {
	photo_id: string;
	image_key: string;
	file_name: string | null;
	caption: string | null;
	embedding: unknown;
	image_embedding: unknown;
	sharpness_measured: number | null;
	photo_category: string | null;
	play_type: string | null;
	cf_image_id: string | null;
	extraction_version: string | null;
	sport_type: string | null;
	sharpness: number | null;
	composition_score: number | null;
	exposure_accuracy: number | null;
	emotional_impact: number | null;
}

/**
 * Run every check against the live DB (and, optionally, a local directory) for one album.
 * Read-only — safe to call from a publish gate, a dry-run, or the CLI below.
 */
export async function verifyAlbum(sb: SupabaseClient, albumKey: string, opts: { dir?: string } = {}): Promise<VerifyResult> {
	const issues: VerifyIssue[] = [];
	const notes: VerifyIssue[] = [];

	const { data: album, error: albumErr } = await sb
		.from('albums')
		.select('album_key, sport')
		.eq('album_key', albumKey)
		.maybeSingle();
	if (albumErr) issues.push({ code: 'album_lookup_failed', message: albumErr.message });
	if (!albumErr && !album) issues.push({ code: 'album_missing', message: `no albums row for album_key="${albumKey}"` });
	const authoritativeSport = (album?.sport ?? null) as string | null;

	const rows: PhotoRow[] = [];
	{
		const page = 1000;
		for (let from = 0; ; from += page) {
			const { data, error } = await sb
				.from('photo_metadata')
				.select(
					'photo_id, image_key, file_name, caption, embedding, image_embedding, sharpness_measured, photo_category, play_type, cf_image_id, extraction_version, sport_type, sharpness, composition_score, exposure_accuracy, emotional_impact'
				)
				.eq('album_key', albumKey)
				.order('photo_id', { ascending: true })
				.range(from, from + page - 1);
			if (error) { issues.push({ code: 'photo_metadata_query_failed', message: error.message }); break; }
			if (!data || data.length === 0) break;
			rows.push(...(data as PhotoRow[]));
			if (data.length < page) break;
		}
	}

	// --- row count vs. local file count -------------------------------------------------------
	let fileCount: number | null = null;
	if (opts.dir) {
		if (!existsSync(opts.dir)) {
			issues.push({ code: 'dir_missing', message: `--dir "${opts.dir}" does not exist` });
		} else {
			const files = (await readdir(opts.dir)).filter((f) => /\.(jpg|jpeg)$/i.test(f));
			fileCount = files.length;
			if (fileCount !== rows.length) {
				issues.push({
					code: 'row_count_mismatch',
					message: `${rows.length} photo_metadata row(s) for ${albumKey} vs. ${fileCount} file(s) in ${opts.dir}`
				});
			}
		}
	}

	// --- per-row field completeness ------------------------------------------------------------
	const missingCaption: string[] = [];
	const missingEmbedding: string[] = [];
	const missingPlayType: string[] = [];
	const missingCfImageId: string[] = [];
	const missingImageEmbedding: string[] = [];
	const missingSharpnessMeasured: string[] = [];
	const missingExtractionVersion: string[] = [];
	const missingQuality: string[] = [];
	const sportMismatch: string[] = [];

	let actionRows = 0;
	for (const r of rows) {
		if (!r.caption || !r.caption.trim()) missingCaption.push(r.photo_id);
		if (r.embedding == null) missingEmbedding.push(r.photo_id);
		if (r.image_embedding == null) missingImageEmbedding.push(r.photo_id);
		if (r.sharpness_measured == null) missingSharpnessMeasured.push(r.photo_id);
		if (r.photo_category === 'action') {
			actionRows++;
			if (!r.play_type) missingPlayType.push(r.photo_id);
		}
		if (!r.cf_image_id) missingCfImageId.push(r.photo_id);
		if (!r.extraction_version) missingExtractionVersion.push(r.photo_id);
		if (REQUIRED_QUALITY_FIELDS.some((f) => r[f] == null)) missingQuality.push(r.photo_id);
		if ((r.sport_type ?? null) !== authoritativeSport) sportMismatch.push(r.photo_id);
	}

	const report = (code: string, ids: string[], label: string) => {
		if (ids.length === 0) return;
		issues.push({
			code,
			message: `${ids.length}/${rows.length} row(s) ${label}: ${ids.slice(0, 10).join(', ')}${ids.length > 10 ? ', …' : ''}`
		});
	};
	report('missing_caption', missingCaption, 'missing a caption');
	report('missing_embedding', missingEmbedding, 'missing an embedding');
	report('missing_image_embedding', missingImageEmbedding, 'missing an image_embedding (the semantic-search vector, ADR 0006)');
	report('missing_sharpness_measured', missingSharpnessMeasured, 'missing sharpness_measured');
	report('missing_cf_image_id', missingCfImageId, 'missing cf_image_id');
	report('missing_extraction_version', missingExtractionVersion, 'missing extraction_version');
	report('missing_quality_subscores', missingQuality, 'missing one or more quality sub-scores');
	report('sport_type_mismatch', sportMismatch, `have sport_type != albums.sport ("${authoritativeSport ?? 'none'}")`);

	// play_type is a SOFT check, not a hard one: the extraction prompt explicitly allows an
	// action shot with no play_type ("if none fit, null" — src/lib/ai/ingest-extraction.ts).
	// Verified empirically against every real ingest-v2 album live (2026-09-25): this is 2.6%-10.8%
	// of action rows on every one of them, so treating any occurrence as a hard failure would make
	// this check fail on 100% of real albums and turn --force into the default, not the exception.
	// It only blocks when the fraction is high enough to suggest a genuine extraction problem
	// (wrong sport passed, systematic model failure) rather than the expected "no play fits" tail.
	if (missingPlayType.length > 0) {
		const fraction = actionRows > 0 ? missingPlayType.length / actionRows : 0;
		const msg = `${missingPlayType.length}/${actionRows} action row(s) have no play_type (${(fraction * 100).toFixed(0)}%): ${missingPlayType.slice(0, 10).join(', ')}${missingPlayType.length > 10 ? ', …' : ''}`;
		const PLAY_TYPE_FAIL_THRESHOLD = 0.5;
		if (fraction > PLAY_TYPE_FAIL_THRESHOLD) issues.push({ code: 'missing_play_type', message: msg });
		else notes.push({ code: 'missing_play_type', message: msg });
	}

	// --- checkpoint has no recorded failures ----------------------------------------------------
	const ckPath = join('.temp', `ingest-${albumKey}.checkpoint.json`);
	if (existsSync(ckPath)) {
		try {
			const ck = JSON.parse(readFileSync(ckPath, 'utf-8')) as { failed?: Record<string, string> };
			const failedKeys = Object.keys(ck.failed ?? {});
			if (failedKeys.length > 0) {
				issues.push({
					code: 'checkpoint_has_failures',
					message: `${ckPath} still lists ${failedKeys.length} failed image_key(s): ${failedKeys.slice(0, 10).join(', ')}${failedKeys.length > 10 ? ', …' : ''}`
				});
			}
		} catch (e) {
			issues.push({ code: 'checkpoint_unreadable', message: `${ckPath}: ${(e as Error).message}` });
		}
	} else {
		// Not a failure — a checkpoint only exists in the CWD an ingest run wrote it from (e.g. the
		// main checkout, not necessarily wherever verify-album runs), and a fully-completed run may
		// have none. Say so rather than silently passing without having checked anything.
		notes.push({ code: 'checkpoint_absent', message: `no checkpoint at ${ckPath} in this working directory — skipped (not checked, not a pass)` });
	}

	// --- sightings exist ------------------------------------------------------------------------
	const { count: sightingCount, error: sightingErr } = await sb
		.from('photo_jersey_sightings')
		.select('sighting_id', { count: 'exact', head: true })
		.eq('album_key', albumKey);
	if (sightingErr) issues.push({ code: 'sightings_query_failed', message: sightingErr.message });
	else if (!sightingCount) issues.push({ code: 'no_sightings', message: `0 photo_jersey_sightings rows for album_key="${albumKey}"` });

	return {
		albumKey,
		ok: issues.length === 0,
		rowCount: rows.length,
		fileCount,
		sightingCount: sightingCount ?? 0,
		issues,
		notes
	};
}

// ---------------------------------------------------------------------------
// CLI wrapper — only runs when this file is executed directly, not imported.
// realpath on BOTH sides: a plain URL/argv string compare silently reads false (CLI does
// nothing, exits 0 — a false PASS for a gate script) across a symlinked path, e.g. macOS
// /var -> /private/var, or when node resolves argv[1] differently than import.meta.url does.
// ---------------------------------------------------------------------------
const isMain = (() => {
	try {
		return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? '');
	} catch {
		return false;
	}
})();

if (isMain) {
	const arg = (k: string): string | undefined => {
		const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
		if (hit) return hit.split('=').slice(1).join('=');
		const i = process.argv.indexOf(`--${k}`);
		return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : undefined;
	};
	const ALBUM_KEY = arg('album-key');
	const DIR = arg('dir');
	if (!ALBUM_KEY) {
		console.error('Usage: npx tsx scripts/verify-album.ts --album-key <KEY> [--dir <photo-dir>]');
		process.exit(1);
	}
	const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
	verifyAlbum(sb, ALBUM_KEY, { dir: DIR })
		.then((result) => {
			console.log(`\nVerify ${result.albumKey}: ${result.rowCount} row(s)${result.fileCount != null ? `, ${result.fileCount} file(s)` : ''}, ${result.sightingCount} sighting(s)`);
			for (const note of result.notes) console.log(`   ℹ️  [${note.code}] ${note.message}`);
			if (result.ok) {
				console.log('✅ PASS — no blocking issues\n');
				process.exit(0);
			}
			console.error(`❌ FAIL — ${result.issues.length} issue(s):`);
			for (const issue of result.issues) console.error(`   - [${issue.code}] ${issue.message}`);
			console.error('');
			process.exit(1);
		})
		.catch((e) => {
			console.error('Fatal:', e instanceof Error ? e.message : e);
			process.exit(1);
		});
}
