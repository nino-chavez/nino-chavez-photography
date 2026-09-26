/**
 * Pure classification for `scripts/ingest-album.ts --replace`.
 *
 * A re-exported album (same folder, same filenames, new bytes — e.g. after fixing HDR settings
 * in Lightroom and re-exporting) maps to the SAME photo_id/cf_image_id for every file (see
 * ingest-album.ts's `localKeyFor`/`photoId` derivation). Before this flag existed, re-running
 * ingest against a re-export would re-run extraction from the NEW bytes but skip the Cloudflare
 * Images upload entirely (`alreadyUploaded` short-circuits it) — so the served image silently
 * stayed the OLD pixels while the DB caption/quality-scores were refreshed from the NEW ones,
 * mismatched. `--replace` closes that gap: this module decides, per local file, whether its
 * content actually changed since the last ingest, so the caller knows which photo_ids need a real
 * Cloudflare delete-then-reupload (`changed`), which can skip straight through with no AI cost at
 * all (`unchanged`), and which are genuinely new to this album (`newFiles`).
 *
 * Pure and side-effect-free on purpose — the hashing (I/O) and the CF/DB work both live in the
 * caller; this is the one piece worth unit-testing in isolation.
 */

export interface ExistingRowForReplace {
	/** `photo_metadata.content_hash` for this row, or null for a row ingested before the
	 * 2026-09-25 content-hash migration (or otherwise never hashed). */
	contentHash: string | null;
}

export interface LocalFileHash {
	/** The same key `ingest-album.ts`'s `localKeyFor`/`job.imageKey` uses — filename with its
	 * extension stripped, matched case-sensitively against `existingByKey`. */
	key: string;
	/** sha256 of the file's current bytes. */
	hash: string;
}

export interface ReplacePlan {
	/** Local files whose current hash DIFFERS from the row's stored content_hash — a real content
	 * change under an existing photo_id. Only these get a Cloudflare delete-then-reupload. */
	changed: string[];
	/** Local files whose hash matches the stored content_hash (or whose stored hash is null —
	 * nothing to compare against, so treated as unchanged rather than forced to replace). Skipped
	 * entirely under --replace: no CF operation, no re-extraction, no AI cost. */
	unchanged: string[];
	/** Local files with no existing row for this album — new photos, processed normally regardless
	 * of --replace. */
	newFiles: string[];
}

/**
 * Classify every local file against the album's existing rows. `existingByKey` uses the SAME key
 * space as `localFiles[].key` (both keyed the way `ingest-album.ts`'s `localKeyFor` produces it).
 */
export function classifyReplacePlan(
	localFiles: LocalFileHash[],
	existingByKey: Map<string, ExistingRowForReplace>
): ReplacePlan {
	const changed: string[] = [];
	const unchanged: string[] = [];
	const newFiles: string[] = [];

	for (const { key, hash } of localFiles) {
		const prior = existingByKey.get(key);
		if (!prior) {
			newFiles.push(key);
			continue;
		}
		if (prior.contentHash && prior.contentHash !== hash) {
			changed.push(key);
		} else {
			unchanged.push(key);
		}
	}

	return { changed, unchanged, newFiles };
}

/** One-line plan summary for the ingest console — printed regardless of --replace/--dry-run so an
 * operator always sees what a re-run against this album would do. */
export function describeReplacePlan(plan: ReplacePlan): string {
	return `${plan.changed.length} changed (replace in place), ${plan.unchanged.length} unchanged (skip), ${plan.newFiles.length} new`;
}
