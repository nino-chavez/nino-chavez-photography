/**
 * Photo Detail Page - Server-Side Data Loading
 *
 * Loads individual photo data from Supabase and generates SEO meta tags
 * for social sharing (Open Graph, Twitter Cards, Schema.org)
 */

import { error } from '@sveltejs/kit';
import { supabaseServer, transformPhotoRow } from '$lib/supabase/server';
import { trackPhotoView } from '$lib/analytics/tracker';
import type { PageServerLoad } from './$types';
import type { Photo } from '$types/photo';
import type { PhotoMetadataRow } from '$types/database';
import { cfImageUrl, hasCFImage } from '$lib/utils/cloudflare-images';

export const load: PageServerLoad = async ({ params, url }) => {
	// Fetch photo from Supabase using image_key
	const { data: photoData, error: photoError } = await supabaseServer
		.from('photo_metadata')
		.select('*')
		.eq('image_key', params.id)
		.single();

	if (photoError || !photoData) {
		throw error(404, `Photo not found: ${params.id}`);
	}

	// Transform flat Supabase data to nested Photo type (two-bucket model)
	// Use CF Images URLs when available, SmugMug fallback otherwise
	const cfId = photoData.cf_image_id;
	const photo: Photo = {
		id: photoData.image_key,
		image_key: photoData.image_key,
		cf_image_id: cfId || undefined,
		image_url: hasCFImage(cfId) ? cfImageUrl(cfId, 'large') : photoData.ImageUrl,
		thumbnail_url: hasCFImage(cfId) ? cfImageUrl(cfId, 'thumbnail') : photoData.ThumbnailUrl,
		original_url: hasCFImage(cfId) ? cfImageUrl(cfId, 'public') : photoData.OriginalUrl,
		title: photoData.album_name || 'Untitled Photo',
		caption: photoData.composition || '',
		keywords: [],
		created_at: photoData.photo_date || photoData.enriched_at || photoData.upload_date,
		metadata: {
			// BUCKET 1: Concrete & Filterable
			play_type: (photoData.play_type || null) as Photo['metadata']['play_type'],
			action_intensity: (photoData.action_intensity || 'medium') as Photo['metadata']['action_intensity'],
			sport_type: photoData.sport_type || 'volleyball',
			photo_category: photoData.photo_category || 'action',
			composition: (photoData.composition || '') as Photo['metadata']['composition'],
			time_of_day: (photoData.time_of_day || '') as Photo['metadata']['time_of_day'],
			lighting: (photoData.lighting || undefined) as Photo['metadata']['lighting'],
			color_temperature: (photoData.color_temperature || undefined) as Photo['metadata']['color_temperature'],

			// BUCKET 2: Abstract & Internal
			emotion: (photoData.emotion || 'focus') as Photo['metadata']['emotion'],
			sharpness: photoData.sharpness || 0,
			composition_score: photoData.composition_score || 0,
			exposure_accuracy: photoData.exposure_accuracy || 0,
			emotional_impact: photoData.emotional_impact || 0,
			time_in_game: (photoData.time_in_game || undefined) as Photo['metadata']['time_in_game'],
			athlete_id: photoData.athlete_id || undefined,
			event_id: photoData.event_id || undefined,

			// AI metadata
			ai_provider: (photoData.ai_provider || 'gemini') as Photo['metadata']['ai_provider'],
			ai_cost: photoData.ai_cost || 0,
			ai_confidence: photoData.ai_confidence || 0,
			enriched_at: photoData.enriched_at || new Date().toISOString()
		},
		// SmugMug metadata for enhanced Schema.org markup
		smugmug: {
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
		fetchRelatedPhotos(photo, photoData.album_key),
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
 * Includes sport, category, lighting/aesthetic details
 */
function generatePhotoDescription(photo: Photo): string {
	const sport = photo.metadata.sport_type || 'sports';
	const category = photo.metadata.photo_category || 'photo';
	const lighting = photo.metadata.lighting;
	const timeOfDay = photo.metadata.time_of_day;

	// Base description (all photos are worthy)
	let description = `Professional ${sport} ${category} photo`;

	// Add aesthetic details (Bucket 1)
	if (lighting) {
		description += ` with ${lighting} lighting`;
	}

	if (timeOfDay) {
		description += ` captured during ${timeOfDay}`;
	}

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
		.from('photo_metadata')
		.select('*')
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
	return (data || []).map((row: PhotoMetadataRow) => transformPhotoRow(row));
}

/**
 * Fetch similar photos using vector embeddings
 * (Initiative 3.2: Similarity-Powered Exploration)
 */
async function fetchSimilarPhotos(currentPhoto: PhotoMetadataRow): Promise<Photo[]> {
	// Check if current photo has an embedding
	if (!currentPhoto.embedding) {
		console.log('[Photo Detail] No embedding available for similarity search');
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
		.from('photo_metadata')
		.select('*')
		.in('image_key', imageKeys)
		.not('sharpness', 'is', null); // Only enriched photos

	if (photosError || !photos) {
		console.error('[Photo Detail] Error fetching similar photo details:', photosError);
		return [];
	}

	// Transform to Photo type using shared transform (includes CF Images support)
	return photos.map((row: PhotoMetadataRow) => transformPhotoRow(row));
}
