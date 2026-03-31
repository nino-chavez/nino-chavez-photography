/**
 * Branded Image Generator
 *
 * Creates downloadable images with branding overlay for Instagram sharing.
 * Uses Canvas API to composite photo + watermark.
 */

export type ShareFormat = 'story' | 'post';

interface BrandedImageOptions {
	imageUrl: string;
	title?: string;
	format: ShareFormat;
}

const FORMATS = {
	story: { width: 1080, height: 1920 },
	post: { width: 1080, height: 1080 }
} as const;

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
 * Generate a branded image for social sharing.
 * Returns a Blob ready for download.
 */
export async function generateBrandedImage(options: BrandedImageOptions): Promise<Blob> {
	const { imageUrl, title, format } = options;
	const { width, height } = FORMATS[format];

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d')!;

	// Black background
	ctx.fillStyle = '#0a0a0a';
	ctx.fillRect(0, 0, width, height);

	// Load and draw photo
	const img = await loadImage(imageUrl);

	if (format === 'story') {
		// Story: photo centered with padding, title above, watermark below
		const photoAreaTop = 200;
		const photoAreaHeight = height - 400;
		const photoAreaWidth = width - 80;

		const scale = Math.min(photoAreaWidth / img.width, photoAreaHeight / img.height);
		const drawW = img.width * scale;
		const drawH = img.height * scale;
		const drawX = (width - drawW) / 2;
		const drawY = photoAreaTop + (photoAreaHeight - drawH) / 2;

		ctx.drawImage(img, drawX, drawY, drawW, drawH);

		// Title text (top area)
		if (title) {
			ctx.fillStyle = '#ffffff';
			ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';

			// Word wrap title
			const maxWidth = width - 120;
			const words = title.split(' ');
			const lines: string[] = [];
			let currentLine = '';

			for (const word of words) {
				const testLine = currentLine ? `${currentLine} ${word}` : word;
				if (ctx.measureText(testLine).width > maxWidth && currentLine) {
					lines.push(currentLine);
					currentLine = word;
				} else {
					currentLine = testLine;
				}
			}
			if (currentLine) lines.push(currentLine);

			const lineHeight = 44;
			const titleStartY = 100 - ((lines.length - 1) * lineHeight) / 2;
			for (let i = 0; i < lines.length; i++) {
				ctx.fillText(lines[i], width / 2, titleStartY + i * lineHeight);
			}
		}

		// Watermark (bottom area)
		drawWatermark(ctx, width, height - 80);
	} else {
		// Post: photo fills frame, watermark overlay at bottom
		const scale = Math.max(width / img.width, height / img.height);
		const drawW = img.width * scale;
		const drawH = img.height * scale;
		const drawX = (width - drawW) / 2;
		const drawY = (height - drawH) / 2;

		ctx.drawImage(img, drawX, drawY, drawW, drawH);

		// Semi-transparent gradient at bottom for watermark
		const gradient = ctx.createLinearGradient(0, height - 160, 0, height);
		gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
		gradient.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
		ctx.fillStyle = gradient;
		ctx.fillRect(0, height - 160, width, 160);

		// Watermark
		drawWatermark(ctx, width, height - 36);
	}

	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
			'image/jpeg',
			0.92
		);
	});
}

function drawWatermark(ctx: CanvasRenderingContext2D, canvasWidth: number, y: number) {
	ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
	ctx.font = '500 22px system-ui, -apple-system, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.letterSpacing = '2px';
	ctx.fillText(WATERMARK, canvasWidth / 2, y);

	// Decorative line above
	const textWidth = ctx.measureText(WATERMARK).width;
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo((canvasWidth - textWidth) / 2 - 20, y - 18);
	ctx.lineTo((canvasWidth + textWidth) / 2 + 20, y - 18);
	ctx.stroke();
}

/**
 * Download a branded image to the user's device.
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
