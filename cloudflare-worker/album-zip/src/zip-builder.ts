import { zipSync } from 'fflate';
import type { AlbumPhoto } from './types';

const BATCH_SIZE = 10;
// Per-image fetch timeout. Without it, one slow/hung imagedelivery response can stall an entire
// batch (and with ~300 photos, cascade into the Worker CPU/wall-clock limit). On timeout the image
// is skipped like any other failure.
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Build a ZIP file from album photos using fflate (store mode, no compression).
 * Fetches images in parallel batches to balance memory and throughput.
 * Skips individual images that fail to fetch (incl. timeouts).
 */
export async function buildZip(
	photos: AlbumPhoto[],
	cfAccountHash: string
): Promise<Uint8Array> {
	const files: Record<string, Uint8Array> = {};

	for (let i = 0; i < photos.length; i += BATCH_SIZE) {
		const batch = photos.slice(i, i + BATCH_SIZE);
		const results = await Promise.allSettled(
			batch.map(async (photo) => {
				const url = `https://imagedelivery.net/${cfAccountHash}/${photo.cf_image_id}/large`;
				const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
				if (!response.ok) {
					throw new Error(`Failed to fetch ${photo.image_key}: ${response.status}`);
				}
				const buffer = await response.arrayBuffer();
				return { name: `${photo.image_key}.jpg`, data: new Uint8Array(buffer) };
			})
		);

		for (const result of results) {
			if (result.status === 'fulfilled') {
				files[result.value.name] = result.value.data;
			} else {
				console.error('[zip-builder] Skipped image:', result.reason);
			}
		}
	}

	return zipSync(files, { level: 0 });
}
