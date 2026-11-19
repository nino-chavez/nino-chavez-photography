/**
 * Saved photos, kept in this browser's localStorage.
 *
 * The storage rules live in `saved-photos.ts`, which is tested on its own: photos are keyed by
 * their unique `id`, every change starts from what is stored now (so two open tabs cannot
 * overwrite each other), and the list in memory changes only after the browser accepted the write.
 * This store adds reactive state, toasts and analytics.
 */

import type { Photo } from '$types/photo';
import { toast } from './toast.svelte';
import { trackEngagement, trackAnalyticsEventV2 } from '$lib/analytics/client';
import { favoriteTransition } from '$lib/analytics/favorite-transaction';
import { MAX_SAVED, STORAGE_KEY, createSavedPhotos, parseImport, type SavedPhotos } from './saved-photos';

const REMOVAL_TOAST_KEY = 'favorite-removal';

function createFavoritesStore() {
	const browser = typeof window !== 'undefined';
	let storage: Storage | null = null;
	if (browser) {
		try {
			storage = window.localStorage;
		} catch (error) {
			console.error('[Favorites] localStorage is unavailable:', error);
		}
	}
	const store = createSavedPhotos(storage);

	let saved = $state.raw<SavedPhotos>(store.read());

	/** Show what is stored now, which another tab may have changed. */
	function refresh(): SavedPhotos {
		saved = store.read();
		return saved;
	}

	if (browser) {
		// Another tab saved or removed a photo: show it here too. `key` is null when storage was cleared.
		window.addEventListener('storage', (event) => {
			if (event.key === STORAGE_KEY || event.key === null) refresh();
		});
	}

	return {
		get photos() {
			return Array.from(saved.values());
		},
		get count() {
			return saved.size;
		},

		isFavorite(photoId: string): boolean {
			return saved.has(photoId);
		},

		addFavorite(photo: Photo, surface: string): boolean {
			const result = store.add(photo);
			saved = result.saved;
			if (favoriteTransition(result.outcome === 'already_saved', 'add') !== 'add') return false;
			if (result.outcome === 'limit') throw new Error(`You can save up to ${MAX_SAVED} photos in this browser`);
			if (result.outcome !== 'added') throw new Error('Could not save this photo');

			// Persistence and analytics form one local transaction: only a committed add emits.
			trackEngagement('favorite', {
				photoId: photo.id,
				albumKey: photo.album_key,
				source: surface
			});
			trackAnalyticsEventV2({ eventName: 'favorite_added', properties: { photo_id: photo.id, album_key: photo.album_key, surface } });
			return true;
		},

		removeFavorite(photoId: string, surface: string): Photo | null {
			const result = store.remove(photoId);
			saved = result.saved;
			if (favoriteTransition(result.outcome !== 'not_saved', 'remove') !== 'remove') return null;
			if (result.outcome === 'write_failed') throw new Error('Could not update saved photos');
			const photo = result.photo!;
			trackAnalyticsEventV2({ eventName: 'favorite_removed', properties: { photo_id: photo.id, album_key: photo.album_key, surface } });
			return photo;
		},

		// Re-add the exact record removed by Undo. A second activation is harmless:
		// the photo is already present and storage is not written again.
		restoreFavorite(photo: Photo, surface: string): boolean {
			if (refresh().has(photo.id)) return true;
			return this.addFavorite(photo, surface);
		},

		toggleFavorite(photo: Photo, surface: string): boolean {
			if (refresh().has(photo.id)) {
				const removedPhoto = this.removeFavorite(photo.id, surface);
				if (!removedPhoto) return false;
				toast.info('Removed from saved photos', {
					duration: 6000,
					replaceKey: REMOVAL_TOAST_KEY,
					action: {
						label: 'Undo',
						onAction: () => {
							try {
								if (this.restoreFavorite(removedPhoto, 'saved_undo')) {
									toast.success('Photo restored to saved photos', { duration: 3000 });
								}
							} catch {
								toast.error('Could not restore this photo', { duration: 3000 });
							}
						}
					}
				});
				return false;
			}
			try {
				if (!this.addFavorite(photo, surface)) return false;
				toast.success(`Photo saved in this browser (${saved.size} total)`, { duration: 3000 });
				return true;
			} catch (error) {
				if (error instanceof Error && error.message.includes('save up to')) {
					toast.error(`You can save up to ${MAX_SAVED} photos in this browser`, { duration: 4000 });
				} else {
					toast.error('Could not save this photo', { duration: 3000 });
				}
				return false;
			}
		},

		clearAll(): boolean {
			const result = store.replace(new Map());
			saved = result.saved;
			return result.ok;
		},

		// Export favorites as JSON (for backup)
		exportFavorites(): string {
			return JSON.stringify({
				exported: new Date().toISOString(),
				count: saved.size,
				photos: this.photos
			});
		},

		/**
		 * Replace the list with an exported file's photos. Throws, with the list unchanged, when the
		 * file is not an export, holds no usable photo, or the browser refuses the write. Returns the
		 * number of photos actually kept.
		 */
		importFavorites(json: string): number {
			const imported = parseImport(json);
			const result = store.replace(imported);
			saved = result.saved;
			if (!result.ok) throw new Error('Could not store the imported photos in this browser');
			return imported.size;
		}
	};
}

export const favorites = createFavoritesStore();
