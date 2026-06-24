/**
 * Root Layout Server Load
 *
 * Provides the sport/category distributions and base (no-filter) filter counts that the
 * site chrome (filter bar, stats) needs on every route.
 *
 * Source of truth is the facet_base_counts matview (refreshed on ingest + 30-min pg_cron),
 * read in ONE round-trip via getBaseFacets(). This replaced getSportDistribution() +
 * getCategoryDistribution() + getFilterCounts() — three functions that fanned out to 80+
 * paged-distinct + per-value head-count requests on EVERY page load. The previous in-memory
 * cache didn't save it on Cloudflare Pages (module globals are per-isolate; isolates churn),
 * so cold isolates re-ran the whole fan-out — the dominant query volume in pg_stat_statements.
 *
 * A short in-memory cache still avoids re-reading the matview within a hot isolate. If the
 * matview read fails, we fall back to live computation so the chrome never goes empty.
 */

import {
  getBaseFacets,
  getSportDistribution,
  getCategoryDistribution,
  getFilterCounts,
  type BaseFacets,
} from '$lib/supabase/server';
import type { LayoutServerLoad } from './$types';

// Trailing slash behavior: never use trailing slashes (prevents redirect loops with proxy)
export const trailingSlash = 'never';

// Cache duration: 30 minutes (matches the matview's refresh cadence)
const CACHE_DURATION_MS = 30 * 60 * 1000;

let facetsCache: { data: BaseFacets; timestamp: number } | null = null;

// Fallback: reproduce the matview payload via the live functions if the matview read fails.
async function liveBaseFacets(): Promise<BaseFacets> {
  const [sports, categories, filterCounts] = await Promise.all([
    getSportDistribution(),
    getCategoryDistribution(),
    getFilterCounts(),
  ]);
  return { sports, categories, filterCounts };
}

export const load: LayoutServerLoad = async () => {
  const now = Date.now();

  if (!facetsCache || now - facetsCache.timestamp > CACHE_DURATION_MS) {
    try {
      const data = (await getBaseFacets()) ?? (await liveBaseFacets());
      facetsCache = { data, timestamp: now };
    } catch (error) {
      console.error('[Layout] Failed to load base facets:', error);
      if (!facetsCache) {
        facetsCache = {
          data: { sports: [], categories: [], filterCounts: { sports: [], categories: [], playTypes: [] } },
          timestamp: now,
        };
      }
    }
  }

  return {
    sports: facetsCache.data.sports,
    categories: facetsCache.data.categories,
    baseFilterCounts: facetsCache.data.filterCounts,
  };
};
