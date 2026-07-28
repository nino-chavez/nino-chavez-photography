/**
 * Photo Tagging Page - Server Load
 * Loads photo data and approved tags
 */

import { error } from '@sveltejs/kit';
import { supabaseServer, transformPhotoRow, PHOTO_COLUMNS } from '$lib/supabase/server';
import { NON_KEYS, resolvePhotoByImageKey } from '$lib/supabase/resolve-photo-by-key';
import type { PageServerLoad } from './$types';
import type { PhotoMetadataRow } from '$types/database';

export const load: PageServerLoad = async ({ params, url }) => {
	// Same guard as the detail route: stringified nulls are not image keys, and answering one
	// costs a database round trip before the inevitable 404.
	if (!params.id || NON_KEYS.has(params.id)) {
		throw error(404, 'Photo not found');
	}

	// This was `.eq('image_key').single()`, which raises on more than one row. image_key is NOT
	// unique — camera DSC numbers reset per card — so every collision 404'd here while the detail
	// route beside it resolved the same URL correctly. Router telemetry is what surfaced it: a
	// crawler walking the gallery got 200 on /photo/:key and 404 on /photo/:key/tag.
	const resolved = await resolvePhotoByImageKey<PhotoMetadataRow>(
		params.id,
		PHOTO_COLUMNS,
		url.searchParams.get('a')
	);

	if (!resolved) {
		throw error(404, 'Photo not found');
	}

	const photoData = resolved.row;

	// Transform to Photo type (includes CF Images support)
	const photo = transformPhotoRow(photoData);

	// Fetch approved tags for this photo
	const { data: tags, error: tagsError } = await supabaseServer
		.from('user_tags')
		.select('*')
		.eq('photo_id', photoData.photo_id)
		.eq('approved', true);

	if (tagsError) {
		console.error('[Photo Tagging] Error fetching tags:', tagsError);
	}

	return {
		photo,
		approvedTags: tags || []
	};
};
