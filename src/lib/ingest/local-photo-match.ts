/**
 * Match a local JPEG export to its existing `photo_metadata` row.
 *
 * Modern rows use the filename-derived `image_key`, but older imports can retain a SmugMug key
 * unrelated to their local filename. `file_name` is therefore the authority whenever present.
 */
export interface LocalPhotoRow {
	imageKey: string;
	fileName: string | null;
}

export function localPhotoKey(row: LocalPhotoRow): string {
	return row.fileName ? stripJpegExtension(row.fileName) : row.imageKey;
}

export function stripJpegExtension(fileName: string): string {
	return fileName.replace(/\.(jpg|jpeg)$/i, '');
}

export function indexRowsByLocalPhotoKey<T extends LocalPhotoRow>(rows: T[]): Map<string, T> {
	return new Map(rows.map((row) => [localPhotoKey(row), row]));
}
