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

const HANDLE = '@nino.chavez.photo';

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
 * Draw a small, unobtrusive watermark — Instagram glyph + handle — in the
 * bottom-right corner. Sizing scales with the image so it reads consistently
 * at any resolution.
 */
function drawWatermark(ctx: CanvasRenderingContext2D, width: number, height: number) {
	const fontSize = Math.max(16, Math.round(width * 0.018));
	const margin = Math.round(width * 0.025);
	const glyphSize = Math.round(fontSize * 1.05);
	const gap = Math.round(fontSize * 0.4);

	ctx.save();
	ctx.font = `500 ${fontSize}px system-ui, -apple-system, sans-serif`;
	ctx.textAlign = 'right';
	ctx.textBaseline = 'alphabetic';
	ctx.letterSpacing = `${Math.max(1, Math.round(fontSize * 0.06))}px`;

	// Drop shadow keeps the mark legible over light or busy areas.
	ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
	ctx.shadowBlur = Math.round(fontSize * 0.4);
	ctx.shadowOffsetX = 0;
	ctx.shadowOffsetY = 1;
	ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';

	const rightX = width - margin;
	const baselineY = height - margin;

	// Handle text, right-anchored.
	ctx.fillText(HANDLE, rightX, baselineY);

	// Instagram glyph to the left of the text, vertically centered on it.
	const textWidth = ctx.measureText(HANDLE).width;
	const glyphCx = rightX - textWidth - gap - glyphSize / 2;
	const glyphCy = baselineY - fontSize * 0.34;
	drawInstagramGlyph(ctx, glyphCx, glyphCy, glyphSize);

	ctx.restore();
}

/**
 * Stroke the Instagram glyph (camera body, lens, top-right dot) centered at
 * (cx, cy) within a square bounding box of the given size. Coordinates follow
 * the lucide 24-unit viewBox, scaled to fit.
 */
function drawInstagramGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
	const scale = size / 24;
	const x = cx - size / 2;
	const y = cy - size / 2;
	const u = (n: number) => n * scale;

	ctx.save();
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
	ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
	ctx.lineWidth = Math.max(1, u(2));
	ctx.lineJoin = 'round';

	// Camera body: rounded square (rect 2,2 → 20×20, radius 5).
	const r = u(5);
	const bx = x + u(2);
	const by = y + u(2);
	const bw = u(20);
	const bh = u(20);
	ctx.beginPath();
	ctx.moveTo(bx + r, by);
	ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
	ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
	ctx.arcTo(bx, by + bh, bx, by, r);
	ctx.arcTo(bx, by, bx + bw, by, r);
	ctx.closePath();
	ctx.stroke();

	// Lens: circle centered at (12,12), radius 4.
	ctx.beginPath();
	ctx.arc(x + u(12), y + u(12), u(4), 0, Math.PI * 2);
	ctx.stroke();

	// Top-right dot at (17.5, 6.5).
	ctx.beginPath();
	ctx.arc(x + u(17.5), y + u(6.5), Math.max(0.6, u(1.1)), 0, Math.PI * 2);
	ctx.fill();

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
