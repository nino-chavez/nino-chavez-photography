/**
 * Favorites Store - Manage user's favorite photos with localStorage persistence
 * Week 3: Engagement Features
 * Enhanced: Toast notifications for user feedback
 */

import type { Photo } from '$types/photo';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { toast } from './toast.svelte';
import { trackEngagement, trackAnalyticsEventV2 } from '$lib/analytics/client';
import { favoriteTransition } from '$lib/analytics/favorite-transaction';

const STORAGE_KEY = 'gallery-favorites';
const MAX_FAVORITES = 100; // Prevent unlimited storage growth

interface FavoritesState {
	photoIds: Set<string>;
	photos: Map<string, Photo>;
}

function createFavoritesStore() {
	// Initialize from localStorage (browser-only)
	const initialState: FavoritesState = {
		photoIds: new SvelteSet(),
		photos: new SvelteMap()
	};

	if (typeof window !== 'undefined') {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored);
				initialState.photoIds = new SvelteSet(parsed.photoIds || []);
				initialState.photos = new SvelteMap(
					(parsed.photos || []).map((photo: Photo) => [photo.image_key, photo])
				);
			}
		} catch (error) {
			console.error('[Favorites] Failed to load from localStorage:', error);
		}
	}

	let state = $state<FavoritesState>(initialState);

	// Save to localStorage whenever state changes
	function saveToStorage(): boolean {
		if (typeof window === 'undefined') return true;

		try {
			const toStore = {
				photoIds: Array.from(state.photoIds),
				photos: Array.from(state.photos.values())
			};
			localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
			return true;
		} catch (error) {
			console.error('[Favorites] Failed to save to localStorage:', error);
			return false;
		}
	}

	return {
		// Reactive getters
		get photoIds() {
			return state.photoIds;
		},
		get photos() {
			return Array.from(state.photos.values());
		},
		get count() {
			return state.photoIds.size;
		},

		// Check if photo is favorited
		isFavorite(photoId: string): boolean {
			return state.photoIds.has(photoId);
		},

		// Add photo to favorites
		addFavorite(photo: Photo, surface: string): boolean {
			if (favoriteTransition(state.photoIds.has(photo.image_key), 'add') !== 'add') return false;
			// Check limit
			if (state.photoIds.size >= MAX_FAVORITES) {
				throw new Error(`You can save up to ${MAX_FAVORITES} photos in this browser`);
			}

			state.photoIds.add(photo.image_key);
			state.photos.set(photo.image_key, photo);
			if (!saveToStorage()) {
				state.photoIds.delete(photo.image_key);
				state.photos.delete(photo.image_key);
				throw new Error('Could not save this photo');
			}

			// Persistence and analytics form one local transaction: only a committed add emits.
			trackEngagement('favorite', {
				photoId: photo.id,
				albumKey: photo.album_key,
				source: surface
			});
			trackAnalyticsEventV2({ eventName: 'favorite_added', properties: { photo_id: photo.id, album_key: photo.album_key, surface } });
			return true;
		},

		// Remove photo from favorites
		removeFavorite(photoId: string, surface: string): boolean {
			const photo = state.photos.get(photoId);
			if (!photo || favoriteTransition(state.photoIds.has(photoId), 'remove') !== 'remove') return false;
			state.photoIds.delete(photoId);
			state.photos.delete(photoId);
			if (!saveToStorage()) {
				state.photoIds.add(photoId);
				state.photos.set(photoId, photo);
				throw new Error('Could not update saved photos');
			}
			trackAnalyticsEventV2({ eventName: 'favorite_removed', properties: { photo_id: photo.id, album_key: photo.album_key, surface } });
			return true;
		},

		// Toggle favorite status
		toggleFavorite(photo: Photo, surface: string): boolean {
			const isFav = state.photoIds.has(photo.image_key);

			if (isFav) {
				if (!this.removeFavorite(photo.image_key, surface)) return false;
				toast.info('Removed from saved photos', { duration: 2000 });
				return false;
			} else {
				try {
					if (!this.addFavorite(photo, surface)) return false;
					const count = state.photoIds.size;
					toast.success(`Photo saved in this browser (${count} total)`, {
						duration: 3000
					});
					return true;
				} catch (error) {
					// Handle max favorites error
					if (error instanceof Error && error.message.includes('save up to')) {
						toast.error(`You can save up to ${MAX_FAVORITES} photos in this browser`, {
							duration: 4000
						});
					} else {
						toast.error('Could not save this photo', { duration: 3000 });
					}
					return false;
				}
			}
		},

		// Clear all favorites
		clearAll() {
			state.photoIds.clear();
			state.photos.clear();
			saveToStorage();
		},

		// Export favorites as JSON (for backup)
		exportFavorites(): string {
			return JSON.stringify({
				exported: new Date().toISOString(),
				count: state.photoIds.size,
				photos: this.photos
			});
		},

		// Import favorites from JSON (for restore)
		importFavorites(json: string) {
			try {
				const imported = JSON.parse(json);
				if (!imported.photos || !Array.isArray(imported.photos)) {
					throw new Error('Invalid import format');
				}

				// Clear existing
				state.photoIds.clear();
				state.photos.clear();

				// Import photos (respect limit)
				const photosToImport = imported.photos.slice(0, MAX_FAVORITES);
				photosToImport.forEach((photo: Photo) => {
					state.photoIds.add(photo.image_key);
					state.photos.set(photo.image_key, photo);
				});

				saveToStorage();
				return photosToImport.length;
			} catch (error) {
				console.error('[Favorites] Import failed:', error);
				throw error;
			}
		}
	};
}

export const favorites = createFavoritesStore();
