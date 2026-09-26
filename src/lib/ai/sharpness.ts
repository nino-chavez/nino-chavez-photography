/**
 * Deterministic sharpness — variance of the Laplacian, computed in FLOAT math on raw greyscale
 * pixels. This is the one seam for `photo_metadata.sharpness_measured` (ingest + backfill both
 * call it).
 *
 * WHY NOT `sharp().convolve()`: sharp's convolve operates on the image's existing pixel format
 * (uint8) and clamps every intermediate value to [0, 255] — it also zeroes any negative kernel
 * response, since a negative pixel value isn't representable in uint8. The Laplacian kernel
 * below produces plenty of negative responses (edges), so convolving through sharp silently
 * discards half the signal before variance is even computed. This is not a hypothetical: the
 * evaluation that recommended this metric (scripts/eval/laplacian-sharpness.ts in
 * .claude/worktrees/agent-a9ac18f4737ef6552) used exactly that sharp-convolve approach, and this
 * module deliberately does NOT reuse it for the production write path — see blueprint/decisions/0006.
 * Doing the convolution by hand in JS on the raw pixel buffer keeps every value a float, so
 * negative responses and out-of-[0,255] magnitudes both survive into the variance calculation.
 *
 * Resize target matches `embedImage`'s `IMAGE_EMBED_LONG_EDGE` (768px) — comparing variance
 * across different native resolutions is meaningless unless the pixel grid is normalized first,
 * and reusing the same resize the image embedding already computes means no independent
 * resize policy to keep in sync.
 */
import sharp from 'sharp';

const LONG_EDGE = 768;

/** Standard discrete Laplacian kernel (4-neighbor), the same one the eval script used. */
function laplacianAt(data: Uint8ClampedArray | Buffer, width: number, x: number, y: number): number {
	const at = (px: number, py: number) => data[py * width + px];
	return -4 * at(x, y) + at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1);
}

/**
 * Compute variance of the Laplacian over a resized greyscale version of `imageBuffer`. Returns a
 * non-negative number (0 for a degenerate/blank or too-small image).
 */
export async function computeSharpness(imageBuffer: Buffer): Promise<number> {
	const { data, info } = await sharp(imageBuffer)
		.resize({ width: LONG_EDGE, height: LONG_EDGE, fit: 'inside', withoutEnlargement: true })
		.grayscale()
		.raw()
		.toBuffer({ resolveWithObject: true });

	const { width, height, channels } = info;
	// laplacianAt indexes `data` as one byte per pixel (`py * width + px`) — correct only for a
	// single-channel buffer. .grayscale() above should guarantee this; assert it rather than
	// silently reading the wrong bytes if a future sharp version or option ever changes that.
	if (channels !== 1) throw new Error(`computeSharpness: expected 1 (greyscale) channel, got ${channels}`);
	if (width < 3 || height < 3) return 0;

	// Single pass, float accumulation throughout (E[x^2] - E[x]^2) — no intermediate clamping.
	let sum = 0;
	let sumSq = 0;
	let n = 0;
	for (let y = 1; y < height - 1; y++) {
		for (let x = 1; x < width - 1; x++) {
			const lap = laplacianAt(data, width, x, y);
			sum += lap;
			sumSq += lap * lap;
			n++;
		}
	}
	if (n === 0) return 0;
	const mean = sum / n;
	const variance = sumSq / n - mean * mean;
	return variance < 0 ? 0 : variance; // guard float rounding at ~0
}
