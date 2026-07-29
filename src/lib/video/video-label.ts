/**
 * Reader-facing labels for video clips.
 *
 * ## Why `video.title` is not one
 *
 * `scripts/ingest-video-local.ts` writes the source filename into `video_metadata.title`, and
 * every display surface rendered that column as if it were a title. All 481 videos in the
 * database are named that way — there is no other kind — so a visitor browsing an album read:
 *
 *   lpo-bell-pepper(65)-4.MP4     C2154.mp4     Jalapeno Open 2026-01.mp4     0609-1.mp4
 *
 * on the cards, in the screen-reader label, in the thumbnail `alt`, in the player heading, and
 * as the name of the file they downloaded. One album (`TRoiyO`) mixes two of those schemes, so
 * even the accidental order the tidier filenames imply does not hold.
 *
 * The column is worth keeping — it is the provenance link back to the card in the camera — but
 * it is not text for a reader. `reader-contract.json` puts this surface in front of "a player,
 * parent, client, or visitor", whose job is to find the right clip. A camera's internal file
 * numbering does not serve that job; the clip's position in the album does.
 *
 * So the label is derived from position, unconditionally. No "use the title if it looks
 * human" branch: nothing in the pipeline can produce such a title today, and a heuristic that
 * guesses whether a database value is fit to show is the wrong shape for the question. If real
 * titles are ever authored, that is the change that adds the branch.
 *
 * Position is stable because `fetchAlbumVideos` orders by `upload_date DESC, video_id ASC` —
 * the same "sort key plus a deterministic tiebreaker" rule `fetchPhotos` uses. Without the
 * tiebreaker "Clip 12" could name a different clip on the next page load, which would make it
 * useless for the thing a client actually does with it: ask for one by name.
 */

import { slugify } from '$lib/utils';

/** What a visitor sees on the card. `clipLabel(0)` → `'Clip 1'`. */
export function clipLabel(index: number): string {
	return `Clip ${index + 1}`;
}

/** `0:14`. Empty string when the duration is unknown, so the badge can be omitted. */
export function formatDuration(seconds: number | null | undefined): string {
	if (!seconds || seconds < 0) return '';
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * The accessible name of the card, which is a button that opens the player.
 *
 * The thumbnail inside it is marked decorative (`alt=""`) rather than given the same string —
 * it carries no information the button's own label does not, and labelling both makes a screen
 * reader announce the clip twice.
 */
export function clipAriaLabel(index: number, durationSeconds?: number | null): string {
	const duration = formatDuration(durationSeconds);
	return duration ? `Play ${clipLabel(index)}, ${duration}` : `Play ${clipLabel(index)}`;
}

/**
 * The name a downloaded or shared clip arrives under, WITHOUT an extension — the download
 * route appends `.mp4`.
 *
 * It used to pass `video.title` straight through, and since that value already ended in `.mp4`
 * every download in the gallery's history landed as `C2154.mp4.mp4` (verified against the live
 * `content-disposition` header). The route now strips a trailing video extension as well, so a
 * caller that gets this wrong cannot reproduce it.
 */
export function clipDownloadName(albumName: string | null | undefined, index: number): string {
	const album = slugify(albumName || '') || 'video';
	return `${album}-${String(index + 1).padStart(2, '0')}`;
}
