/**
 * Ultra HDR / ISO gain-map JPEG detection + SDR-drift measurement.
 *
 * NODE-ONLY (like image-resize.ts / sharpness.ts beside this file): shells out to the local
 * `ultrahdr_app` CLI (libultrahdr, installed via `brew install libultrahdr`) and uses `sharp` for
 * pixel decode/resize. Only scripts/ingest-album.ts and scripts/check-sdr-drift.ts import this —
 * never anything reachable from src/routes (the adapter-cloudflare Workers build cannot run a
 * native binary or spawn a child process).
 *
 * WHAT A GAIN-MAP JPEG IS (verified against real exports this session, 2026-09-26): Lightroom's
 * HDR JPEG export is a normal baseline JPEG (the "SDR base") with a second, smaller/same-res JPEG
 * appended after EOF (Multi-Picture Format, MPF APP2 — `exiftool -mpimage2 -b` extracts it) that
 * encodes a per-pixel gain map, plus an `XMP-hdrgm` metadata block (namespace
 * `http://ns.adobe.com/hdr-gain-map/1.0/`) describing how to apply it (per-channel
 * maxContentBoost/minContentBoost/gamma). A plain JPEG decoder (sharp, Cloudflare Images, R2
 * serving bytes as-is) reads only the primary scan and gets the SDR base — verified: Cloudflare
 * Images' `public`/`large`/`grid` variants for a gain-map source come back pixel-identical to the
 * base. An HDR-aware decoder (Chrome, Safari 26+) additionally applies the gain map for a boosted
 * render. This is why the format is safe to serve to every browser (see hdr-resize.ts): the base
 * alone is the correct fallback rendering, by design.
 *
 * DRIFT MEASUREMENT — what "mean |log2 gain|" actually means here, and why it's std, not mean:
 * `computeSdrDrift` decodes the TRUE HDR reconstruction via `ultrahdr_app -o 0 -O 4` (linear
 * transfer, half-float RGBA — the only decode pairing that actually applies the gain map; `-o 3
 * -O 3` "srgb" decode was tried first and verified (via a byte-for-byte `sharp` comparison) to
 * return the base UNCHANGED — that decode path is defined as "what an SDR display should show",
 * which is the base itself, not a tone-mapped HDR render). It computes, per pixel, log2(linear
 * HDR luma / linear SDR-base luma) — the actual per-pixel gain being applied.
 *
 * The MEAN of that value across the frame does not separate a bad export from a good one: it
 * mostly reflects how much real dynamic range the SCENE had (gym lighting vs. daylight), not
 * whether the edit is a problem. Calibration on both real albums (this session, 2026-09-26)
 * showed the known-bad file (DSC09484, Milliken — SDR Brightness +97/Contrast -36) scoring
 * meanAbsLog2Gain=0.70, worse than a photo with NO edit at all (0.68) and close to several
 * known-acceptable files (0.50-0.69, SDR Brightness +42/Contrast +14) — not a usable signal.
 *
 * The STANDARD DEVIATION of per-pixel log2(gain) across the frame does separate them: it measures
 * how NON-UNIFORM the correction is — some regions needing a big boost while others need little or
 * a cut — which is what actually produces a visibly-wrong SDR fallback (crushed/blown regions,
 * banding, a face going dark while the background blows out). Ten files from both albums
 * (DSC09484/DSC09457/DSC09480/DSC09441/DSC09443/DSC09434/DSC09427/acc-v-jca-{097,01,02,21,103,077})
 * spanning every distinct SDR-setting group present: every "+97/-36" (Milliken's flagged group)
 * file scored stdLog2Gain 0.91-1.26; every "+42/+14" (Milliken's acceptable group) file and every
 * other sampled file scored 0.46-0.82. SDR_DRIFT_THRESHOLD = 0.85 sits in that gap.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';

/** Namespace URI Adobe/Google's gain-map spec writes into the embedded XMP packet. Present as
 * plain ASCII in the JPEG bytes (XMP is a text RDF/XML packet), so a byte search is enough — no
 * XML parser needed. */
const HDRGM_NAMESPACE = 'ns.adobe.com/hdr-gain-map';

/** Calibrated 2026-09-26 against 6 known-bad + 6 known-acceptable real files — see module doc. */
export const SDR_DRIFT_THRESHOLD = 0.85;

/** Downsample grid for the drift comparison — enough to characterize spatial non-uniformity,
 * small enough that the whole computation stays well under a second per photo. */
const GRID = 256;

export function hasGainMap(buffer: Buffer): boolean {
	return buffer.includes(HDRGM_NAMESPACE);
}

/**
 * Read the Lightroom `crs:SDR*` edit settings from the file's embedded XMP packet — the settings
 * a photographer can push to an extreme that produces a bad SDR fallback. Returns null when the
 * file has no readable XMP packet (never throws — this is a diagnostic label, not a gate).
 */
export function readSdrCrsSettings(buffer: Buffer): Record<string, number> | null {
	const text = buffer.toString('latin1'); // XMP is ASCII/UTF-8; latin1 is a safe 1-byte-per-char view for regex scanning
	const start = text.indexOf('<x:xmpmeta');
	const end = text.indexOf('</x:xmpmeta>');
	if (start < 0 || end < 0) return null;
	const xmp = text.slice(start, end);
	const out: Record<string, number> = {};
	const re = /crs:(SDR[A-Za-z]+)="([+-]?\d+(?:\.\d+)?)"/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(xmp))) out[m[1]] = Number(m[2]);
	return Object.keys(out).length ? out : null;
}

/** Half-precision (IEEE 754 binary16) → JS number. `ultrahdr_app`'s `rgbahalffloat` decode output
 * is exactly this format, 2 bytes/channel, 4 channels/pixel. */
function halfToFloat(h: number): number {
	const s = (h & 0x8000) >> 15;
	const e = (h & 0x7c00) >> 10;
	const f = h & 0x03ff;
	if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
	if (e === 0x1f) return f ? NaN : s ? -Infinity : Infinity;
	return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}

function srgbToLinear(v: number): number {
	const c = v / 255;
	return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export interface SdrDriftResult {
	/** Standard deviation of per-pixel log2(HDR linear luma / SDR-base linear luma) — the score
	 * compared against SDR_DRIFT_THRESHOLD. Higher = more spatially non-uniform gain = more likely
	 * the SDR base looks visibly wrong in some region of the frame. */
	stdLog2Gain: number;
	/** Mean of the same per-pixel values (signed, not absolute) — a large positive/negative mean
	 * says the whole frame is uniformly darker/brighter in HDR than in the SDR base; on its own
	 * this is normal (scene dynamic range) and is NOT part of the threshold decision. */
	meanLog2Gain: number;
	/** p95 - p5 of the per-pixel distribution — a second, more robust view of the same
	 * non-uniformity stdLog2Gain measures; reported alongside it, not compared to its own threshold. */
	spread: number;
}

/** True when `ultrahdr_app` (libultrahdr) is on PATH — checked once per process. */
let ultrahdrAvailable: boolean | null = null;
function checkUltrahdrAvailable(): boolean {
	if (ultrahdrAvailable !== null) return ultrahdrAvailable;
	try {
		execFileSync('ultrahdr_app', [], { stdio: 'ignore' });
	} catch (e: any) {
		// ultrahdr_app with no args exits non-zero after printing usage — that's a SUCCESSFUL "it's
		// installed" signal. Only ENOENT (binary not found) means "not installed".
		ultrahdrAvailable = e?.code !== 'ENOENT';
		return ultrahdrAvailable;
	}
	ultrahdrAvailable = true;
	return true;
}

/**
 * Measure how far a gain-map JPEG's SDR base drifts from its HDR intent. Returns null (never
 * throws) when: the file has no gain map, `ultrahdr_app` isn't installed, or the decode fails for
 * any reason — this is a warning-only diagnostic, so a failure here must never block ingest.
 */
export async function computeSdrDrift(filePath: string): Promise<SdrDriftResult | null> {
	if (!checkUltrahdrAvailable()) return null;
	const buffer = readFileSync(filePath);
	if (!hasGainMap(buffer)) return null;

	const baseMeta = await sharp(buffer).metadata();
	const W = baseMeta.width, H = baseMeta.height;
	if (!W || !H) return null;

	const tmp = mkdtempSync(join(tmpdir(), 'sdr-drift-'));
	const linearRawPath = join(tmp, 'recon_linear.raw');
	try {
		try {
			execFileSync('ultrahdr_app', ['-m', '1', '-j', filePath, '-o', '0', '-O', '4', '-z', linearRawPath], {
				stdio: 'ignore'
			});
		} catch (e) {
			return null; // decode failed (corrupt file, unexpected variant) — warning-only, skip
		}

		const gw = GRID;
		const gh = Math.round((GRID * H) / W);
		const baseInfo = await sharp(buffer)
			.resize({ width: gw, height: gh, fit: 'fill' })
			.raw()
			.toBuffer({ resolveWithObject: true });
		const bc = baseInfo.info.channels;

		const raw = readFileSync(linearRawPath);
		const bytesPerPixel = 8; // 4 channels * 2 bytes (half-float)
		const n = gw * gh;
		const log2Gains = new Float64Array(n);

		for (let gy = 0; gy < gh; gy++) {
			const sy = Math.min(H - 1, Math.floor((gy / gh) * H));
			for (let gx = 0; gx < gw; gx++) {
				const sx = Math.min(W - 1, Math.floor((gx / gw) * W));
				const idx = (sy * W + sx) * bytesPerPixel;
				if (idx + 6 > raw.length) continue;
				const r = halfToFloat(raw.readUInt16LE(idx));
				const g = halfToFloat(raw.readUInt16LE(idx + 2));
				const b = halfToFloat(raw.readUInt16LE(idx + 4));
				const reconLuma = Math.max(0.2126 * r + 0.7152 * g + 0.0722 * b, 1e-6);

				const bidx = (gy * gw + gx) * bc;
				const br = srgbToLinear(baseInfo.data[bidx]);
				const bg = srgbToLinear(baseInfo.data[bidx + 1]);
				const bb = srgbToLinear(baseInfo.data[bidx + 2]);
				const baseLuma = Math.max(0.2126 * br + 0.7152 * bg + 0.0722 * bb, 1e-6);

				log2Gains[gy * gw + gx] = Math.log2(reconLuma / baseLuma);
			}
		}

		let sum = 0;
		for (let i = 0; i < n; i++) sum += log2Gains[i];
		const mean = sum / n;
		let sumSq = 0;
		for (let i = 0; i < n; i++) sumSq += (log2Gains[i] - mean) ** 2;
		const std = Math.sqrt(sumSq / n);

		const sorted = Array.from(log2Gains).sort((a, b) => a - b);
		const p5 = sorted[Math.floor(n * 0.05)];
		const p95 = sorted[Math.floor(n * 0.95)];

		return { stdLog2Gain: std, meanLog2Gain: mean, spread: p95 - p5 };
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}

/** Human-readable one-line warning for the ingest console (never blocking — see caller). */
export function formatDriftWarning(fileName: string, drift: SdrDriftResult, sdrSettings: Record<string, number> | null): string {
	const settingsPart = sdrSettings
		? Object.entries(sdrSettings)
				.map(([k, v]) => `${k}=${v > 0 ? '+' : ''}${v}`)
				.join(' ')
		: '(no XMP-crs SDR* settings found)';
	return (
		`SDR/HDR drift high for ${fileName}: stdLog2Gain=${drift.stdLog2Gain.toFixed(2)} ` +
		`(threshold ${SDR_DRIFT_THRESHOLD}) spread=${drift.spread.toFixed(2)} — the non-HDR fallback ` +
		`may look visibly off in some region of the frame. Lightroom settings: ${settingsPart}`
	);
}
