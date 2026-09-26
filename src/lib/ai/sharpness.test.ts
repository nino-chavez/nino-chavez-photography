import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { computeSharpness } from './sharpness';

async function solidColor(): Promise<Buffer> {
	return sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 128, g: 128, b: 128 } } })
		.jpeg()
		.toBuffer();
}

/** A checkerboard has hard edges everywhere — high Laplacian variance, the "sharp" case. */
async function checkerboard(): Promise<Buffer> {
	const size = 64;
	const cell = 4;
	const channels = 3;
	const data = Buffer.alloc(size * size * channels);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const on = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
			const v = on ? 255 : 0;
			const i = (y * size + x) * channels;
			data[i] = v; data[i + 1] = v; data[i + 2] = v;
		}
	}
	return sharp(data, { raw: { width: size, height: size, channels } }).jpeg({ quality: 100 }).toBuffer();
}

test('a flat/uniform image has ~zero Laplacian variance', async () => {
	const variance = await computeSharpness(await solidColor());
	// JPEG compression of a flat field can introduce tiny quantization noise; this is not zero,
	// it's "near the floor" relative to a real-edge image (asserted comparatively below too).
	assert.ok(variance < 5, `expected near-zero variance for a flat field, got ${variance}`);
});

test('a high-contrast checkerboard has much higher Laplacian variance than a flat field', async () => {
	const flat = await computeSharpness(await solidColor());
	const sharp_ = await computeSharpness(await checkerboard());
	assert.ok(sharp_ > flat * 100, `expected checkerboard (${sharp_}) >> flat (${flat})`);
	assert.ok(sharp_ > 0);
});

test('never returns a negative number', async () => {
	const variance = await computeSharpness(await solidColor());
	assert.ok(variance >= 0);
});

test('degenerate (too-small) input returns 0 rather than throwing', async () => {
	const tiny = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 0, g: 0, b: 0 } } })
		.jpeg()
		.toBuffer();
	const variance = await computeSharpness(tiny);
	assert.equal(variance, 0);
});
