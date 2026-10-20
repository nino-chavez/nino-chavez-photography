import type { Photo } from '$types/photo';

export const FALLBACK_ASPECT_RATIO = 4 / 3;

export type PhotoRowColumns = 1 | 2 | 3 | 4;

export interface FittedPhotoLayoutItem {
	photo: Photo;
	index: number;
	aspectRatio: number;
	shares: Record<PhotoRowColumns, number>;
}

const COLUMN_COUNTS: PhotoRowColumns[] = [1, 2, 3, 4];

/** Returns the source ratio without depending on image loading in the browser. */
export function getPhotoAspectRatio(photo: Pick<Photo, 'aspect_ratio' | 'exif'>): number {
	const candidates = [photo.aspect_ratio, photo.exif?.aspect_ratio];

	if (photo.exif?.width && photo.exif.height) {
		candidates.push(photo.exif.width / photo.exif.height);
	}

	return candidates.find((ratio) => typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0) ?? FALLBACK_ASPECT_RATIO;
}

/**
 * Produces per-breakpoint width shares while retaining the incoming photo order.
 * Missing cells in the final row use its average ratio, leaving their space empty.
 */
export function createFittedPhotoLayout(photos: readonly Photo[]): FittedPhotoLayoutItem[] {
	const ratios = photos.map(getPhotoAspectRatio);

	return photos.map((photo, index) => {
		const shares = {} as Record<PhotoRowColumns, number>;

		for (const columns of COLUMN_COUNTS) {
			const rowStart = Math.floor(index / columns) * columns;
			const rowRatios = ratios.slice(rowStart, rowStart + columns);
			const rowTotal = rowRatios.reduce((total, ratio) => total + ratio, 0);
			const missingCells = columns - rowRatios.length;
			const paddedTotal = rowTotal + (rowTotal / rowRatios.length) * missingCells;

			shares[columns] = ratios[index] / paddedTotal;
		}

		return { photo, index, aspectRatio: ratios[index], shares };
	});
}
