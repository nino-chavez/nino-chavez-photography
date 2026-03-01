/**
 * Photo Tagging Page - Server Load
 * Loads photo data and approved tags
 */

import { error } from '@sveltejs/kit';
import { supabaseServer, transformPhotoRow, PHOTO_COLUMNS } from '$lib/supabase/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	// Fetch photo data
	const { data: photoData, error: photoError } = await supabaseServer
		.from('photo_metadata')
		.select(PHOTO_COLUMNS)
		.eq('image_key', params.id)
		.single();

	if (photoError || !photoData) {
		throw error(404, 'Photo not found');
	}

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
