import {
	indexRowsByLocalPhotoKey,
	stripJpegExtension,
	type LocalPhotoRow
} from './local-photo-match';

export interface HdrBackfillRow extends LocalPhotoRow {
	photoId: string;
	/** `photo_metadata.content_hash`: sha256 of the bytes this row's Cloudflare image came from. */
	contentHash?: string | null;
}

export type SourceCheck = 'match' | 'changed' | 'unhashed';

/**
 * Whether a local file is the exact file the row was ingested from. The HDR copy is served beside
 * the row's Cloudflare Images copy, so it must come from the same bytes: a re-export, an edited
 * file, or the wrong --album-key would otherwise put different pixels behind the same photo_id.
 * 'changed' needs `ingest-album.ts --replace` (which rewrites both copies together); 'unhashed'
 * (a row ingested before content hashing) cannot be proven and needs an explicit operator opt-in.
 */
export function checkSourceMatchesRow(storedHash: string | null | undefined, localHash: string): SourceCheck {
	if (!storedHash) return 'unhashed';
	return storedHash === localHash ? 'match' : 'changed';
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
