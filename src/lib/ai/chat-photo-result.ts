/**
 * What a chat photo result looks like by the time the grid renders it.
 *
 * Pure — no Supabase, no `$env` — so it runs under `tsx --test`, the same split
 * `photo-address.ts` uses for the addressing rule it depends on. The peer lookup
 * that feeds `addresses` lives in `/api/chat`.
 *
 * THE BUG THIS ENCODES AGAINST. `components/ai/PhotoGrid.svelte` renders an image only
 * `{#if photo.thumbnail_url}`. No chat search branch ever selected that column — they
 * selected `cf_image_id`, which is the *input* to the image URL, and nothing built the
 * URL. So every photo the chat found rendered as a grey tile reading "No Preview": the
 * search worked, the answer was right, and the user saw twelve empty squares. The chat
 * is behind a kill switch, so nobody hit it — this was waiting for the switch to flip.
 *
 * The link is built here rather than interpolated in the component because `image_key`
 * is the camera frame name and 113 of them name two photos each; the component has no
 * way to know which one it holds.
 */

import { cfImageUrl } from '$lib/utils/cloudflare-images';

export interface ChatPhotoRow {
	photo_id: string;
	image_key: string;
	cf_image_id: string | null;
	album_key: string | null;
	album_name: string | null;
	sport_type?: string | null;
	play_type?: string | null;
	photo_category?: string | null;
	caption?: string | null;
}

export interface ChatPhotoResult {
	image_key: string;
	/** Null only when the row carries no Cloudflare image; the grid shows "No Preview". */
	thumbnail_url: string | null;
	/** App-relative, e.g. `/photo/DSC05553`. The component prefixes `base`. */
	url: string;
	sport_type?: string;
	play_type?: string;
	photo_category?: string;
	caption?: string;
}

/**
 * @param rows      the rows a search branch returned, in the order they should display
 * @param addresses photo_id -> URL segment, from `photoAddresses` over the rows AND their peers
 */
export function shapeChatPhotos(
	rows: ReadonlyArray<ChatPhotoRow>,
	addresses: ReadonlyMap<string, string>
): ChatPhotoResult[] {
	return rows.map((row) => ({
		image_key: row.image_key,
		// `grid` (400w), not `thumbnail` (150px) — that variant is the blur placeholder and
		// renders visibly soft at the size this grid displays.
		thumbnail_url: row.cf_image_id ? cfImageUrl(row.cf_image_id, 'grid') : null,
		// Falling back to image_key matches the sitemap's rule: it is the right address for
		// the 20,542 keys that name exactly one photo, and the only address we have if the
		// peer lookup failed.
		url: `/photo/${addresses.get(row.photo_id) ?? row.image_key}`,
		sport_type: row.sport_type ?? undefined,
		play_type: row.play_type ?? undefined,
		photo_category: row.photo_category ?? undefined,
		caption: row.caption ?? undefined
	}));
}
