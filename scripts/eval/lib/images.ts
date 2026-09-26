/**
 * Image fetch/cache/crop helpers for the eval harness.
 *
 * "Public" variant = the original upload, no CF resize — this matches what production sends to
 * extractOne (scripts/ingest-album.ts passes the raw fileBuffer, unresized). "Large" (1600px) is
 * used only for the deterministic-sharpness check, where a fixed long edge is what the Laplacian
 * variance needs.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import sharp from 'sharp';
import { cfImageUrl, type CFVariant } from '../../../src/lib/utils/cloudflare-images';

const CACHE_DIR = resolve(process.cwd(), '.temp/eval/images');

function ensureDir(path: string) {
	const dir = dirname(path);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** Fetch (and cache to disk) a CF Images variant for a given cf_image_id. */
export async function fetchImageVariant(cfImageId: string, variant: CFVariant): Promise<Buffer> {
	const cachePath = resolve(CACHE_DIR, `${cfImageId}--${variant}.jpg`);
	if (existsSync(cachePath)) return readFileSync(cachePath);
	let lastErr: any;
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			const url = cfImageUrl(cfImageId, variant);
			const res = await fetch(url);
			if (!res.ok) throw new Error(`CF fetch ${res.status} for ${cfImageId} (${variant})`);
			const buf = Buffer.from(await res.arrayBuffer());
			ensureDir(cachePath);
			writeFileSync(cachePath, buf);
			return buf;
		} catch (err) {
			lastErr = err;
			await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
		}
	}
	throw lastErr;
}

/** The "today"-representative full-res buffer: same bytes production's extractOne would see. */
export async function fetchProductionBuffer(cfImageId: string): Promise<Buffer> {
	return fetchImageVariant(cfImageId, 'public');
}

/**
 * Split an image into an N x M grid of overlapping tiles, each resized so its long edge is
 * <= maxTileEdge. Used for BOTH (a) ground-truth labeling — the read-guard hook downscales any
 * image over 1400px to 1000px on Read, which makes jersey numbers illegible on a full-frame
 * gymnasium shot, so labeling happens from tiles instead — and (b) the "player-crop / higher
 * detail" vision arm, which sends tiles instead of the full frame so a small distant jersey gets
 * more pixels-on-target.
 *
 * Overlap (10% of tile width/height) avoids a number landing exactly on a tile seam.
 */
export async function tileImage(
	buf: Buffer,
	opts: { cols: number; rows: number; maxTileEdge?: number; overlap?: number } = { cols: 2, rows: 2 }
): Promise<Buffer[]> {
	const { cols, rows, maxTileEdge = 1200, overlap = 0.1 } = opts;
	const meta = await sharp(buf).metadata();
	const W = meta.width!, H = meta.height!;
	const tileW = W / cols, tileH = H / rows;
	const padW = Math.round(tileW * overlap), padH = Math.round(tileH * overlap);
	const tiles: Buffer[] = [];
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const left = Math.max(0, Math.round(c * tileW) - padW);
			const top = Math.max(0, Math.round(r * tileH) - padH);
			const width = Math.min(W - left, Math.round(tileW) + 2 * padW);
			const height = Math.min(H - top, Math.round(tileH) + 2 * padH);
			const tileBuf = await sharp(buf)
				.extract({ left, top, width, height })
				.resize({ width: maxTileEdge, height: maxTileEdge, fit: 'inside', withoutEnlargement: false })
				.jpeg({ quality: 90 })
				.toBuffer();
			tiles.push(tileBuf);
		}
	}
	return tiles;
}

/** Write a buffer to .temp/eval/images/<name> for manual inspection or spot-check sheets. */
export function saveDebugImage(name: string, buf: Buffer): string {
	const path = resolve(CACHE_DIR, name);
	ensureDir(path);
	writeFileSync(path, buf);
	return path;
}

export function toDataUrl(buf: Buffer, mime = 'image/jpeg'): string {
	return `data:${mime};base64,${buf.toString('base64')}`;
}
