/**
 * Resize a gain-map (Ultra HDR) JPEG for web serving WITHOUT dropping the gain map.
 *
 * NODE-ONLY (see hdr-gainmap.ts's header) — shells out to `ultrahdr_app` (libultrahdr) and
 * `exiftool`, uses `sharp` for the actual resize. Only scripts/ingest-album.ts and
 * scripts/build-hdr-web-copy.ts import this.
 *
 * WHY EXIFTOOL HERE, when the rest of this codebase deliberately removed it (ENRICHMENT_WORKFLOW.md,
 * "#10 ingest cutover"): that removal was about not round-tripping AI/EXIF METADATA through
 * files via an exiftool shell-out on every photo, every ingest. This is a different, narrower use
 * — a one-time metadata-restore step inside an OPTIONAL, best-effort local resize pipeline that
 * never runs in the Workers build. It is not a re-introduction of the old enrich→sync→EXIF chain.
 *
 * THE PROBLEM PROVEN THIS SESSION (2026-09-26, on DSC09484): sharp cannot resize a gain-map JPEG
 * at all — it only sees the primary (base) image and would silently drop the gain map. And
 * `ultrahdr_app`'s own encoder (scenario 4: recombine an existing SDR + gain-map JPEG pair) does
 * NOT write the `XMP-hdrgm` metadata block that real gain-map decoders (Chrome, Safari 26+,
 * ImageMagick's own UHDR delegate) key off to recognize the format — verified: `grep` for the
 * `ns.adobe.com/hdr-gain-map` namespace string found it in the source file and NOT in
 * `ultrahdr_app`'s raw encoder output, and `magick identify -verbose` only reported `hdrgm:Version`
 * once that block was copied back in.
 *
 * THE PROVEN PIPELINE (exiftool round-trip verified byte-identical through a real R2 upload/
 * download, 2026-09-26 — see PR description for the full trace):
 *   1. Extract the base JPEG (sharp reading the file directly — it already ignores the MPF
 *      trailer) and the gain-map JPEG (`exiftool -mpimage2 -b`).
 *   2. Read the gain-map metadata config (`ultrahdr_app -m 1 -j <file> -z /dev/null -f cfg` — any
 *      decode call writes it; the values describe the gain map's own pixel encoding, not the
 *      resolution, so they carry over unchanged to a resized pair).
 *   3. Resize BASE and GAIN MAP to the exact same target dimensions (sharp, `fit: 'fill'` so
 *      they can never round to different sizes).
 *   4. Re-encode via `ultrahdr_app -m 0` encode scenario 4 (`-i` resized base, `-g` resized gain
 *      map, `-f` the metadata config).
 *   5. Copy the `XMP-hdrgm` block from the ORIGINAL file onto the re-encoded output
 *      (`exiftool -TagsFromFile … -XMP-hdrgm:all`) — exiftool correctly rewrites the MPF byte
 *      offsets when it touches a file's segments (verified: the gain map still extracts to the
 *      right dimensions and `ultrahdr_app` still decodes the edited file after this step).
 *
 * KNOWN GAP: the re-encoded file's MPF `MPImageType` tag reads "Undefined" instead of "Gain Map
 * Image" (that specific sub-tag is not exiftool-writable — confirmed, `exiftool` refuses it as
 * not writable). ImageMagick's UHDR delegate still recognizes the result as HDR content (keys off
 * the XMP block), so this is treated as a cosmetic gap in a secondary signal, not a correctness
 * bug — documented rather than silently accepted. If a future decoder turns out to require the
 * exact MPImageType value, that is the next thing to fix here.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';

/** Long-edge target for the web HDR copy — matches the site's existing "large" Cloudflare Images
 * variant (1600px), the size already used for the full lightbox / detail-page view this replaces. */
export const HDR_WEB_LONG_EDGE = 1600;

export interface HdrResizeResult {
	buffer: Buffer;
	width: number;
	height: number;
}

function fileExists(cmd: string): boolean {
	try {
		execFileSync(cmd, [], { stdio: 'ignore' });
		return true;
	} catch (e: any) {
		return e?.code !== 'ENOENT';
	}
}

/**
 * Build a web-sized copy of a gain-map original with the gain map intact. Returns null (never
 * throws) when `ultrahdr_app` or `exiftool` isn't installed, the source has no gain map, or any
 * step of the pipeline fails — callers must fall back to storing/serving the Cloudflare Images
 * variant, per the "warning/fallback only" contract the rest of this feature follows.
 */
export async function buildWebHdrCopy(
	originalPath: string,
	targetLongEdge: number = HDR_WEB_LONG_EDGE
): Promise<HdrResizeResult | null> {
	if (!fileExists('ultrahdr_app') || !fileExists('exiftool')) return null;

	const originalBuffer = readFileSync(originalPath);
	const meta = await sharp(originalBuffer).metadata();
	const W = meta.width, H = meta.height;
	if (!W || !H) return null;

	const scale = Math.min(1, targetLongEdge / Math.max(W, H)); // never upscale
	const tw = Math.round(W * scale), th = Math.round(H * scale);

	const tmp = mkdtempSync(join(tmpdir(), 'hdr-resize-'));
	try {
		const gainmapPath = join(tmp, 'gainmap.jpg');
		const cfgPath = join(tmp, 'meta.cfg');
		const baseResizedPath = join(tmp, 'base_resized.jpg');
		const gainmapResizedPath = join(tmp, 'gainmap_resized.jpg');
		const encodedPath = join(tmp, 'encoded.jpg');

		let gainmapBytes: Buffer;
		try {
			gainmapBytes = execFileSync('exiftool', ['-mpimage2', '-b', originalPath], { maxBuffer: 1024 * 1024 * 64 });
		} catch {
			return null;
		}
		if (!gainmapBytes.length) return null;
		writeFileSync(gainmapPath, gainmapBytes);

		try {
			execFileSync('ultrahdr_app', ['-m', '1', '-j', originalPath, '-o', '3', '-O', '3', '-z', join(tmp, 'discard.raw'), '-f', cfgPath], {
				stdio: 'ignore'
			});
		} catch {
			return null;
		}

		await sharp(originalBuffer).resize(tw, th, { fit: 'fill' }).jpeg({ quality: 92 }).toFile(baseResizedPath);
		await sharp(gainmapPath).resize(tw, th, { fit: 'fill' }).jpeg({ quality: 92 }).toFile(gainmapResizedPath);

		try {
			execFileSync(
				'ultrahdr_app',
				['-m', '0', '-i', baseResizedPath, '-g', gainmapResizedPath, '-f', cfgPath, '-q', '92', '-Q', '95', '-z', encodedPath],
				{ stdio: 'ignore' }
			);
		} catch {
			return null;
		}

		try {
			execFileSync('exiftool', ['-TagsFromFile', originalPath, '-XMP-hdrgm:all', '-overwrite_original', encodedPath], {
				stdio: 'ignore'
			});
		} catch {
			return null; // metadata restore failed — do not ship a file browsers won't recognize as HDR
		}

		const finalBuffer = readFileSync(encodedPath);
		return { buffer: finalBuffer, width: tw, height: th };
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}
