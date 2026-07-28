/**
 * Photo Detail Page - Server-Side Data Loading
 *
 * Loads individual photo data from Supabase and generates SEO meta tags
 * for social sharing (Open Graph, Twitter Cards, Schema.org)
 */

import { error } from '@sveltejs/kit';
import { PHOTOS_READ, PHOTO_DETAIL_COLUMNS } from '$lib/supabase/columns';
import { supabaseServer, transformPhotoRow, PHOTO_COLUMNS } from '$lib/supabase/server';
import { NON_KEYS, resolvePhotoByImageKey } from '$lib/supabase/resolve-photo-by-key';
import type { PageServerLoad } from './$types';
import type { Photo } from '$types/photo';
import type { PhotoMetadataRow } from '$types/database';
import { cfImageUrl } from '$lib/utils/cloudflare-images';
import { SITE_URL } from '$lib/site-url';
import { base } from '$app/paths';

export const load: PageServerLoad = async ({ params, url }) => {
	// Stringified nulls are not image keys — they are a caller that interpolated a missing value
	// into a URL template. The share-URL builders that produced them are fixed (see
	// $lib/utils/share-url's photoShareUrl), but Facebook's scraper has /photo/null cached and
	// re-requests it: 334 hits over 7 days, half of which timed out at the edge (167x 404,
	// 167x 504) because each one still paid for a Supabase round trip first. Reject before
	// touching the database.
	if (!params.id || NON_KEYS.has(params.id)) {
		throw error(404, `Photo not found: ${params.id}`);
	}

	// image_key is NOT unique; see resolvePhotoByImageKey for the collision rule, which the tag
	// route beside this one now shares. `canonicalSegment` is the identifier that addresses THIS
	// photo and no other — the raw params.id does not, when two albums share a DSC number.
	const resolved = await resolvePhotoByImageKey<PhotoMetadataRow>(
		params.id,
		PHOTO_DETAIL_COLUMNS,
		url.searchParams.get('a')
	);

	if (!resolved) {
		throw error(404, `Photo not found: ${params.id}`);
	}

	const { row: photoData, canonicalSegment } = resolved;

	// Transform flat Supabase data to nested Photo type (two-bucket model)
	// NOTE: the 6 vanity CATEGORICAL aesthetic fields (composition, time_of_day, lighting,
	// color_temperature, emotion, action_intensity) were removed (cutover prep) ahead of their
	// schema DROP. The numeric quality sub-scores below STAY.
	// `id` is the photo_id, matching transformPhotoRow. It used to be the image_key
	// here alone, which meant every engagement event this page reported (DownloadButton
	// passes photo.id) wrote an image_key into engagement_events.photo_id while the rest
	// of the app wrote a real photo_id — two identifier spaces in one column, and the
	// photo_popularity join silently dropped the odd ones out.
	const cfId = photoData.cf_image_id || '';
	const photo: Photo = {
		id: photoData.photo_id,
		image_key: photoData.image_key,
		album_key: photoData.album_key || undefined,
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

	// A generated 1200×630 card, not the raw photo. This used to be the `thumbnail`
	// variant — 150×224, under Facebook's documented 200×200 minimum — so sharing a
	// photo produced no image or a postage stamp. Origin-relative like the album card,
	// so it unfurls on whichever host served the page, and keyed by canonicalSegment so
	// the two photos behind a shared image_key get their own cards.
	const ogImage = `${SITE_URL}/photo/${canonicalSegment}/og.png`;

	// Build canonical URL
	const baseUrl = SITE_URL;
	// Built from canonicalSegment, not params.id. Two photos can share an image_key, and if both
	// their pages declared `/photo/DSC05553` as canonical, search engines would fold them back
	// into one entry and the second photo would stay unindexed — which is the state this fixed.
	const canonicalUrl = `${baseUrl}/photo/${canonicalSegment}`;

	// Run the secondary queries concurrently rather than in sequence — it is the difference
	// between one round trip and two, which matters most for visitors far from the database.
	const [relatedPhotos, tagsResult] = await Promise.all([
		fetchRelatedPhotos(photo, photoData.photo_id, photoData.album_key || ''),
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

	// The view is NOT recorded here. This load function runs on prefetch: the app sets
	// data-sveltekit-preload-data="hover" globally, so sweeping a cursor across an album
	// grid fetches every photo's __data.json and used to bank a view for each one — a
	// photo nobody opened. Verified against production: a single GET of
	// /photo/<key>/__data.json added exactly one engagement_events row.
	//
	// The page component reports the view instead (see +page.svelte), through the same
	// /api/engagement path the lightbox and detail modal already use. That fires only
	// when the page actually renders, which also means a crawler that doesn't execute
	// JavaScript stops being counted at the source rather than filtered out later.
	return {
		photo,
		relatedPhotos,
		approvedTags: tags || [],
		viewSource,
		seo: {
			title: `${photo.title} | Nino Chavez Photography`,
			description: seoDescription,
			ogImage,
			ogImageAlt: photo.title,
			// The layout only emits dimension tags when supplied, and they are what tells
			// LinkedIn and Facebook to lay out the large card before the image finishes
			// downloading. Truthful here because we render the card ourselves.
			ogImageWidth: 1200,
			ogImageHeight: 630,
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
const RELATED_LIMIT = 12;

/**
 * Photos to show under "More from this Album & Sport".
 *
 * WHAT WAS WRONG
 *
 * This was one query with `.or(album_key.eq.X, and(sport.eq.Y, category.eq.Z), sport.eq.Y)`
 * ordered globally by upload_date. Two problems compounded:
 *
 *   1. the third branch subsumes the second — `sport = Y` already contains
 *      `sport = Y AND category = Z` — so the tiering expressed nothing; and
 *   2. `sport_type = 'volleyball'` matches 15,330 of 21,743 photos, so after a global
 *      ORDER BY upload_date DESC LIMIT 12 the album branch was drowned entirely.
 *
 * The result was that every volleyball photo — 70% of the gallery — showed the SAME twelve
 * photos: the newest twelve overall. Verified 2026-07-28: two photos from different albums
 * returned byte-identical rails, neither containing anything from its own album, under a
 * heading promising "More from this Album".
 *
 * WHAT IT DOES NOW
 *
 * The tiers the original comment described, actually applied in order. Same album first,
 * because that is the context the visitor is already in; then same sport and category; then
 * same sport. 260 of 262 albums hold twelve or more photos, so tier one fills the rail on its
 * own and this stays a single query — the same round-trip cost as the broken version.
 */
async function fetchRelatedPhotos(
	currentPhoto: Photo,
	currentPhotoId: string,
	albumKey: string
): Promise<Photo[]> {
	const sportType = currentPhoto.metadata.sport_type;
	const photoCategory = currentPhoto.metadata.photo_category;

	const collected = new Map<string, Photo>();

	// Exclude by photo_id, not image_key. image_key is not unique, so excluding by it also drops
	// every unrelated photo that happens to share a DSC number with this one.
	const tier = async (apply: (q: ReturnType<typeof baseQuery>) => ReturnType<typeof baseQuery>) => {
		if (collected.size >= RELATED_LIMIT) return;

		const { data, error } = await apply(baseQuery())
			.order('upload_date', { ascending: false })
			.limit(RELATED_LIMIT);

		if (error) {
			console.error('[Photo Detail] Error fetching related photos:', error);
			return;
		}

		for (const row of data ?? []) {
			const photo = transformPhotoRow(row);
			if (photo.id === currentPhotoId || collected.has(photo.id)) continue;
			if (collected.size < RELATED_LIMIT) collected.set(photo.id, photo);
		}
	};

	function baseQuery() {
		return supabaseServer
			.from(PHOTOS_READ)
			.select(PHOTO_COLUMNS)
			.neq('photo_id', currentPhotoId)
			.not('sharpness', 'is', null); // Only enriched photos
	}

	if (albumKey) await tier((q) => q.eq('album_key', albumKey));
	if (sportType && photoCategory) {
		await tier((q) => q.eq('sport_type', sportType).eq('photo_category', photoCategory));
	}
	if (sportType) await tier((q) => q.eq('sport_type', sportType));

	return [...collected.values()];
}

