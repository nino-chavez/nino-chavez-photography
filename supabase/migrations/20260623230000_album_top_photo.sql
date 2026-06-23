-- Migration: Phase 3a — album auto-covers (data layer)
--
-- album_top_photo: the single highest-trending photo per album, for data-driven
-- covers (operator decision: override to top-engaged everywhere, refreshed as
-- engagement shifts). Joined at read time where covers render; falls back to the
-- existing albums_summary cover when an album has no engagement yet.
--
-- Refreshed alongside the other popularity matviews by the existing pg_cron job
-- (every 10 min). Anon-SELECTable (covers are public).

BEGIN;

CREATE MATERIALIZED VIEW public.album_top_photo AS
SELECT DISTINCT ON (pm.album_key)
       pm.album_key,
       pm.photo_id,
       pm.cf_image_id,
       pp.trending_score
FROM public.photo_popularity pp
JOIN public.photo_metadata pm ON pm.photo_id = pp.photo_id
WHERE pm.album_key IS NOT NULL
  AND pm.cf_image_id IS NOT NULL
  AND pm.sharpness IS NOT NULL
ORDER BY pm.album_key, pp.trending_score DESC NULLS LAST, pm.photo_id
WITH NO DATA;

CREATE UNIQUE INDEX album_top_photo_pkey ON public.album_top_photo (album_key);
GRANT SELECT ON public.album_top_photo TO anon, authenticated;

-- Fold the new matview into the scheduled refresh. Order matters: photo_popularity
-- must refresh before album_top_photo (which reads it).
CREATE OR REPLACE FUNCTION public.refresh_popularity()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.photo_popularity;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.album_popularity;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.album_top_photo;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.refresh_popularity() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.refresh_popularity() TO service_role;

-- Initial (non-concurrent) populate; photo_popularity is already populated.
REFRESH MATERIALIZED VIEW public.album_top_photo;

COMMIT;
