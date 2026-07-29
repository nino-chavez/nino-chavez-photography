/**
 * Per-photo page titles.
 *
 * 21,743 photo pages shared 259 titles, because the title was the album name and nothing
 * else — one album put the same `<title>` on 363 pages. That is the largest surface on the
 * site, it is 98% crawler traffic, and a search result listing 363 identical entries tells
 * a parent nothing about which one holds their kid.
 *
 * Every photo already carries a caption (21,743 of 21,743, averaging 86 characters) written
 * to be factual retrieval metadata — visible numbers, colours, action, scene. That is exactly
 * what distinguishes one frame in an album from the next, and it was going unused here.
 *
 * SHAPE: `<album name> — <caption fragment>`.
 *
 * Album name leads and is never truncated. It is a precisionLock in reader-contract.json,
 * it is what someone actually types into a search box, and it is the first thing scanned in
 * a result list. The caption fragment follows to distinguish the frame.
 *
 * The `| Nino Chavez Photography` suffix is gone. It cost 26 characters of a ~70 character
 * budget on every one of those pages, and `og:site_name` already carries the brand — verified
 * present on the rendered page before removing it.
 */

/** Target length. Exceeded only when the album name alone would starve the caption. */
const TARGET_LENGTH = 70;

/**
 * Characters reserved for the caption before the title is allowed to exceed the target.
 *
 * Album names run to 51 characters, which at a flat 70-character target would leave ~16 —
 * "A player in red…" — distinct but not informative. This is an allowance, not a guarantee:
 * trimming to a word boundary gives back up to one word, so the fragment that ships is
 * typically 4-8 characters shorter. Fifteen albums exceed 37 characters and produce a title
 * longer than the target; the longest possible is 88.
 */
const MIN_CAPTION_CHARS = 34;

/** Trims to a word boundary and appends an ellipsis. Returns '' if nothing useful fits. */
function clipToWord(text: string, max: number): string {
	if (max < 12) return '';
	if (text.length <= max) return text;
	const cut = text.slice(0, max).replace(/\s+\S*$/, '').replace(/[.,;:—-]+$/, '');
	return cut ? `${cut}…` : '';
}

/**
 * `<album> — <caption fragment>`, falling back to the album alone when there is no caption.
 * Never returns an empty string: an untitled, uncaptioned photo still gets 'Untitled Photo'.
 */
export function photoPageTitle(albumName: string | null, caption: string | null): string {
	const album = (albumName ?? '').trim();
	// Captions are written as sentences; the trailing period reads as a typo mid-title.
	const text = (caption ?? '').trim().replace(/\s+/g, ' ').replace(/\.$/, '');

	if (!album) return text ? clipToWord(text, TARGET_LENGTH) || text.slice(0, TARGET_LENGTH) : 'Untitled Photo';
	if (!text) return album;

	const budget = Math.max(TARGET_LENGTH, album.length + 3 + MIN_CAPTION_CHARS);
	const fragment = clipToWord(text, budget - album.length - 3);
	return fragment ? `${album} — ${fragment}` : album;
}

/**
 * Alt text for the photo itself.
 *
 * This was the album name, so a screen reader announced "Chicago Big Dig 2026 - North Avenue
 * Beach" for all 363 frames in that album — the event, never the picture. The caption
 * describes what is actually visible, which is what alt text is for. Falls back to the album
 * name only when there is no caption at all.
 */
export function photoAltText(albumName: string | null, caption: string | null): string {
	const text = (caption ?? '').trim();
	if (text) return text;
	const album = (albumName ?? '').trim();
	return album || 'Photo';
}
