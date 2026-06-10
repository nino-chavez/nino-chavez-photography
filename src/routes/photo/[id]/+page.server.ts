/**
 * Photo Detail Page - Server-Side Data Loading
 *
 * Loads individual photo data from Supabase and generates SEO meta tags
 * for social sharing (Open Graph, Twitter Cards, Schema.org)
 */

import { error } from '@sveltejs/kit';
import { PHOTOS_READ } from '$lib/supabase/columns';
import { supabaseServer, transformPhotoRow, PHOTO_COLUMNS } from '$lib/supabase/server';
import { PHOTO_DETAIL_COLUMNS } from '$lib/supabase/columns';
import { trackPhotoView } from '$lib/analytics/tracker';
import type { PageServerLoad } from './$types';
import type { Photo } from '$types/photo';
import type { PhotoMetadataRow } from '$types/database';
import { cfImageUrl } from '$lib/utils/cloudflare-images';

export const load: PageServerLoad = async ({ params, url }) => {
	// Fetch by image_key. NOTE: image_key is NOT unique — camera DSC numbers reset per card, so the
	// same image_key recurs across albums. Using .single() here 404s on any collision. Fetch the
	// candidates and prefer one from a LISTED album, so an unlisted/duplicate album never shadows the
	// real one (this is what was 404'ing every photo after a duplicate album was ingested).
	const { data: candidates, error: photoError } = await supabaseServer
		.from(PHOTOS_READ)
		.select(PHOTO_DETAIL_COLUMNS)
		.eq('image_key', params.id)
		.limit(5);

	if (photoError || !candidates || candidates.length === 0) {
		throw error(404, `Photo not found: ${params.id}`);
	}

	// Disambiguate a non-unique image_key:
	//  1. exact album from the link context (?a=) — the photo the user actually clicked (P2);
	//  2. else prefer a LISTED album, so an unlisted/duplicate never shadows the real one.
	const albumHint = url.searchParams.get('a');
	let rawData = candidates[0];
	if (candidates.length > 1) {
		const exact = albumHint
			? candidates.find((c) => (c as { album_key: string }).album_key === albumHint)
			: undefined;
		if (exact) {
			rawData = exact;
		} else {
			const albumKeys = [...new Set(candidates.map((c) => (c as { album_key: string }).album_key))];
			const { data: unlisted } = await supabaseServer
				.from('album_settings')
				.select('album_key')
				.eq('visibility', 'unlisted')
				.in('album_key', albumKeys);
			const unlistedSet = new Set((unlisted ?? []).map((a) => a.album_key));
			rawData = candidates.find((c) => !unlistedSet.has((c as { album_key: string }).album_key)) ?? candidates[0];
		}
	}

	const photoData = rawData as unknown as PhotoMetadataRow;

	// Transform flat Supabase data to nested Photo type (two-bucket model)
	// NOTE: the 6 vanity CATEGORICAL aesthetic fields (composition, time_of_day, lighting,
	// color_temperature, emotion, action_intensity) were removed (cutover prep) ahead of their
	// schema DROP. The numeric quality sub-scores below STAY.
	const cfId = photoData.cf_image_id || '';
	const photo: Photo = {
		id: photoData.image_key,
		image_key: photoData.image_key,
		cf_image_id: cfId || undefined,
		image_url: cfImageUrl(cfId, 'large'),
		thumbnail_url: cfImageUrl(cfId, 'thumbnail'),
		original_url: cfImageUrl(cfId, 'public'),
		title: photoData.album_name || 'Untitled Photo',
		caption: photoData.caption || '',
		keywords: [],
		created_at: photoData.photo_date || photoData.enriched_at || photoData.upload_date,
		metadata: {
			// BUCKET 1: Concrete & Filterable
			play_type: (photoData.play_type || null) as Photo['metadata']['play_type'],
			sport_type: photoData.sport_type || 'volleyball',
			photo_category: photoData.photo_category || 'action',

			// BUCKET 2: Abstract & Internal (numeric quality sub-scores)
			sharpness: photoData.sharpness || 0,
			composition_score: photoData.composition_score || 0,
			exposure_accuracy: photoData.exposure_accuracy || 0,
			emotional_impact: photoData.emotional_impact || 0,
			time_in_game: (photoData.time_in_game || undefined) as Photo['metadata']['time_in_game'],

			// AI metadata
			ai_provider: (photoData.ai_provider || 'gemini') as Photo['metadata']['ai_provider'],
			ai_cost: photoData.ai_cost || 0,
			enriched_at: photoData.enriched_at || new Date().toISOString()
		},
		// EXIF metadata for enhanced Schema.org markup
		exif: {
			photo_date: photoData.photo_date || undefined,
			upload_date: photoData.upload_date || undefined,
			width: photoData.width || undefined,
			height: photoData.height || undefined,
			aspect_ratio: photoData.aspect_ratio ? parseFloat(photoData.aspect_ratio.toString()) : undefined,
			album_key: photoData.album_key || undefined,
			album_name: photoData.album_name || undefined
		}
	};

	// Generate SEO-optimized description
	const seoDescription = generatePhotoDescription(photo);

	// Use thumbnail for OG image (faster loading, still high quality)
	const ogImage = photo.thumbnail_url || photo.image_url;

	// Build canonical URL
	const baseUrl = 'https://photography.ninochavez.co';
	const canonicalUrl = `${baseUrl}/photo/${params.id}`;

	// PERFORMANCE: Parallelize secondary queries (related, similar, tags)
	// This reduces TTFB by running queries concurrently instead of sequentially
	const [relatedPhotos, similarPhotos, tagsResult] = await Promise.all([
		fetchRelatedPhotos(photo, photoData.album_key || ''),
		fetchSimilarPhotos(photoData),
		supabaseServer
			.from('user_tags')
			.select('*')
			.eq('photo_id', photoData.photo_id)
			.eq('approved', true)
	]);

	const tags = tagsResult.data;

	// Track photo view (NEW - Analytics)
	// Determine view source from referrer
	const referrer = url.searchParams.get('ref') || url.searchParams.get('from');
	let viewSource: 'explore' | 'collection' | 'album' | 'direct' | 'search' | 'timeline' | 'favorites' = 'direct';

	if (referrer) {
		if (referrer.startsWith('collection-')) {
			viewSource = 'collection';
		} else if (referrer.startsWith('album-')) {
			viewSource = 'album';
		} else if (referrer === 'explore') {
			viewSource = 'explore';
		} else if (referrer === 'search') {
			viewSource = 'search';
		} else if (referrer === 'timeline') {
			viewSource = 'timeline';
		} else if (referrer === 'favorites') {
			viewSource = 'favorites';
		}
	}

	// Track asynchronously (don't wait)
	trackPhotoView({
		photo_id: photoData.photo_id,
		view_source: viewSource,
		referrer: referrer || undefined,
	});

	return {
		photo,
		relatedPhotos,
		similarPhotos,
		approvedTags: tags || [],
		seo: {
			title: `${photo.title} | Nino Chavez Photography`,
			description: seoDescription,
			ogImage: ogImage,
			ogType: 'article' as const,
			canonical: canonicalUrl,
			keywords: photo.keywords.join(', ')
		}
	};
};

/**
 * Generate SEO-optimized description for photo (two-bucket model)
 *
 * The vanity CATEGORICAL aesthetic attributes (lighting, time_of_day) were removed
 * (cutover prep) — those columns are being DROPPED at the schema cutover. The description
 * now prefers the durable AI caption and concrete sport/category context.
 */
function generatePhotoDescription(photo: Photo): string {
	const sport = photo.metadata.sport_type || 'sports';
	const category = photo.metadata.photo_category || 'photo';

	// Base description (all photos are worthy)
	let description = `Professional ${sport} ${category} photo`;

	// Add caption if present
	if (photo.caption) {
		description += `. ${photo.caption}`;
	} else {
		description += '. Professional sports photography by Nino Chavez.';
	}

	// Generic call-to-action
	description += ' Perfect for recruiting, social media, and print.';

	return description;
}

/**
 * Fetch related photos based on sport, category, album, and similarity
 * (NEW - Week 2: Related Photos Carousel)
 */
async function fetchRelatedPhotos(currentPhoto: Photo, albumKey: string): Promise<Photo[]> {
	const sportType = currentPhoto.metadata.sport_type;
	const photoCategory = currentPhoto.metadata.photo_category;

	// Strategy: Fetch photos prioritizing:
	// 1. Same album (most relevant context)
	// 2. Same sport + category
	// 3. Same sport only
	// Sort by newest and limit to 12

	const { data, error } = await supabaseServer
		.from(PHOTOS_READ)
		.select(PHOTO_COLUMNS)
		.neq('image_key', currentPhoto.image_key) // Exclude current photo
		.not('sharpness', 'is', null) // Only enriched photos
		.or(`album_key.eq.${albumKey},and(sport_type.eq.${sportType},photo_category.eq.${photoCategory}),sport_type.eq.${sportType}`)
		.order('upload_date', { ascending: false })
		.limit(12);

	if (error) {
		console.error('[Photo Detail] Error fetching related photos:', error);
		return [];
	}

	// Transform to Photo type using shared transform (includes CF Images support)
	return (data || []).map(transformPhotoRow);
}

/**
 * Fetch similar photos using vector embeddings
 * (Initiative 3.2: Similarity-Powered Exploration)
 */
async function fetchSimilarPhotos(currentPhoto: PhotoMetadataRow): Promise<Photo[]> {
	// Check if current photo has an embedding
	if (!currentPhoto.embedding) {
		// Embedding not yet generated for this photo — skip similarity search silently
		return [];
	}

	// Call match_photos() database function
	const { data, error } = await supabaseServer.rpc('match_photos', {
		query_embedding: currentPhoto.embedding,
		match_threshold: 0.7, // 70% similarity minimum
		match_count: 12 // Return up to 12 similar photos
	});

	if (error) {
		console.error('[Photo Detail] Error fetching similar photos:', error);
		return [];
	}

	if (!data || data.length === 0) {
		return [];
	}

	// Fetch full photo data for the similar photos
	const imageKeys = data.map((result: any) => result.image_key);

	const { data: photos, error: photosError } = await supabaseServer
		.from(PHOTOS_READ)
		.select(PHOTO_COLUMNS)
		.in('image_key', imageKeys)
		.not('sharpness', 'is', null); // Only enriched photos

	if (photosError || !photos) {
		console.error('[Photo Detail] Error fetching similar photo details:', photosError);
		return [];
	}

	// Transform to Photo type using shared transform (includes CF Images support)
	return photos.map(transformPhotoRow);
}
