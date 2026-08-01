/**
 * Sitemap.xml Generator
 *
 * EVERY URL IN HERE MUST RESOLVE, AND EVERY PUBLIC PAGE MUST BE IN HERE.
 *
 * Both halves were broken. It emitted one landing page per distinct sport —
 * `/volleyball`, `/basketball`, twelve of them — under a comment reading
 * "(future routes)". They were never built. There is no `[sport]` route in this
 * app, so all twelve had been handing Google a 404 for as long as the sitemap
 * has existed. A planned route is not a URL; it goes in the sitemap the day it
 * serves a 200.
 *
 * In the other direction it omitted pages this app links in its own chrome:
 * `/timeline` (header nav AND footer), `/privacy` (footer), and all 46
 * `/photos/<year>/<month>` archives, which TimelineV2 links directly and which
 * render real galleries with real titles ("August 2022 • 753 Photos").
 *
 * The same omission survived that pass one level down: `/collections` was listed
 * but not the four galleries it links, so every curated collection was reachable
 * only by crawling the hub. A hub page in the sitemap is not coverage of what it
 * links.
 *
 * And it survived once more, one TABLE over. Albums were derived from the photo
 * scan, so an album holding only videos could not appear: `/albums` linked 251
 * albums, this listed 249, and the two missing were the video-only ones
 * (p4J2jk, QwhCK5 — 108 public clips). Measured by diffing every internal link
 * on the hub pages against the emitted <loc> set; those two were the only real
 * gaps in 280 linked paths.
 *
 * The month archives are derived from the same single scan that already
 * produces albums and photos — no extra query. That is the pattern to follow
 * for anything added here: derive it from the scan, or prove the route serves
 * a 200 first.
 */

import { supabaseServer, matviewClient, getUnlistedAlbumKeys } from '$lib/supabase/server';
import { PHOTOS_READ } from '$lib/supabase/columns';
import { createAlbumSlug } from '$lib/utils';
import { COLLECTIONS, COLLECTION_CRITERIA_SELECT, collectionMatches } from '$lib/collections';
import { videoOnlyRows } from '$lib/albums/listing';
import { photoAddresses } from '$lib/supabase/photo-address';
import type { RequestHandler } from './$types';
import { SITE_URL } from '$lib/site-url';

interface SitemapUrl {
	loc: string;
	priority: number;
	changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly';
	lastmod?: string;
}

export const GET: RequestHandler = async () => {
	const baseUrl = SITE_URL;
	// Only the month currently being shot can still gain photos.
	const currentMonth = new Date().toISOString().slice(0, 7);

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
			// Curation criteria, read only by collectionMatches below. Carried on the
			// existing scan rather than costing four more `count: 'exact'` queries.
			quality_score: number | null;
			photo_category: string | null;
			play_type: string | null;
		};
		const PAGE = 1000;
		const photos: SitemapRow[] = [];
		for (let offset = 0; ; offset += PAGE) {
			const { data, error: photosError } = await supabaseServer
				.from(PHOTOS_READ)
				.select(
					`photo_id, image_key, cf_image_id, photo_date, enriched_at, sport_type, album_key, album_name, ${COLLECTION_CRITERIA_SELECT}`
				)
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
		const photoAlbumKeys = new Set(uniqueAlbums.map((a) => a.album_key as string));

		// Albums that hold only videos. They have no row in the scan above, so deriving albums
		// from photos alone can never reach them — the same shape as the collections omission,
		// one table over. videos_summary is a matview (anon REVOKE'd → service_role, RLS does not
		// apply), so videoOnlyRows gets the unlisted keys explicitly; see its own comment for why
		// that is not redundant with `photoAlbumKeys`.
		const [{ data: videoAlbumRows, error: videoAlbumsError }, unlistedKeys] = await Promise.all([
			matviewClient().from('videos_summary').select('album_key, album_name'),
			getUnlistedAlbumKeys()
		]);
		if (videoAlbumsError) {
			console.error('Error fetching video albums for sitemap:', videoAlbumsError);
			return new Response('Error generating sitemap', { status: 500 });
		}
		const videoOnlyAlbums = videoOnlyRows(
			(videoAlbumRows ?? []) as { album_key: string; album_name: string | null }[],
			photoAlbumKeys,
			new Set(unlistedKeys)
		);

		// Curated collections that actually hold photos. `/collections` renders only
		// those with a non-zero count, so listing an empty one would advertise a page
		// its own index refuses to link. Membership is decided from the scan above via
		// the shared criteria in $lib/collections — no extra query, and no second copy
		// of the rules to drift.
		const activeCollections = COLLECTIONS.filter((collection) =>
			photos.some((photo) => collectionMatches(photo, collection.slug))
		);

		// Month archives — /photos/<year>/<month>, one per month that has photos.
		// Derived from the same scan rather than a second query. Zero-padded to
		// match the links TimelineV2 builds and the route's own examples.
		const monthArchives = Array.from(
			new Set(
				photos
					.map((p) => (p.photo_date || '').slice(0, 7))
					.filter((ym) => /^\d{4}-\d{2}$/.test(ym))
			)
		).sort();

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
				// Publishes FAQPage structured data, which is inert on a page nothing links to.
				loc: `${baseUrl}/faq`,
				priority: 0.6,
				changefreq: 'monthly' as const
			},
			{
				// In the header nav and the footer, and absent from here until now.
				loc: `${baseUrl}/timeline`,
				priority: 0.7,
				changefreq: 'weekly' as const
			},

			// Month archives, linked from the timeline. Only the current month can
			// still gain photos; the rest are closed and change only if a back
			// catalogue is re-ingested.
			...monthArchives.map((ym): SitemapUrl => {
				const [year, month] = ym.split('-');
				return {
					loc: `${baseUrl}/photos/${year}/${month}`,
					priority: 0.5,
					changefreq: ym === currentMonth ? 'weekly' : 'yearly'
				};
			}),

			// Curated collection detail pages. `/collections` was listed here from the
			// start; the four galleries it links were not, so the collections themselves
			// were reachable only by crawling one hub page.
			...activeCollections.map((collection): SitemapUrl => ({
				loc: `${baseUrl}/collections/${collection.slug}`,
				priority: 0.7,
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

			// Video-only album pages. Same URL shape and the same slug helper as above — the
			// route is one route, it just had no photos to be derived from.
			...videoOnlyAlbums.map((album): SitemapUrl => ({
				loc: `${baseUrl}/albums/${createAlbumSlug(album.album_name || album.album_key, album.album_key)}`,
				priority: 0.6,
				changefreq: 'monthly' as const
			})),

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
