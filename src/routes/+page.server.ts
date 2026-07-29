/**
 * Homepage Server Load Function
 *
 * Recognition-first homepage: the only server-fetched data is the "Recent events" row.
 * The hero and "Selected work" are curated static flickday assets (see +page.svelte);
 * the former hero-candidate / featured-album / program-facet / stats / engagement-showcase
 * queries were removed with the IA simplification.
 */

import type { PageServerLoad } from './$types';
import { supabaseServer, matviewClient } from '$lib/supabase/server';
import { cfImageUrl } from '$lib/utils/cloudflare-images';
import { trackArrival, keepTrackingAlive } from '$lib/analytics/tracker';
import { isValidSrcParam } from '$lib/analytics/share';
import { computeSessionHash } from '$lib/analytics/session';


/**
 * Head tags come from here, never from `+page.svelte`. The root layout is the single emitter
 * of <title>, description, canonical and og/twitter (its own comment has said so for the og
 * tags); a page that also emits them ships duplicates, and the layout's generic pair renders
 * FIRST, so the specific one is the copy crawlers ignore. Enforced by scripts/check-head-tags.mjs.
 */
const HOME_SEO = {
  title: 'Nino Chavez — Volleyball Event Photography',
  description:
    'Find your photos from volleyball events — club, high school, and college tournaments and matches. Browse and search galleries by event, team, or jersey number.'
};

const CACHE_DURATION_MS = 5 * 60 * 1000;
let cache: { recentAlbums: Awaited<ReturnType<typeof fetchRecentAlbums>>; timestamp: number } | null =
  null;

export const load: PageServerLoad = async ({ setHeaders, url, request, getClientAddress, platform }) => {
  setHeaders({ 'cache-control': 's-maxage=300, stale-while-revalidate=600' });

  // Arrival attribution → popularity engine. Only fires when the incoming link carried
  // a valid ?src= channel; normal navigation inserts nothing. Non-blocking, mirrors the
  // photo page's fire-and-forget view tracking — never awaited, never allowed to affect
  // the response. NOTE: this route is edge-cached (s-maxage=300) — see CLAUDE.md/PR notes,
  // a ?src= arrival that lands on a cached response never re-runs this load function, so
  // repeat visitors hitting the same evergreen link (bio link, QR code) within the cache
  // window will undercount. Not fixed here (out of scope — don't change caching behavior).
  const src = url.searchParams.get('src');
  if (isValidSrcParam(src)) {
    const userAgent = request.headers.get('user-agent') ?? '';
    keepTrackingAlive(
      platform,
      computeSessionHash(getClientAddress(), userAgent).then(
        (sessionHash) => trackArrival({ src, sessionHash, userAgent })
      )
    );
  }

  try {
    const now = Date.now();
    if (!cache || now - cache.timestamp > CACHE_DURATION_MS) {
      cache = { recentAlbums: await fetchRecentAlbums(), timestamp: now };
    }
    return { recentAlbums: cache.recentAlbums, seo: HOME_SEO };
  } catch (err) {
    console.error('[Homepage] Critical error in load function:', err);
    return { recentAlbums: [], seo: HOME_SEO };
  }
};

/**
 * Recent events for the homepage — real galleries, newest first.
 *
 * albums_summary is a MATERIALIZED VIEW (anon REVOKE'd, and the grant is flaky) → read via
 * service_role (matviewClient). album_settings (unlisted) is read on the anon client; the
 * `.not('album_key','in', …)` below is the privacy gate that keeps unlisted albums out (their
 * detail route 404s, so featuring one would be a dead card).
 */
async function fetchRecentAlbums(limit = 8) {
  try {
    const { data: unlisted } = await supabaseServer
      .from('album_settings')
      .select('album_key')
      .eq('visibility', 'unlisted');
    const unlistedKeys = (unlisted ?? []).map((a) => a.album_key);

    let query = matviewClient()
      .from('albums_summary')
      .select(
        'album_key, album_name, photo_count, cover_cf_image_id, cover_image_url, primary_sport, primary_category, latest_photo_date'
      )
      .not('album_key', 'is', null)
      .not('latest_photo_date', 'is', null)
      .order('latest_photo_date', { ascending: false })
      .limit(limit);
    if (unlistedKeys.length) {
      query = query.not('album_key', 'in', `(${unlistedKeys.map((k) => `"${k}"`).join(',')})`);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((album) => ({
      albumKey: album.album_key as string,
      albumName: (album.album_name as string) || 'Untitled Event',
      photoCount: parseInt(album.photo_count as string) || 0,
      coverImageUrl: album.cover_cf_image_id
        ? cfImageUrl(album.cover_cf_image_id as string, 'medium')
        : (album.cover_image_url as string | null),
      primarySport: (album.primary_sport as string) || 'volleyball',
      primaryCategory: (album.primary_category as string) || 'action',
      latestPhotoDate: album.latest_photo_date as string | null
    }));
  } catch (err) {
    console.error('[Homepage] Error fetching recent albums:', err);
    return [];
  }
}
