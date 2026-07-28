/**
 * Sitemap.xml Generator
 *
 * Generates XML sitemap with all routes for SEO:
 * - Static pages (home, explore, collections, albums)
 * - Sport-specific landing pages
 * - Individual photo URLs (20K+)
 * - Album detail pages
 *
 * Submit to Google Search Console after deployment
 */

import { supabaseServer } from '$lib/supabase/server';
import { PHOTOS_READ } from '$lib/supabase/columns';
import { createAlbumSlug } from '$lib/utils';
import { photoAddresses } from '$lib/supabase/photo-address';
import type { RequestHandler } from './$types';
import { SITE_URL } from '$lib/site-url';

interface SitemapUrl {
	loc: string;
	priority: number;
	changefreq: 'daily' | 'weekly' | 'monthly';
	lastmod?: string;
}

export const GET: RequestHandler = async () => {
	const baseUrl = SITE_URL;

	try {
		// Page through the full table — a plain .select() silently caps at Supabase's 1000-row default,
		// which truncated the sitemap to ~5% of ~20K photos. One scan yields photos + albums + sports.
		// Excludes unprocessed photos (sharpness null) per project rule; unlisted albums are excluded
		// at the DB layer (photo_metadata RLS) since this reads via the anon supabaseServer.
		type SitemapRow = {
			photo_id: string;
			image_key: string;
			cf_image_id: string | null;
			photo_date: string | null;
			enriched_at: string | null;
			sport_type: string | null;
			album_key: string | null;
			album_name: string | null;
		};
		const PAGE = 1000;
		const photos: SitemapRow[] = [];
		for (let offset = 0; ; offset += PAGE) {
			const { data, error: photosError } = await supabaseServer
				.from(PHOTOS_READ)
				.select('photo_id, image_key, cf_image_id, photo_date, enriched_at, sport_type, album_key, album_name')
				.not('sharpness', 'is', null)
				.order('photo_id', { ascending: true })
				.range(offset, offset + PAGE - 1);

			if (photosError) {
				console.error('Error fetching photos for sitemap:', photosError);
				return new Response('Error generating sitemap', { status: 500 });
			}
			if (!data || data.length === 0) break;
			photos.push(...(data as SitemapRow[]));
			if (data.length < PAGE) break;
		}

		const addresses = photoAddresses(photos);

		// Unique albums (dedupe in code — Supabase has no DISTINCT on select)
		const uniqueAlbums = Array.from(
			new Map(
				photos.filter((p) => p.album_key).map((p) => [p.album_key, p])
			).values()
		);

		// Unique sports for landing pages
		const uniqueSports = Array.from(new Set(photos.map((p) => p.sport_type).filter(Boolean)));

		// Build URL list
		const urls: SitemapUrl[] = [
			// Static pages
			{
				loc: baseUrl,
				priority: 1.0,
				changefreq: 'daily' as const
			},
			{
				loc: `${baseUrl}/explore`,
				priority: 0.9,
				changefreq: 'daily' as const
			},
			{
				loc: `${baseUrl}/collections`,
				priority: 0.8,
				changefreq: 'weekly' as const
			},
			{
				loc: `${baseUrl}/albums`,
				priority: 0.8,
				changefreq: 'weekly' as const
			},
			{
				loc: `${baseUrl}/about`,
				priority: 0.7,
				changefreq: 'monthly' as const
			},

			// Sport-specific landing pages (future routes)
			...uniqueSports.map((sport) => ({
				loc: `${baseUrl}/${sport}`,
				priority: sport === 'volleyball' ? 0.9 : 0.7,
				changefreq: 'weekly' as const
			})),

			// Album detail pages (using SEO-friendly slugs). album_key is non-null here (filtered above).
			...uniqueAlbums.map((album) => {
				const albumKey = album.album_key as string;
				return {
					loc: `${baseUrl}/albums/${createAlbumSlug(album.album_name || albumKey, albumKey)}`,
					priority: 0.6,
					changefreq: 'monthly' as const
				};
			}),

			// Individual photo URLs (THE MONEY MAKER - 20K+ URLs!)
			//
			// Addressed via photoAddresses, NOT image_key. image_key is the camera frame name and
			// DSC numbers reset per card, so 113 keys name two photos each. Emitting image_key
			// blindly listed those 113 URLs twice — telling search engines the same page existed
			// twice while the second photo had no URL at all and could never be indexed. The
			// helper hands the contested ones their unique cf_image_id and leaves the other
			// 20,542 on the image_key URLs that are already indexed.
			...photos.map((photo) => ({
				loc: `${baseUrl}/photo/${addresses.get(photo.photo_id) ?? photo.image_key}`,
				// Date only. <lastmod> must be W3C Datetime, which requires a timezone designator
				// on any form carrying a time — `2026-01-29T18:48:49.846521` has none and is
				// invalid, which described every row here. YYYY-MM-DD is a complete W3C form,
				// needs no timezone, and is the granularity Google's own example uses.
				lastmod: (photo.photo_date || photo.enriched_at || '').slice(0, 10) || undefined,
				priority: 0.7, // All photos are portfolio-worthy in Schema v2
				changefreq: 'monthly' as const
			}))
		];

		// Generate XML
		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
	.map(
		(url) => `  <url>
    <loc>${escapeXml(url.loc)}</loc>
    ${url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : ''}
    <priority>${url.priority}</priority>
    <changefreq>${url.changefreq}</changefreq>
  </url>`
	)
	.join('\n')}
</urlset>`;

		return new Response(xml, {
			headers: {
				'Content-Type': 'application/xml',
				'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
			}
		});
	} catch (error) {
		console.error('Sitemap generation error:', error);
		return new Response('Error generating sitemap', { status: 500 });
	}
};

/**
 * Escape special XML characters
 */
function escapeXml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}
