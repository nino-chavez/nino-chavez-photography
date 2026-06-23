/**
 * Branded Image Generator
 *
 * Creates a downloadable copy of a photo with a small watermark for social sharing.
 * The photo is preserved at its native aspect ratio — no framing, title, or crop.
 * Uses Canvas API to composite photo + watermark.
 */

interface BrandedImageOptions {
	imageUrl: string;
}

const WATERMARK = 'photography.ninochavez.co';

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
		img.src = src;
	});
}

/**
 * Generate a watermarked copy of a photo for social sharing.
 * Output matches the source image's dimensions and aspect ratio.
 * Returns a Blob ready for download.
 */
export async function generateBrandedImage(options: BrandedImageOptions): Promise<Blob> {
	const { imageUrl } = options;

	const img = await loadImage(imageUrl);
	const width = img.naturalWidth;
	const height = img.naturalHeight;

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d')!;

	// Draw the photo as-is, full bleed.
	ctx.drawImage(img, 0, 0, width, height);

	drawWatermark(ctx, width, height);

	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
			'image/jpeg',
			0.92
		);
	});
}

/**
 * Draw a small, unobtrusive watermark in the bottom-right corner.
 * Sizing scales with the image so it reads consistently at any resolution.
 */
function drawWatermark(ctx: CanvasRenderingContext2D, width: number, height: number) {
	const fontSize = Math.max(16, Math.round(width * 0.018));
	const margin = Math.round(width * 0.025);

	ctx.save();
	ctx.font = `500 ${fontSize}px system-ui, -apple-system, sans-serif`;
	ctx.textAlign = 'right';
	ctx.textBaseline = 'alphabetic';
	ctx.letterSpacing = `${Math.max(1, Math.round(fontSize * 0.08))}px`;

	// Drop shadow keeps the mark legible over light or busy areas.
	ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
	ctx.shadowBlur = Math.round(fontSize * 0.4);
	ctx.shadowOffsetX = 0;
	ctx.shadowOffsetY = 1;

	ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
	ctx.fillText(WATERMARK, width - margin, height - margin);
	ctx.restore();
}

/**
 * Download a watermarked photo to the user's device.
 */
export async function downloadBrandedImage(options: BrandedImageOptions, filename: string): Promise<void> {
	const blob = await generateBrandedImage(options);
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
