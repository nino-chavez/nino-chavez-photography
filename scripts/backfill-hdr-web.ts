#!/usr/bin/env node
/**
 * Build and upload web-sized HDR copies for an already-ingested album.
 *
 * This deliberately owns only the HDR recovery path. It reads existing photo IDs, matches the
 * local files with ingest's file-name-first rule, and writes `hdr_web_available` only after the
 * deterministic R2 object upload succeeds. It never uploads Cloudflare Images or calls AI.
 *
 * Each local file must be byte-identical to the file the row was ingested from (its stored
 * content_hash), so the HDR copy never shows different pixels from the Cloudflare copy beside it.
 * A changed file needs `ingest-album.ts --replace`; a row with no stored hash needs
 * --allow-unhashed, an explicit statement that the operator checked the pairing by hand.
 * Usage:
 *   npx tsx scripts/backfill-hdr-web.ts --dir /path/to/album --album-key DWdCET [--dry-run] [--allow-unhashed]
 */
import { config } from 'dotenv';
import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

import { hasGainMap } from '../src/lib/ai/hdr-gainmap';
import { buildWebHdrCopy } from '../src/lib/ai/hdr-resize';
import { buildUploadAndMarkHdr, checkSourceMatchesRow, matchLocalFilesToRows, type HdrBackfillRow } from '../src/lib/ingest/hdr-web-backfill';
import { indexRowsByLocalPhotoKey, stripJpegExtension } from '../src/lib/ingest/local-photo-match';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(REPO_ROOT, '.env.local') });

function flagValue(name: string): string | undefined {
	const equalsForm = process.argv.find((arg) => arg.startsWith(`--${name}=`));
	if (equalsForm) return equalsForm.slice(name.length + 3);
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')
		? process.argv[index + 1]
		: undefined;
}

function die(message: string): never {
	console.error(`ERROR: ${message}`);
	process.exit(1);
}

const DIR = flagValue('dir');
const ALBUM_KEY = flagValue('album-key');
const DRY_RUN = process.argv.includes('--dry-run');
const ALLOW_UNHASHED = process.argv.includes('--allow-unhashed');
const HDR_R2_BUCKET = process.env.CF_HDR_R2_BUCKET || 'photo-gallery-hdr';

if (!DIR || !ALBUM_KEY) {
	die('Usage: npx tsx scripts/backfill-hdr-web.ts --dir <photo-dir> --album-key <album-key> [--dry-run]');
}
if (!existsSync(DIR)) die(`Local photo directory does not exist: ${DIR}`);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
	die('Supabase credentials required (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function uploadHdrToR2(photoId: string, buffer: Buffer): Promise<boolean> {
	const temporaryDirectory = mkdtempSync(join(tmpdir(), 'nino-hdr-web-'));
	const temporaryPath = join(temporaryDirectory, `${photoId}.jpg`);
	writeFileSync(temporaryPath, buffer);
	try {
		execFileSync(
			'wrangler',
			[
				'r2',
				'object',
				'put',
				`${HDR_R2_BUCKET}/hdr/${photoId}.jpg`,
				'--file',
				temporaryPath,
				'--content-type',
				'image/jpeg',
				'--remote'
			],
			{ stdio: 'ignore' }
		);
		return true;
	} catch (error) {
		console.error(`  R2 upload failed for ${photoId}: ${(error as Error).message}`);
		return false;
	} finally {
		rmSync(temporaryDirectory, { recursive: true, force: true });
	}
}

async function loadPendingRows(): Promise<HdrBackfillRow[]> {
	const { data, error } = await supabase
		.from('photo_metadata')
		.select('photo_id, image_key, file_name, content_hash')
		.eq('album_key', ALBUM_KEY!)
		.eq('hdr_web_available', false);
	if (error) throw new Error(`photo_metadata query failed: ${error.message}`);
	return (data ?? []).map((row) => ({
		photoId: row.photo_id,
		imageKey: row.image_key,
		fileName: row.file_name,
		contentHash: row.content_hash
	}));
}

async function markHdrAvailable(photoId: string): Promise<void> {
	const { data, error } = await supabase
		.from('photo_metadata')
		.update({ hdr_web_available: true })
		.eq('photo_id', photoId)
		.eq('album_key', ALBUM_KEY!)
		.select('photo_id');
	if (error) throw new Error(`hdr_web_available update failed for ${photoId}: ${error.message}`);
	if (data?.length !== 1) throw new Error(`hdr_web_available update affected ${data?.length ?? 0} rows for ${photoId}`);
}

async function main(): Promise<void> {
	const rows = await loadPendingRows();
	const files = readdirSync(DIR!).filter((fileName) => /\.(jpg|jpeg)$/i.test(fileName)).sort();
	const matches = matchLocalFilesToRows(files, rows);
	const rowsByKey = indexRowsByLocalPhotoKey(rows);
	const matchedKeys = new Set(matches.map(({ fileName }) => stripJpegExtension(fileName)));

	console.log(`HDR web backfill for album ${ALBUM_KEY}${DRY_RUN ? ' (dry run)' : ''}`);
	console.log(`Pending database rows: ${rows.length}; local JPEGs: ${files.length}; matched: ${matches.length}`);
	for (const fileName of files) {
		if (!matchedKeys.has(stripJpegExtension(fileName))) console.warn(`  No pending row for local file: ${fileName}`);
	}
	for (const [key, row] of rowsByKey) {
		if (!matchedKeys.has(key)) console.warn(`  No local file for pending row: ${row.photoId}`);
	}

	let skippedNoGainMap = 0;
	let refusedChanged = 0;
	let refusedUnhashed = 0;
	let uploaded = 0;
	let failed = 0;
	for (const { fileName, row } of matches) {
		const path = join(DIR!, fileName);
		let source: Buffer;
		try {
			source = readFileSync(path);
		} catch (error) {
			failed++;
			console.error(`  Could not read ${fileName}: ${(error as Error).message}`);
			continue;
		}
		const check = checkSourceMatchesRow(row.contentHash, createHash('sha256').update(source).digest('hex'));
		if (check === 'changed') {
			refusedChanged++;
			console.warn(`  Refuse ${fileName}: its bytes differ from the file ${row.photoId} was ingested from. Run ingest-album.ts --replace to update both copies together.`);
			continue;
		}
		if (check === 'unhashed' && !ALLOW_UNHASHED) {
			refusedUnhashed++;
			console.warn(`  Refuse ${fileName}: ${row.photoId} has no stored content_hash to compare. Pass --allow-unhashed only after checking this export is that photo.`);
			continue;
		}
		if (!hasGainMap(source)) {
			skippedNoGainMap++;
			console.log(`  Skip ${fileName}: no HDR gain map`);
			continue;
		}
		if (DRY_RUN) {
			console.log(`  Would build/upload hdr/${row.photoId}.jpg from ${fileName}`);
			continue;
		}

		try {
			const result = await buildUploadAndMarkHdr({
				build: async () => buildWebHdrCopy(path).then((copy) => copy?.buffer ?? null),
				upload: (buffer) => uploadHdrToR2(row.photoId, buffer),
				markAvailable: () => markHdrAvailable(row.photoId)
			});
			if (result === 'uploaded') {
				uploaded++;
				console.log(`  Uploaded hdr/${row.photoId}.jpg and marked available`);
			} else {
				failed++;
				console.error(`  ${fileName}: ${result}; database flag remains false`);
			}
		} catch (error) {
			failed++;
			console.error(`  ${fileName}: ${(error as Error).message}; database flag remains false`);
		}
	}

	console.log(`Done: uploaded ${uploaded}; skipped without gain map ${skippedNoGainMap}; refused changed ${refusedChanged}; refused unhashed ${refusedUnhashed}; failed ${failed}.`);
	if (DRY_RUN) console.log('Dry run: no R2 or database writes were made.');
	if (failed > 0 || refusedChanged > 0 || refusedUnhashed > 0) process.exitCode = 1;
}

main().catch((error) => {
	console.error(`ERROR: ${(error as Error).message}`);
	process.exitCode = 1;
});
