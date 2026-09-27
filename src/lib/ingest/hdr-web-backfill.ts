import {
	indexRowsByLocalPhotoKey,
	stripJpegExtension,
	type LocalPhotoRow
} from './local-photo-match';

export interface HdrBackfillRow extends LocalPhotoRow {
	photoId: string;
}

export interface MatchedHdrBackfillFile {
	fileName: string;
	row: HdrBackfillRow;
}

/**
 * Use the ingest matching contract for an HDR backfill, so a legacy SmugMug `image_key` never
 * prevents a local export from finding the row whose photo_id names its R2 object.
 */
export function matchLocalFilesToRows(fileNames: string[], rows: HdrBackfillRow[]): MatchedHdrBackfillFile[] {
	const rowsByKey = indexRowsByLocalPhotoKey(rows);
	const matches: MatchedHdrBackfillFile[] = [];
	for (const fileName of fileNames) {
		const row = rowsByKey.get(stripJpegExtension(fileName));
		if (row) matches.push({ fileName, row });
	}
	return matches;
}

export type HdrBackfillResult = 'uploaded' | 'no-hdr-copy' | 'upload-failed';

/**
 * Establish the only safe write order: R2 upload first, database flag second. A database failure
 * leaves the flag false, making the next run safely retry the deterministic R2 overwrite.
 */
export async function buildUploadAndMarkHdr(options: {
	build: () => Promise<Buffer | null>;
	upload: (buffer: Buffer) => Promise<boolean>;
	markAvailable: () => Promise<void>;
}): Promise<HdrBackfillResult> {
	const buffer = await options.build();
	if (!buffer) return 'no-hdr-copy';
	if (!(await options.upload(buffer))) return 'upload-failed';
	await options.markAvailable();
	return 'uploaded';
}
