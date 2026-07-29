/**
 * AI-Friendly Search API — /api/ai/search?q=
 *
 * ai.txt advertises this to answer engines as semantic photo search. It was not. It matched the
 * query as a SUBSTRING against ~20 hardcoded words, and the gaps were published as confident
 * answers:
 *
 *   ?q=football     → 772 SOCCER photos, stated as `match_reasons: ["sport: soccer"]`, because
 *                     the map contained `football: 'soccer'`. The 558 real football photos were
 *                     unreachable through this endpoint.
 *   ?q=tennis       → all 20,655 photos, "general match". Same for golf, pickleball, bowling,
 *                     cross country and warmup — six of the twelve sports were simply absent
 *                     from the map, so the query was dropped and the whole gallery returned as
 *                     if it had matched.
 *
 * It now calls searchPhotos(), the same search /explore uses: the NLP parser (which reads one
 * keyword table, so a new sport cannot go missing here and be present there), then team/album
 * name lookup, then the LLM planner, then pgvector. Verified against production: football → 558,
 * tennis → 409, golf → 271, pickleball → 52, bowling → 100, all resolved structurally with no
 * planner call.
 *
 * `relevance_score` and `match_reasons` are gone. The score was invented (0.5 + 0.2 per matched
 * facet + 0.1 for quality) and handed to answer engines as if it meant something. The honest
 * signals are which search path answered and how the query was read; both are reported.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchPhotos } from '$lib/supabase/server';
import { photoAddresses } from '$lib/supabase/photo-address';
import { photoIdentityPeers, type PhotoIdentityRow } from '$lib/supabase/photo-address-server';
import { cfImageUrl } from '$lib/utils/cloudflare-images';
import { SITE_URL } from '$lib/site-url';
import { parsePagination } from '$lib/api/pagination';
import { photoPageTitle } from '$lib/seo/photo-title';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const query = url.searchParams.get('q');
		const page = parsePagination(url.searchParams, { defaultLimit: 20, maxLimit: 50 });
		if (!page.ok) return json({ error: page.error }, { status: 400 });
		const { limit, offset } = page.value;
		const format = url.searchParams.get('format') || 'json';

		if (!query) {
			return json({ error: 'Missing required parameter: q' }, { status: 400 });
		}

		// `offset` was parsed and then dropped, so this endpoint reported `total_results`
		// in the thousands while serving only ever the first page — an agent could see
		// results 1-20 of 15,330 and had no way to ask for the rest. searchPhotos has
		// supported offset all along.
		const { photos, totalCount, searchMode, parsedDescription } = await searchPhotos(
			query,
			{},
			{ limit, offset }
		);

		// image_key is NOT unique — 113 are shared — so a /photo/<image_key> URL can resolve to a
		// different photo. Same fix as the sitemap and the photo page (#98).
		const identities: PhotoIdentityRow[] = photos.map((photo) => ({
			photo_id: photo.id,
			image_key: photo.image_key,
			cf_image_id: photo.cf_image_id ?? null,
			album_key: photo.album_key ?? null,
			album_name: null
		}));
		const peers = await photoIdentityPeers(identities);
		const addresses = photoAddresses(peers);
		const albumNames = new Map(peers.map((row) => [row.photo_id, row.album_name]));

		const results = photos.map((photo) => {
			const segment = addresses.get(photo.id) ?? photo.image_key;
			return {
				id: segment,
				url: `${SITE_URL}/photo/${segment}`,
				// `<album> — <caption fragment>`, the same composition the photo page's <title> and
				// /api/ai/photos both use. This was the bare album name, so a search for a sport
				// returned page after page of results sharing one title — 50 results carried 38
				// distinct titles, and "ACC at St. Francis - Oct 19" appeared three times in a row.
				// That is the #120 defect on the surface an answer engine actually reads for a query,
				// and the caption it needs was already in `description` on the line below.
				title: photoPageTitle(albumNames.get(photo.id) ?? null, photo.caption ?? null),
				description: photo.caption || undefined,
				image_url: photo.cf_image_id ? cfImageUrl(photo.cf_image_id, 'large') : '',
				thumbnail_url: photo.cf_image_id ? cfImageUrl(photo.cf_image_id, 'thumbnail') : '',
				sport_type: photo.metadata?.sport_type ?? null,
				photo_category: photo.metadata?.photo_category ?? null,
				play_type: photo.metadata?.play_type ?? null
			};
		});

		if (format === 'jsonld') {
			return json({
				'@context': 'https://schema.org',
				'@type': 'SearchResultsPage',
				query,
				totalResults: totalCount,
				numberOfItems: results.length,
				itemListElement: results.map((result, index) => ({
					'@type': 'ListItem',
					position: index + 1,
					item: {
						'@type': 'Photograph',
						'@id': result.url,
						name: result.title,
						description: result.description,
						image: result.image_url
					}
				}))
			});
		}

		return json({
			query,
			// 'structured' = the query resolved to a sport/category/play/team/jersey filter.
			// 'semantic'   = it fell through to embedding similarity.
			search_mode: searchMode,
			interpreted_as: parsedDescription,
			total_results: totalCount,
			limit,
			offset,
			results
		});
	} catch (error) {
		console.error('[API] Error searching photos:', error);
		return json({ error: 'Failed to search photos' }, { status: 500 });
	}
};
