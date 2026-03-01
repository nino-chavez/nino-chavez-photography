/**
 * AI-Friendly Photos API
 *
 * Provides public API for AI crawlers and answer engines to access photo data.
 * Supports JSON and JSON-LD (Schema.org) formats.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabase/server';
import { getPhotoCount } from '$lib/supabase/server';
import { photoSelect } from '$lib/supabase/columns';
import { cfImageUrl } from '$lib/utils/cloudflare-images';
import type { PhotoMetadataRow } from '$types/database';

const BASE_URL = 'https://ninochavez.co/photography';

export const GET: RequestHandler = async ({ url }) => {
	try {
		// Parse query parameters
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
		const offset = parseInt(url.searchParams.get('offset') || '0');
		const sport = url.searchParams.get('sport') || undefined;
		const category = url.searchParams.get('category') || undefined;
		const playType = url.searchParams.get('play_type') || undefined;
		const format = url.searchParams.get('format') || 'json';

		// Build query
		let query = supabaseServer
			.from('photo_metadata')
			.select(photoSelect('width, height'))
			.not('sharpness', 'is', null); // Only enriched photos

		// Apply filters
		if (sport) {
			query = query.eq('sport_type', sport);
		}
		if (category) {
			query = query.eq('photo_category', category);
		}
		if (playType) {
			query = query.eq('play_type', playType);
		}

		// Apply sorting and pagination
		query = query
			.order('upload_date', { ascending: false })
			.range(offset, offset + limit - 1);

		const { data: rows, error } = await query;

		if (error) {
			console.error('[API] Error fetching photos:', error);
			return json({ error: 'Failed to fetch photos' }, { status: 500 });
		}

		// Build filters for count
		const filters: any = {};
		if (sport) filters.sportType = sport;
		if (category) filters.photoCategory = category;
		if (playType) filters.playTypes = [playType];

		// Get total count
		const total = await getPhotoCount(filters);

		const photos = (rows || []) as unknown as PhotoMetadataRow[];

		// Format response based on format parameter
		if (format === 'jsonld') {
			// Return JSON-LD Schema.org format
			const jsonld = {
				'@context': 'https://schema.org',
				'@type': 'CollectionPage',
				mainEntity: {
					'@type': 'ItemList',
					numberOfItems: total,
					itemListElement: photos.map((row, index) => ({
						'@type': 'ListItem',
						position: offset + index + 1,
						item: createPhotographSchema(row)
					}))
				}
			};

			return json(jsonld, {
				headers: {
					'Content-Type': 'application/ld+json'
				}
			});
		}

		// Return standard JSON format
		return json({
			photos: photos.map((row) => ({
				id: row.image_key,
				url: `${BASE_URL}/photo/${row.image_key}`,
				image_url: row.cf_image_id ? cfImageUrl(row.cf_image_id, 'large') : '',
				thumbnail_url: row.cf_image_id ? cfImageUrl(row.cf_image_id, 'thumbnail') : '',
				title: row.album_name || row.title || 'Untitled Photo',
				description: generateDescription(row),
				metadata: {
					sport_type: row.sport_type,
					photo_category: row.photo_category,
					play_type: row.play_type,
					action_intensity: row.action_intensity,
					composition: row.composition,
					time_of_day: row.time_of_day,
					lighting: row.lighting
				},
				date: row.photo_date || row.enriched_at || row.upload_date,
				album: row.album_key
					? {
							key: row.album_key,
							name: row.album_name || 'Unknown Album',
							url: `${BASE_URL}/albums/${row.album_key}`
						}
					: null
			})),
			total,
			limit,
			offset
		});
	} catch (error) {
		console.error('[API] Error fetching photos:', error);
		return json({ error: 'Failed to fetch photos' }, { status: 500 });
	}
};

/**
 * Create Schema.org Photograph object for a photo
 */
function createPhotographSchema(row: PhotoMetadataRow) {
	const imageUrl = row.cf_image_id ? cfImageUrl(row.cf_image_id, 'large') : '';
	const thumbnailUrl = row.cf_image_id ? cfImageUrl(row.cf_image_id, 'thumbnail') : '';

	return {
		'@type': 'Photograph',
		'@id': `${BASE_URL}/photo/${row.image_key}`,
		url: `${BASE_URL}/photo/${row.image_key}`,
		image: {
			'@type': 'ImageObject',
			contentUrl: imageUrl,
			thumbnailUrl: thumbnailUrl,
			encodingFormat: 'image/jpeg',
			width: row.width || undefined,
			height: row.height || undefined
		},
		name: row.album_name || row.title || 'Untitled Photo',
		description: generateDescription(row),
		creator: {
			'@type': 'Person',
			name: 'Nino Chavez',
			url: `${BASE_URL}/about`
		},
		dateCreated: row.photo_date || row.enriched_at || row.upload_date,
		keywords: [
			row.sport_type,
			row.photo_category,
			row.play_type,
			row.action_intensity
		].filter(Boolean).join(', ')
	};
}

/**
 * Generate AI-friendly description for photo
 */
function generateDescription(row: PhotoMetadataRow): string {
	const sport = row.sport_type || 'sports';
	const category = row.photo_category || 'photo';
	const playType = row.play_type;
	const intensity = row.action_intensity;

	let description = `Professional ${sport} ${category} photo`;

	if (playType) {
		description += ` featuring ${playType}`;
	}

	if (intensity) {
		description += ` with ${intensity} action intensity`;
	}

	if (row.lighting) {
		description += ` captured with ${row.lighting} lighting`;
	}

	description += '. Professional sports photography by Nino Chavez.';

	return description;
}

