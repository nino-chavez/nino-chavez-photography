/**
 * Saved photos in this browser: the storage rules, with no framework imports so they can be
 * tested directly (`npm run saved-photos:test`). `favorites.svelte.ts` wraps this with reactive
 * state, toasts and analytics.
 *
 * KEYED BY `photo.id`, NOT `image_key`. `image_key` is the camera's frame name and is shared by
 * two different photos when frame numbers reset per card (see resolve-photo-by-key.ts). Keyed by
 * it, saving one photo marked its twin saved, and tapping the twin removed the first (#255).
 * `id` is `photo_metadata.photo_id`, the primary key, set by `transformPhotoRow`.
 *
 * EVERY CHANGE STARTS FROM WHAT IS STORED NOW. Each open tab used to keep the list it loaded and
 * write that whole list back on every change, so a save in one tab was lost when another tab
 * saved (#256). `read()` runs before each change, and the new list is kept in memory only after
 * the browser accepted the write, so a refused write (storage full) never reports success (#257).
 */

import type { Photo } from '$types/photo';

export const STORAGE_KEY = 'gallery-favorites';
export const MAX_SAVED = 100;

export type SavedPhotos = ReadonlyMap<string, Photo>;

export interface SavedPhotosStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

/** A record can be kept only if it names its unique id and the key its address is built from. */
export function isSavableRecord(value: unknown): value is Photo {
	if (!value || typeof value !== 'object') return false;
	const record = value as Partial<Photo>;
	return typeof record.id === 'string' && record.id !== '' && typeof record.image_key === 'string' && record.image_key !== '';
}

/** Keep valid records, first one per id wins, at most MAX_SAVED. */
function keepValid(records: unknown[]): Map<string, Photo> {
	const out = new Map<string, Photo>();
	for (const record of records) {
		if (out.size >= MAX_SAVED) break;
		if (isSavableRecord(record) && !out.has(record.id)) out.set(record.id, record);
	}
	return out;
}

/**
 * Read the stored list. The records are the source of truth; a stored `photoIds` list is ignored.
 * Earlier versions filled it with `image_key`s, so it could name a photo with no stored record,
 * which could then never be removed.
 */
export function readSaved(raw: string | null): Map<string, Photo> {
	if (!raw) return new Map();
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return new Map();
	}
	const photos = (parsed as { photos?: unknown } | null)?.photos;
	return Array.isArray(photos) ? keepValid(photos) : new Map();
}

export function serializeSaved(saved: SavedPhotos): string {
	return JSON.stringify({ photos: [...saved.values()] });
}

/**
 * Parse an exported file for import. Throws before anything is changed when the file is not an
 * export or holds no usable record. Entries that are not usable records are skipped; the caller
 * reports how many were kept, not how many the file listed.
 */
export function parseImport(json: string): Map<string, Photo> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		throw new Error('Invalid import format');
	}
	const photos = (parsed as { photos?: unknown } | null)?.photos;
	if (!Array.isArray(photos)) throw new Error('Invalid import format');
	const kept = keepValid(photos);
	if (photos.length > 0 && kept.size === 0) throw new Error('No photos in this file could be imported');
	return kept;
}

export type AddOutcome = 'added' | 'already_saved' | 'limit' | 'invalid' | 'write_failed';
export type RemoveOutcome = 'removed' | 'not_saved' | 'write_failed';

/**
 * The storage cycle for one tab. `storage` is null on the server, where the list lives only in
 * memory. Each method returns the list as it now stands in storage, or as it stood before a
 * refused write.
 */
export function createSavedPhotos(storage: SavedPhotosStorage | null) {
	let last: Map<string, Photo> = new Map();

	function read(): Map<string, Photo> {
		if (!storage) return last;
		try {
			last = readSaved(storage.getItem(STORAGE_KEY));
		} catch (error) {
			console.error('[Favorites] Failed to load from localStorage:', error);
		}
		return last;
	}

	function write(next: Map<string, Photo>): boolean {
		if (storage) {
			try {
				storage.setItem(STORAGE_KEY, serializeSaved(next));
			} catch (error) {
				console.error('[Favorites] Failed to save to localStorage:', error);
				return false;
			}
		}
		last = next;
		return true;
	}

	return {
		read,

		add(photo: Photo): { outcome: AddOutcome; saved: SavedPhotos } {
			const current = read();
			if (!isSavableRecord(photo)) return { outcome: 'invalid', saved: current };
			if (current.has(photo.id)) return { outcome: 'already_saved', saved: current };
			if (current.size >= MAX_SAVED) return { outcome: 'limit', saved: current };
			const next = new Map(current).set(photo.id, photo);
			return write(next) ? { outcome: 'added', saved: next } : { outcome: 'write_failed', saved: current };
		},

		remove(photoId: string): { outcome: RemoveOutcome; saved: SavedPhotos; photo: Photo | null } {
			const current = read();
			const photo = current.get(photoId) ?? null;
			if (!photo) return { outcome: 'not_saved', saved: current, photo: null };
			const next = new Map(current);
			next.delete(photoId);
			return write(next)
				? { outcome: 'removed', saved: next, photo }
				: { outcome: 'write_failed', saved: current, photo };
		},

		/** Replace the whole list (import, clear). False, and nothing changed, if the write was refused. */
		replace(next: Map<string, Photo>): { ok: boolean; saved: SavedPhotos } {
			return write(next) ? { ok: true, saved: next } : { ok: false, saved: last };
		}
	};
}
