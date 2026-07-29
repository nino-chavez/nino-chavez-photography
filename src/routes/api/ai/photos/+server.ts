/**
 * AI-Friendly Photos API
 *
 * Provides public API for AI crawlers and answer engines to access photo data.
 * Supports JSON and JSON-LD (Schema.org) formats.
 */

import { json } from '@sveltejs/kit';
import { PHOTOS_READ } from '$lib/supabase/columns';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabase/server';
import { getPhotoCount } from '$lib/supabase/server';
import { photoSelect } from '$lib/supabase/columns';
import { cfImageUrl } from '$lib/utils/cloudflare-images';
import { createAlbumSlug } from '$lib/utils';
import { photoAddresses } from '$lib/supabase/photo-address';
import { photoIdentityPeers } from '$lib/supabase/photo-address-server';
import { SITE_URL } from '$lib/site-url';
import { personSchema } from '$lib/aeo/person';
import type { PhotoMetadataRow } from '$types/database';

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
			.from(PHOTOS_READ)
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

		// image_key is NOT unique — 113 are shared across albums — so `/photo/<image_key>` can
		// resolve to a different photo than the one described here. Verified: /photo/DSC05563
		// serves a Lewis vs Pepperdine frame while the Bell Pepper Open frame with the same key
		// is only reachable at its cf_image_id. Same fix as the sitemap and photo page (#98);
		// the peer lookup is what makes the sharing count global rather than page-local.
		const addresses = photoAddresses(
			await photoIdentityPeers(
				photos.map((row) => ({
					photo_id: row.photo_id,
					image_key: row.image_key,
					cf_image_id: row.cf_image_id ?? null,
					album_key: row.album_key ?? null,
					album_name: row.album_name ?? null
				}))
			)
		);
		const addressOf = (row: PhotoMetadataRow) => addresses.get(row.photo_id) ?? row.image_key;

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
						item: createPhotographSchema(row, addressOf(row))
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
				id: addressOf(row),
				url: `${SITE_URL}/photo/${addressOf(row)}`,
				image_url: row.cf_image_id ? cfImageUrl(row.cf_image_id, 'large') : '',
				thumbnail_url: row.cf_image_id ? cfImageUrl(row.cf_image_id, 'thumbnail') : '',
				title: row.album_name || 'Untitled Photo',
				description: generateDescription(row),
				// NOTE: the vanity CATEGORICAL aesthetic fields (action_intensity, composition,
				// time_of_day, lighting, ...) were removed (cutover prep) — those columns are
				// being DROPPED at the schema cutover.
				metadata: {
					sport_type: row.sport_type,
					photo_category: row.photo_category,
					play_type: row.play_type
				},
				date: row.photo_date || row.enriched_at || row.upload_date,
				album: row.album_key
					? {
							key: row.album_key,
							name: row.album_name || 'Unknown Album',
							// Slug form, matching the sitemap and the site's own links; a bare key 301s.
							url: `${SITE_URL}/albums/${createAlbumSlug(row.album_name || row.album_key, row.album_key)}`
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
function createPhotographSchema(row: PhotoMetadataRow, segment: string) {
	const imageUrl = row.cf_image_id ? cfImageUrl(row.cf_image_id, 'large') : '';
	const thumbnailUrl = row.cf_image_id ? cfImageUrl(row.cf_image_id, 'thumbnail') : '';

	return {
		'@type': 'Photograph',
		'@id': `${SITE_URL}/photo/${segment}`,
		url: `${SITE_URL}/photo/${segment}`,
		image: {
			'@type': 'ImageObject',
			contentUrl: imageUrl,
			thumbnailUrl: thumbnailUrl,
			encodingFormat: 'image/jpeg',
			width: row.width || undefined,
			height: row.height || undefined
		},
		name: row.album_name || 'Untitled Photo',
		description: generateDescription(row),
		creator: personSchema({ knowsAbout: [row.sport_type] }),
		dateCreated: row.photo_date || row.enriched_at || row.upload_date,
		keywords: [
			row.sport_type,
			row.photo_category,
			row.play_type
		].filter(Boolean).join(', ')
	};
}

/**
 * Generate AI-friendly description for photo
 *
 * The vanity CATEGORICAL aesthetic attributes (action_intensity, lighting) were removed
 * (cutover prep) — those columns are being DROPPED at the schema cutover. The description
 * prefers the durable AI caption and concrete sport/play context.
 */
function generateDescription(row: PhotoMetadataRow): string {
	const sport = row.sport_type || 'sports';
	const category = row.photo_category || 'photo';
	const playType = row.play_type;

	let description = `Professional ${sport} ${category} photo`;

	if (playType) {
		description += ` featuring ${playType}`;
	}

	if (row.caption) {
		description += `. ${row.caption}`;
	} else {
		description += '. Professional sports photography by Nino Chavez.';
	}

	return description;
}
