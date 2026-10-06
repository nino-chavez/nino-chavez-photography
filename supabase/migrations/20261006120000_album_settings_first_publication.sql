-- Album age counts from an album's FIRST publication. album_settings.published_at stays the
-- LATEST one.
--
-- Decision (Nino, 2026-10-06, docs/audits/20261006-analytics-site-rethink/README.md, "Decisions"
-- item 1): a republished album keeps its original launch date for every analytics comparison,
-- while the latest-gallery ranking (src/lib/albums/latest.ts, /latest, /api/latest,
-- /api/galleries/recent) still sorts on the latest publication, so a republished album can
-- return to the top of that list. Those are two facts, so they get two fields:
--
--   published_at        latest unlisted -> public write   (latest-gallery ranking, admin list)
--   first_published_at  earliest publication on record    (every analytics age comparison)
--
-- first_published_at carries the same provenance discipline as published_at: a basis and, where
-- the basis needs one, the evidence, with mirrored CHECKs. The basis has one more value than
-- published_at's:
--
--   recorded    stamped by the trigger at the unlisted -> public write (first_published_at set)
--   inferred    recovered afterwards from a log of that write (first_published_at set, evidence)
--   unobserved  the album was public before anything recorded it. first_published_at stays NULL,
--               the evidence says why, and analytics treats it as "no launch date": the album is
--               neither new nor in the publication-age comparison, and a later republish never
--               gives it a false one. NULL basis means "no publication seen yet".
--
-- The only CHECK that relates the two times is order: when both are set the first is never later
-- than the latest. published_at may be set while first_published_at is NULL (an unobserved album
-- that was unpublished and republished).
--
-- BACKFILL. Production held 7 non-null published_at rows when this was written (read-only query,
-- 2026-10-06): jq1Rp7, 1BlKk4, dKe567, eqYF0h, fJKdsB, Re7kho, DWdCET, all basis 'inferred', none
-- 'recorded'. Each is copied into first_published_at. None of the seven is known to have been
-- published twice: docs/audits/20261005-publication-time-provenance/recovered-publish-times.json
-- holds exactly one logged unlisted -> public write per album, and a second search on 2026-10-06
-- of the command arguments in the same Claude and Codex session logs found no `--unpublish`
-- command for any of the seven keys. That is absence of evidence from a narrow source: only the
-- personal Mac's agent logs were searched, and an unpublish and republish made from the admin
-- album toggle or from another machine would leave nothing in them. The copied evidence text
-- therefore says "earliest logged write": an earlier publication that no log shows is possible.
-- A row labelled 'recorded' would be the LATEST publication stamped by the trigger, and a
-- republish before this migration would have overwritten the first; there are none in
-- production, so every copied value is an inferred first publication. On a database that does
-- hold 'recorded' rows (the synthetic rehearsal database), the copy treats the one stamped time
-- as the first, which is the only time it kept.
--
-- TRIGGER. album_settings_stamp_published_at still stamps published_at (basis 'recorded') on every
-- unlisted -> public write. It now also runs BEFORE INSERT and decides first_published_at, only
-- while first_published_at_basis IS NULL (an existing basis is never overwritten):
--   INSERT, album already has photo_metadata rows       -> 'unobserved'. A missing row reads as
--       public everywhere, so creating a row for an album that already has photos publishes
--       nothing. This covers the admin toggle or `publish-album.ts --unpublish` on a legacy album
--       (an INSERT of {visibility:'unlisted'}), the gallery_scope insert, and an `--unlisted`
--       re-ingest of a legacy album.
--   INSERT, no photos yet, visibility 'public'          -> stamp published_at and first_published_at
--       ('recorded'). This is a brand-new album ingested public: scripts/ingest-album.ts now
--       inserts the row before it writes any photo (it already did for --unlisted, which stays NULL
--       and gets its stamp when the operator publishes).
--   UPDATE public -> unlisted                           -> 'unobserved'. The album was public with
--       no publication on record, and unpublishing it must not turn the next republish into a launch.
--   UPDATE unlisted -> public                           -> stamp first_published_at only while the
--       basis is NULL; 'unobserved' is left alone. published_at always moves, as before.
-- A PostgREST upsert fires the BEFORE INSERT trigger on the proposed row even when the row exists
-- and the statement resolves to an UPDATE. That is harmless: the DO UPDATE SET list is only
-- album_key, visibility and gallery_scope, so the proposed row's first_published_at_* values are
-- never applied, and the real UPDATE is what the UPDATE branch sees.
--
-- ANALYTICS CONSUMERS switched here (SQL that already shipped is replaced, not edited in place):
--   * public.analytics_read_scheduled_gallery_report (latest definition: 20261005200000) reads
--     first_published_at wherever it read published_at: the new-album rule behind Rising's
--     exclusion and `publishedAfterComparison`, the publication_age comparison, and the
--     `publicationAt` field of every album row. Its signature, JSON shape and grants are
--     unchanged. Only the one CTE column and three label sentences differ from 20261005200000.
--   * analytics_private.prepare_engagement_event snapshots first_published_at as
--     catalogue_snapshot.publication_at (the key name is kept). Without this, events after a
--     republish would carry a different publication_at than earlier events for the same album and
--     analytics_daily_actions, which groups on it, would split one album into two. Existing
--     snapshots are immutable and unchanged: for the seven backfilled albums the first and latest
--     times are equal, so they already hold the right value. The body below is copied from
--     20260928120000 with that one line changed.
--
-- NOT CHANGED, on purpose: the latest-gallery ranking, /api/galleries/recent, the admin album
-- list and the publish scripts keep published_at (they are the latest-publication consumers).
--
-- GRANTS. album_settings' anon/authenticated SELECT is column-level (20260730030000) and does not
-- extend to new columns. No anon reader needs first_published_at: the public site reads
-- published_at only, and every analytics reader runs as service_role. So no grant is added.
--
-- ORDERING: apply this migration BEFORE deploying the matching code. The new code selects
-- first_published_at, which does not exist until this runs. The currently deployed code
-- (publish-target.ts) upserts only { album_key, visibility, gallery_scope }; with these
-- constraints that proposed row has published_at and first_published_at both NULL, so it passes,
-- and the trigger sets both on an unlisted -> public update. Requires
-- 20261005230000_album_settings_publication_provenance.sql.

BEGIN;

ALTER TABLE public.album_settings
  ADD COLUMN IF NOT EXISTS first_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_published_at_basis text,
  ADD COLUMN IF NOT EXISTS first_published_at_evidence text;

UPDATE public.album_settings
SET first_published_at = published_at,
    first_published_at_basis = published_at_basis,
    first_published_at_evidence = CASE
      WHEN published_at_basis = 'inferred'
        THEN 'Earliest logged write (personal-Mac session logs only): ' || published_at_evidence
    END
WHERE published_at IS NOT NULL AND first_published_at IS NULL;

-- Public with no publication on record: public before anything recorded it. Production's five
-- (read-only query, 2026-10-06): 5M7kNx and j5MfJD (rows created 2026-02-28 by the gallery_scope
-- migration for albums whose photos date from 2025-10), and rdrsVB, TRoiyO and z6uqiQ (ingested
-- unlisted in June, public by 2026-07-01 to 07-10 per daily activity, publish write unlogged).
UPDATE public.album_settings
SET first_published_at_basis = 'unobserved',
    first_published_at_evidence = 'Public with no publication recorded when first_published_at was introduced (20261006120000); the time cannot be recovered'
WHERE visibility = 'public' AND first_published_at IS NULL AND first_published_at_basis IS NULL;

-- Unlisted with no publication on record. Production's thirteen (read-only query, 2026-10-06):
-- every one has its album_settings row created in the same batch on 2026-06-23 19:20, every one
-- has ALL of its photos added in 2023-2024, long before that row, and none has any audience or
-- unclassified activity in the daily history (from 2026-06-30) or in the retained raw events.
-- Photos that predate the row mean the album read as public by convention until the row hid it, so
-- a later publish is a republish, not a launch. Decision for each: 'unobserved'. Zero activity
-- does not show the album was never public: the history starts after the batch. If Nino says
-- one of them was never public, setting its first_published_at_basis and evidence to NULL makes
-- the next unlisted -> public write stamp a real first publication.
--   CN9SCh dHsLFk gd8s5X gQ658D gSd8PV jFRVKj JhbS79 kc3nPX KFk8JC MNNbgk mPjXhj QxZFrN tg2kqd
-- Any other unlisted row with no first stays NULL: it has not been published yet and gets a
-- 'recorded' stamp when it is.
UPDATE public.album_settings
SET first_published_at_basis = 'unobserved',
    first_published_at_evidence = 'Hidden by the 2026-06-23 batch although all of its photos date from 2023-2024: it read as public before the row existed, and no publication was recorded'
WHERE visibility = 'unlisted' AND first_published_at IS NULL AND first_published_at_basis IS NULL
  AND album_key IN ('CN9SCh','dHsLFk','gd8s5X','gQ658D','gSd8PV','jFRVKj','JhbS79','kc3nPX','KFk8JC','MNNbgk','mPjXhj','QxZFrN','tg2kqd');

ALTER TABLE public.album_settings
  ADD CONSTRAINT album_settings_first_published_at_basis_check
    CHECK (first_published_at_basis IN ('recorded', 'inferred', 'unobserved')),
  -- A time exists exactly when it was recorded or inferred; 'unobserved' and NULL carry none.
  ADD CONSTRAINT album_settings_first_published_at_basis_present
    CHECK ((first_published_at IS NOT NULL) = coalesce(first_published_at_basis IN ('recorded', 'inferred'), false)),
  -- Inferred and unobserved values must say where they came from or why there is none.
  ADD CONSTRAINT album_settings_first_published_at_evidence_present
    CHECK (coalesce(first_published_at_basis IN ('inferred', 'unobserved'), false) = (first_published_at_evidence IS NOT NULL)),
  ADD CONSTRAINT album_settings_first_published_at_order
    CHECK (first_published_at IS NULL OR published_at IS NULL OR first_published_at <= published_at);

CREATE OR REPLACE FUNCTION public.album_settings_stamp_published_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.first_published_at_basis IS NULL THEN
      IF EXISTS (SELECT 1 FROM public.photo_metadata p WHERE p.album_key = NEW.album_key) THEN
        NEW.first_published_at_basis := 'unobserved';
        NEW.first_published_at_evidence := 'Row created for an album that already had photos: it read as public before this row existed, and no publication was recorded';
      ELSIF NEW.visibility = 'public' AND NEW.published_at IS NULL THEN
        NEW.published_at := now();
        NEW.published_at_basis := 'recorded';
        NEW.published_at_evidence := NULL;
        NEW.first_published_at := NEW.published_at;
        NEW.first_published_at_basis := 'recorded';
        NEW.first_published_at_evidence := NULL;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.visibility = 'unlisted' AND NEW.visibility = 'public' THEN
    NEW.published_at := now();
    NEW.published_at_basis := 'recorded';
    NEW.published_at_evidence := NULL;
    -- The first publication is set once, and only while nothing is known about it. A republish
    -- moves published_at and leaves this alone; 'unobserved' is never turned into a launch.
    IF NEW.first_published_at_basis IS NULL THEN
      NEW.first_published_at := NEW.published_at;
      NEW.first_published_at_basis := 'recorded';
      NEW.first_published_at_evidence := NULL;
    END IF;
  ELSIF OLD.visibility = 'public' AND NEW.visibility = 'unlisted' AND NEW.first_published_at_basis IS NULL THEN
    NEW.first_published_at_basis := 'unobserved';
    NEW.first_published_at_evidence := 'Unpublished while public with no publication recorded: it was public before anything recorded it';
  END IF;
  RETURN NEW;
END
$$;

REVOKE EXECUTE ON FUNCTION public.album_settings_stamp_published_at() FROM PUBLIC, anon, authenticated;

-- The trigger from 20261005230000 fired BEFORE UPDATE OF visibility only; it now also decides at INSERT.
DROP TRIGGER IF EXISTS album_settings_stamp_published_at ON public.album_settings;
CREATE TRIGGER album_settings_stamp_published_at
  BEFORE INSERT OR UPDATE OF visibility ON public.album_settings
  FOR EACH ROW EXECUTE FUNCTION public.album_settings_stamp_published_at();

COMMENT ON COLUMN public.album_settings.published_at IS
  'When this album LAST went from unlisted to public. Stamped by the album_settings_stamp_published_at '
  'trigger for every writer; a republish replaces it. Drives the latest-gallery ranking. Analytics '
  'album age uses first_published_at instead. NULL when no publication was ever observed: legacy albums '
  'public before any record existed, and albums whose row was inserted already public. See published_at_basis.';
COMMENT ON COLUMN public.album_settings.first_published_at IS
  'When this album FIRST went from unlisted to public, as far as any record shows. Set once by the '
  'album_settings_stamp_published_at trigger and never moved by a republish. Anchors every analytics '
  'album-age comparison (new-album rule, publication-age comparison, Rising). NULL when no publication '
  'was seen yet or the album was public before anything recorded it; never later than published_at. '
  'Analytics treats NULL as "no launch date". See first_published_at_basis.';
COMMENT ON COLUMN public.album_settings.first_published_at_basis IS
  'How first_published_at was obtained. recorded = stamped by the trigger at the write. inferred = '
  'recovered afterwards from a log of the write (see first_published_at_evidence); an inferred first '
  'publication is the earliest write that log search found, so an earlier unlogged one is possible. '
  'unobserved = the album was public before anything recorded it, so there is no time (first_published_at '
  'is NULL, evidence says why) and a republish never invents one. NULL = no publication seen yet.';
COMMENT ON COLUMN public.album_settings.first_published_at_evidence IS
  'For an inferred first_published_at: the log that observed the write. For unobserved: why there is no '
  'time. NULL otherwise.';

-- Same body as 20261005200000_analytics_rising_excludes_new_albums.sql. Inside it `published_at`
-- is the visible_albums CTE column, now aliased from s.first_published_at, so the new-album rule,
-- the publication_age comparison and every album row's `publicationAt` use the first publication.
CREATE OR REPLACE FUNCTION public.analytics_read_scheduled_gallery_report(
 p_start date,p_end date,p_measure text,p_scope text,p_album_keys text[],p_sport text DEFAULT NULL,
 p_category text DEFAULT NULL,p_source text DEFAULT NULL,p_event_date date DEFAULT NULL,p_season text DEFAULT NULL,
 p_album_event_type text DEFAULT NULL,p_compare text DEFAULT 'previous',p_compare_start date DEFAULT NULL,
 p_compare_end date DEFAULT NULL,p_traffic text DEFAULT 'conservative',p_public_only boolean DEFAULT false,
 p_photo_page integer DEFAULT 0,p_photo_page_size integer DEFAULT 24,p_photo_rank text DEFAULT 'popular',
 p_export boolean DEFAULT false,p_include_today boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER STABLE SET search_path=pg_catalog,public,analytics_private AS $$
DECLARE
 v_compare_start date; v_compare_end date; v_today date:=(statement_timestamp() AT TIME ZONE 'America/Chicago')::date;
 v_current_days integer; v_previous_days integer; v_result jsonb;
BEGIN
 IF p_start IS NULL OR p_end IS NULL OR p_start>p_end THEN RAISE EXCEPTION 'invalid report dates'; END IF;
 v_current_days:=p_end-p_start+1;
 IF v_current_days>3650 THEN RAISE EXCEPTION 'report range exceeds 3650 days'; END IF;
 IF p_measure NOT IN ('photo_opens','album_opens','downloads','favorites','shares') THEN RAISE EXCEPTION 'invalid report measure'; END IF;
 IF p_scope NOT IN ('all','album','selected') OR p_traffic NOT IN ('inclusive','conservative') OR p_compare NOT IN ('previous','custom','publication_age','none') OR p_photo_rank NOT IN ('popular','rising','recent') THEN RAISE EXCEPTION 'invalid report option'; END IF;
 IF p_photo_page<0 OR p_photo_page_size<0 OR p_photo_page_size>100 THEN RAISE EXCEPTION 'invalid photo page'; END IF;
 IF p_scope='album' AND coalesce(cardinality(p_album_keys),0)<>1 THEN RAISE EXCEPTION 'album scope requires one album'; END IF;
 IF p_scope='selected' AND coalesce(cardinality(p_album_keys),0)<2 THEN RAISE EXCEPTION 'selected scope requires two albums'; END IF;
 IF p_compare='previous' THEN v_compare_end:=p_start-1;v_compare_start:=v_compare_end-(p_end-p_start);
 ELSIF p_compare='custom' THEN
  IF p_compare_start IS NULL OR p_compare_end IS NULL THEN RAISE EXCEPTION 'custom comparison requires dates'; END IF;
  v_compare_start:=least(p_compare_start,p_compare_end);v_compare_end:=greatest(p_compare_start,p_compare_end);
  IF v_compare_end-v_compare_start+1>3650 THEN RAISE EXCEPTION 'comparison range exceeds 3650 days'; END IF;
 END IF;
 v_previous_days:=CASE WHEN v_compare_start IS NULL THEN 0 ELSE v_compare_end-v_compare_start+1 END;

 WITH visible_albums AS (
  SELECT a.album_key,a.sport::text sport,a.event_date,s.first_published_at AS published_at FROM public.albums a
  LEFT JOIN public.album_settings s USING(album_key) WHERE NOT p_public_only OR coalesce(s.visibility,'public')<>'unlisted'
 ),eligible_catalogue AS (
  SELECT v.album_key,v.published_at FROM visible_albums v WHERE (p_scope='all' OR v.album_key=ANY(p_album_keys))
   AND (p_sport IS NULL OR v.sport=p_sport) AND (p_event_date IS NULL OR v.event_date=p_event_date)
   AND (p_season IS NULL OR coalesce(extract(year FROM v.event_date)::text,'unknown')=p_season) AND (p_album_event_type IS NULL OR p_album_event_type='unknown')
 ),days AS (
  SELECT g::date bucket_date FROM generate_series(least(p_start,coalesce(v_compare_start,p_start)),greatest(p_end,coalesce(v_compare_end,p_end)),interval '1 day') g
 ),coverage AS (
  SELECT d.bucket_date,CASE WHEN d.bucket_date>v_today THEN NULL WHEN d.bucket_date=v_today AND c.coverage_state IS NOT NULL THEN 'partial' ELSE c.coverage_state END coverage_state,c.cutoff_at,c.reconciled_at,c.catalogue_basis FROM days d LEFT JOIN public.analytics_daily_coverage c USING(bucket_date)
 ),cc AS (
  SELECT CASE WHEN bool_or(coverage_state IS NULL OR coverage_state='unavailable') THEN 'unavailable' WHEN bool_or(coverage_state='partial') THEN 'partial' ELSE 'complete' END state FROM coverage WHERE bucket_date BETWEEN p_start AND p_end
 ),pc AS (
  SELECT CASE WHEN v_compare_start IS NULL THEN 'unavailable' WHEN bool_or(coverage_state IS NULL OR coverage_state='unavailable') THEN 'unavailable' WHEN bool_or(coverage_state='partial') THEN 'partial' ELSE 'complete' END state FROM coverage WHERE v_compare_start IS NOT NULL AND bucket_date BETWEEN v_compare_start AND v_compare_end
 ),base AS (
  SELECT d.bucket_date,d.album_key,d.photo_id,d.event_type,d.source,d.source_kind,d.traffic_classification,d.action_count,d.latest_event_at FROM public.analytics_daily_actions d WHERE d.bucket_date BETWEEN least(p_start,coalesce(v_compare_start,p_start)) AND greatest(p_end,coalesce(v_compare_end,p_end))
   AND (p_scope='all' OR d.album_key=ANY(p_album_keys)) AND (NOT p_public_only OR EXISTS(SELECT 1 FROM visible_albums v WHERE v.album_key=d.album_key))
   AND (NOT p_public_only OR d.photo_id='' OR EXISTS(SELECT 1 FROM public.photo_metadata m JOIN visible_albums v ON v.album_key=m.album_key WHERE m.photo_id=d.photo_id AND m.album_key=d.album_key))
   AND (p_sport IS NULL OR d.sport=p_sport) AND (p_category IS NULL OR d.photo_category=p_category) AND (p_source IS NULL OR d.source=p_source)
   AND (p_event_date IS NULL OR d.event_date=p_event_date) AND (p_season IS NULL OR coalesce(extract(year FROM d.event_date)::text,'unknown')=p_season)
   AND (p_album_event_type IS NULL OR d.album_event_type=p_album_event_type)
 ),cur_all AS (SELECT * FROM base WHERE bucket_date BETWEEN p_start AND p_end),prev_all AS (SELECT * FROM base WHERE v_compare_start IS NOT NULL AND bucket_date BETWEEN v_compare_start AND v_compare_end),
 cur AS (SELECT * FROM cur_all WHERE p_traffic='inclusive' OR traffic_classification IN('audience','unclassified')),
 prev AS (SELECT * FROM prev_all WHERE p_traffic='inclusive' OR traffic_classification IN('audience','unclassified')),
 cm AS (SELECT * FROM cur WHERE (p_measure='photo_opens' AND event_type='view' AND photo_id<>'') OR (p_measure='album_opens' AND event_type='album_open' AND photo_id='') OR (p_measure='downloads' AND event_type='download') OR (p_measure='favorites' AND event_type='favorite') OR (p_measure='shares' AND event_type='share')),
 pm AS (SELECT * FROM prev WHERE (p_measure='photo_opens' AND event_type='view' AND photo_id<>'') OR (p_measure='album_opens' AND event_type='album_open' AND photo_id='') OR (p_measure='downloads' AND event_type='download') OR (p_measure='favorites' AND event_type='favorite') OR (p_measure='shares' AND event_type='share')),
 daily_counts AS (SELECT bucket_date,sum(action_count)::bigint n FROM cm GROUP BY bucket_date),
 ca AS (SELECT album_key,sum(action_count)::bigint n,max(latest_event_at) last_at FROM cm GROUP BY album_key),
 pa AS (SELECT album_key,sum(action_count)::bigint n FROM pm GROUP BY album_key),
 am AS (SELECT album_key,sum(action_count)FILTER(WHERE event_type='view' AND photo_id<>'')::bigint po,sum(action_count)FILTER(WHERE event_type='album_open' AND photo_id='')::bigint ao,sum(action_count)FILTER(WHERE event_type='download')::bigint dl,sum(action_count)FILTER(WHERE event_type='favorite')::bigint fa,sum(action_count)FILTER(WHERE event_type='share')::bigint sh FROM cur GROUP BY album_key),
 album_keys AS (SELECT album_key,published_at FROM eligible_catalogue UNION SELECT ca.album_key,v.published_at FROM ca LEFT JOIN visible_albums v USING(album_key) UNION SELECT pa.album_key,v.published_at FROM pa LEFT JOIN visible_albums v USING(album_key)),
 albums AS (
  SELECT k.album_key,CASE WHEN ca.album_key IS NOT NULL THEN ca.n WHEN cc.state='complete' THEN 0 END n,CASE WHEN pa.album_key IS NOT NULL THEN pa.n WHEN pc.state='complete' THEN 0 END pn,ca.last_at,max(k.published_at) published_at,
   CASE WHEN cc.state='complete' THEN jsonb_build_object('photo_opens',coalesce(am.po,0),'album_opens',coalesce(am.ao,0),'downloads',coalesce(am.dl,0),'favorites',coalesce(am.fa,0),'shares',coalesce(am.sh,0)) ELSE jsonb_build_object('photo_opens',NULL,'album_opens',NULL,'downloads',NULL,'favorites',NULL,'shares',NULL) END measures
  FROM album_keys k CROSS JOIN cc CROSS JOIN pc LEFT JOIN ca USING(album_key) LEFT JOIN pa USING(album_key) LEFT JOIN am USING(album_key)
  GROUP BY k.album_key,ca.album_key,ca.n,ca.last_at,pa.album_key,pa.n,cc.state,pc.state,am.po,am.ao,am.dl,am.fa,am.sh
 ),photo_events AS (
  -- Aggregate every photo once. Joining several unindexed CTE groups can become
  -- quadratic after a burst when the planner still estimates a single row.
  SELECT b.*,bucket_date BETWEEN p_start AND p_end is_current,
   v_compare_start IS NOT NULL AND bucket_date BETWEEN v_compare_start AND v_compare_end is_previous,
   (p_measure='photo_opens' AND event_type='view') OR (p_measure='downloads' AND event_type='download') OR (p_measure='favorites' AND event_type='favorite') OR (p_measure='shares' AND event_type='share') matches_measure
  FROM base b WHERE photo_id<>'' AND (p_traffic='inclusive' OR traffic_classification IN('audience','unclassified'))
 ),photo_aggregates AS (
  SELECT photo_id,album_key,
   sum(action_count)FILTER(WHERE is_current AND matches_measure)::bigint n,
   sum(action_count)FILTER(WHERE is_previous AND matches_measure)::bigint pn,
   max(latest_event_at)FILTER(WHERE is_current AND matches_measure) last_at,
   sum(action_count)FILTER(WHERE is_current AND event_type='view')::bigint po,
   sum(action_count)FILTER(WHERE is_current AND event_type='download')::bigint dl,
   sum(action_count)FILTER(WHERE is_current AND event_type='favorite')::bigint fa,
   sum(action_count)FILTER(WHERE is_current AND event_type='share')::bigint sh
  FROM photo_events GROUP BY photo_id,album_key HAVING bool_or(matches_measure AND (is_current OR is_previous))
 ),photos0 AS (
  SELECT a.photo_id,a.album_key,CASE WHEN a.n IS NOT NULL THEN a.n WHEN cc.state='complete' THEN 0 END n,
   CASE WHEN a.pn IS NOT NULL THEN a.pn WHEN pc.state='complete' THEN 0 END pn,a.last_at,
   CASE WHEN cc.state='complete' THEN jsonb_build_object('photo_opens',coalesce(a.po,0),'album_opens',0,'downloads',coalesce(a.dl,0),'favorites',coalesce(a.fa,0),'shares',coalesce(a.sh,0)) ELSE jsonb_build_object('photo_opens',NULL,'album_opens',NULL,'downloads',NULL,'favorites',NULL,'shares',NULL) END measures,
   CASE WHEN cc.state='complete' AND pc.state='complete' THEN CASE WHEN v_current_days=v_previous_days THEN coalesce(a.n,0)-coalesce(a.pn,0) ELSE coalesce(a.n,0)::numeric/v_current_days-coalesce(a.pn,0)::numeric/v_previous_days END END rising
  FROM photo_aggregates a CROSS JOIN cc CROSS JOIN pc
 ),ranked AS (
  SELECT f.*,count(*)OVER()::integer total,row_number()OVER(ORDER BY CASE WHEN p_photo_rank='recent' THEN last_at END DESC NULLS LAST,CASE WHEN p_photo_rank='rising' THEN rising END DESC NULLS LAST,CASE WHEN p_photo_rank='popular' THEN n END DESC NULLS LAST,n DESC NULLS LAST,photo_id,album_key) rn FROM photos0 f
   -- Rising needs a comparison. A photo whose album was first published after the
   -- comparison window ended had nothing to compare, so it is left out of Rising
   -- (and its total) rather than ranked by its whole count. Same rule as
   -- publishedAfterComparison() in src/lib/analytics/report-contract.ts: the
   -- recorded publication time's Chicago date is after the comparison end.
   -- Never inferred from event or import dates. Popular and Recent are unchanged.
   WHERE p_photo_rank<>'rising' OR v_compare_end IS NULL OR NOT EXISTS(
    SELECT 1 FROM album_keys k WHERE k.album_key=f.album_key AND (k.published_at AT TIME ZONE 'America/Chicago')::date>v_compare_end)
 ),page_meta AS (SELECT coalesce(max(total),0)::integer total,CASE WHEN p_export OR p_photo_page_size=0 OR coalesce(max(total),0)=0 THEN 0 ELSE least(p_photo_page,(coalesce(max(total),0)-1)/p_photo_page_size) END::integer page FROM ranked),
 page AS (SELECT r.* FROM ranked r CROSS JOIN page_meta x WHERE p_export OR (p_photo_page_size>0 AND r.rn>x.page*p_photo_page_size AND r.rn<=(x.page+1)*p_photo_page_size)),
 cao AS (SELECT album_key,sum(action_count)::bigint n,max(latest_event_at) last_at FROM cm WHERE photo_id='' GROUP BY album_key),pao AS (SELECT album_key,sum(action_count)::bigint n FROM pm WHERE photo_id='' GROUP BY album_key),aok AS (SELECT album_key FROM cao UNION SELECT album_key FROM pao),
 sources AS (SELECT source_kind,CASE WHEN source='direct' THEN 'Unknown / no tag' ELSE source END source,sum(action_count)::bigint n FROM cur GROUP BY source_kind,CASE WHEN source='direct' THEN 'Unknown / no tag' ELSE source END),
 traffic AS (SELECT traffic_classification classification,sum(action_count)::bigint n FROM cur_all WHERE (p_measure='photo_opens' AND event_type='view' AND photo_id<>'') OR (p_measure='album_opens' AND event_type='album_open' AND photo_id='') OR (p_measure='downloads' AND event_type='download') OR (p_measure='favorites' AND event_type='favorite') OR (p_measure='shares' AND event_type='share') GROUP BY traffic_classification),
 impact0 AS (SELECT album_key,sum(action_count)::bigint inclusive,coalesce(sum(action_count)FILTER(WHERE traffic_classification IN('audience','unclassified')),0)::bigint conservative FROM cur_all WHERE (p_measure='photo_opens' AND event_type='view' AND photo_id<>'') OR (p_measure='album_opens' AND event_type='album_open' AND photo_id='') OR (p_measure='downloads' AND event_type='download') OR (p_measure='favorites' AND event_type='favorite') OR (p_measure='shares' AND event_type='share') GROUP BY album_key),
 impact AS (SELECT i.*,row_number()OVER(ORDER BY inclusive DESC,album_key)::integer ir,row_number()OVER(ORDER BY conservative DESC,album_key)::integer cr FROM impact0 i),
 today_cov AS (SELECT cutoff_at FROM public.analytics_daily_coverage WHERE bucket_date=v_today AND coverage_state IN ('complete','partial') AND cutoff_at>=v_today::timestamp AT TIME ZONE 'America/Chicago'),
 today_actions AS (SELECT sum(d.action_count)::bigint n FROM public.analytics_daily_actions d WHERE p_include_today AND d.bucket_date=v_today AND (p_scope='all' OR d.album_key=ANY(p_album_keys)) AND (NOT p_public_only OR EXISTS(SELECT 1 FROM visible_albums v WHERE v.album_key=d.album_key)) AND (NOT p_public_only OR d.photo_id='' OR EXISTS(SELECT 1 FROM public.photo_metadata m JOIN visible_albums v ON v.album_key=m.album_key WHERE m.photo_id=d.photo_id AND m.album_key=d.album_key)) AND (p_sport IS NULL OR d.sport=p_sport) AND (p_category IS NULL OR d.photo_category=p_category) AND (p_source IS NULL OR d.source=p_source) AND (p_event_date IS NULL OR d.event_date=p_event_date) AND (p_season IS NULL OR coalesce(extract(year FROM d.event_date)::text,'unknown')=p_season) AND (p_album_event_type IS NULL OR d.album_event_type=p_album_event_type) AND (p_traffic='inclusive' OR d.traffic_classification IN('audience','unclassified')) AND ((p_measure='photo_opens' AND d.event_type='view' AND d.photo_id<>'') OR (p_measure='album_opens' AND d.event_type='album_open' AND d.photo_id='') OR (p_measure='downloads' AND d.event_type='download') OR (p_measure='favorites' AND d.event_type='favorite') OR (p_measure='shares' AND d.event_type='share'))),
 pub_albums AS (SELECT album_key,max(published_at) published_at FROM album_keys GROUP BY album_key),
 age_days AS (SELECT p.album_key,p.published_at,g n,(p.published_at AT TIME ZONE 'America/Chicago')::date+g bucket_date FROM pub_albums p CROSS JOIN generate_series(0,v_current_days-1) g WHERE p_compare='publication_age' AND p.published_at IS NOT NULL),
 age_series AS (SELECT a.*,CASE WHEN a.bucket_date>=v_today THEN 'partial' ELSE c.coverage_state END coverage_state,CASE WHEN c.coverage_state='complete' AND a.bucket_date<v_today THEN coalesce(sum(d.action_count),0)::bigint END n_actions FROM age_days a LEFT JOIN public.analytics_daily_coverage c USING(bucket_date) LEFT JOIN public.analytics_daily_actions d ON d.bucket_date=a.bucket_date AND d.album_key=a.album_key AND (NOT p_public_only OR d.photo_id='' OR EXISTS(SELECT 1 FROM public.photo_metadata m JOIN visible_albums v ON v.album_key=m.album_key WHERE m.photo_id=d.photo_id AND m.album_key=d.album_key)) AND (p_sport IS NULL OR d.sport=p_sport) AND (p_category IS NULL OR d.photo_category=p_category) AND (p_source IS NULL OR d.source=p_source) AND (p_event_date IS NULL OR d.event_date=p_event_date) AND (p_season IS NULL OR coalesce(extract(year FROM d.event_date)::text,'unknown')=p_season) AND (p_album_event_type IS NULL OR d.album_event_type=p_album_event_type) AND (p_traffic='inclusive' OR d.traffic_classification IN('audience','unclassified')) AND ((p_measure='photo_opens' AND d.event_type='view' AND d.photo_id<>'') OR (p_measure='album_opens' AND d.event_type='album_open' AND d.photo_id='') OR (p_measure='downloads' AND d.event_type='download') OR (p_measure='favorites' AND d.event_type='favorite') OR (p_measure='shares' AND d.event_type='share')) GROUP BY a.album_key,a.published_at,a.n,a.bucket_date,c.coverage_state),
 age_albums AS (SELECT album_key,published_at,CASE WHEN bool_and(coverage_state='complete') THEN sum(n_actions) END total,CASE WHEN bool_or(coverage_state IS NULL OR coverage_state='unavailable') THEN 'unavailable' WHEN bool_or(coverage_state='partial') THEN 'partial' ELSE 'complete' END coverage,jsonb_agg(to_jsonb(n_actions)ORDER BY n) series FROM age_series GROUP BY album_key,published_at)
 SELECT jsonb_build_object(
  'coverage',cc.state,'previousCoverage',pc.state,'observedTotal',coalesce((SELECT sum(action_count)FROM cm),0),'total',CASE WHEN cc.state='complete'THEN coalesce((SELECT sum(action_count)FROM cm),0)END,'previousTotal',CASE WHEN pc.state='complete'THEN coalesce((SELECT sum(action_count)FROM pm),0)END,
  'daily',(SELECT coalesce(jsonb_agg(jsonb_build_object('date',c.bucket_date,'coverage',coalesce(c.coverage_state,'unavailable'),'observed',CASE WHEN c.coverage_state IN ('complete','partial') THEN coalesce(d.n,0)END,'count',CASE WHEN c.coverage_state='complete'THEN coalesce(d.n,0)END)ORDER BY c.bucket_date),'[]')FROM coverage c LEFT JOIN daily_counts d USING(bucket_date) WHERE c.bucket_date BETWEEN p_start AND p_end),
  'albums',(SELECT coalesce(jsonb_agg(jsonb_build_object('albumKey',a.album_key,'count',a.n,'previousCount',a.pn,'difference',CASE WHEN cc.state='complete'AND pc.state='complete'THEN a.n-a.pn END,'risingValue',CASE WHEN cc.state='complete'AND pc.state='complete'THEN CASE WHEN v_current_days=v_previous_days THEN a.n-a.pn ELSE a.n::numeric/v_current_days-a.pn::numeric/v_previous_days END END,'measures',a.measures,'lastActivity',a.last_at,'publicationAt',a.published_at)ORDER BY a.n DESC NULLS LAST,a.album_key),'[]')FROM albums a),
  'photos',(SELECT coalesce(jsonb_agg(jsonb_build_object('photoId',p.photo_id,'albumKey',p.album_key,'count',p.n,'previousCount',p.pn,'difference',CASE WHEN cc.state='complete'AND pc.state='complete'THEN p.n-p.pn END,'risingValue',p.rising,'measures',p.measures,'lastActivity',p.last_at,'imageUrl',NULL)ORDER BY p.rn),'[]')FROM page p),
  'photoPagination',jsonb_build_object('page',x.page,'pageSize',CASE WHEN p_export THEN 0 ELSE p_photo_page_size END,'total',x.total,'pageCount',CASE WHEN p_export OR p_photo_page_size=0 THEN 0 ELSE ceil(x.total::numeric/p_photo_page_size)::integer END,'rank',p_photo_rank),
  'albumOnlyActions',(SELECT coalesce(jsonb_agg(jsonb_build_object('albumKey',k.album_key,'count',CASE WHEN c.album_key IS NOT NULL THEN c.n WHEN cc.state='complete'THEN 0 END,'previousCount',CASE WHEN p.album_key IS NOT NULL THEN p.n WHEN pc.state='complete'THEN 0 END,'difference',CASE WHEN cc.state='complete'AND pc.state='complete'THEN coalesce(c.n,0)-coalesce(p.n,0)END,'lastActivity',c.last_at)ORDER BY coalesce(c.n,0)DESC,k.album_key),'[]')FROM aok k LEFT JOIN cao c USING(album_key)LEFT JOIN pao p USING(album_key)),
  'sources',jsonb_build_object('arrivals',(SELECT coalesce(jsonb_agg(jsonb_build_object('source',source,'count',n)ORDER BY n DESC,source),'[]')FROM sources WHERE source_kind='tagged_arrival'),'openLocations',(SELECT coalesce(jsonb_agg(jsonb_build_object('source',source,'count',n)ORDER BY n DESC,source),'[]')FROM sources WHERE source_kind='internal_open_location'),'unknown',coalesce((SELECT sum(n)FROM sources WHERE source_kind='unknown'),0)),
  'traffic',(SELECT coalesce(jsonb_agg(jsonb_build_object('classification',classification,'count',n)ORDER BY n DESC,classification),'[]')FROM traffic),
  'trafficImpact',(SELECT coalesce(jsonb_agg(jsonb_build_object('albumKey',album_key,'inclusive',inclusive,'conservative',conservative,'excluded',inclusive-conservative,'inclusiveRank',ir,'conservativeRank',cr)ORDER BY ir,album_key),'[]')FROM impact),
  'today',jsonb_build_object('date',v_today,'count',CASE WHEN p_include_today AND EXISTS(SELECT 1 FROM today_cov)THEN coalesce((SELECT n FROM today_actions),0)END,'asOf',CASE WHEN p_include_today THEN(SELECT cutoff_at FROM today_cov)END),
  'dataAsOf',(SELECT max(reconciled_at)FROM coverage WHERE bucket_date BETWEEN p_start AND p_end),'preservedSince',(SELECT min(bucket_date)FROM public.analytics_daily_coverage),'catalogueBasis',coalesce((SELECT string_agg(DISTINCT catalogue_basis,', ')FROM coverage WHERE bucket_date BETWEEN p_start AND p_end),'unavailable'),
  'publicationAge',CASE WHEN p_compare='publication_age'THEN jsonb_build_object('available',EXISTS(SELECT 1 FROM age_albums),'label',CASE WHEN EXISTS(SELECT 1 FROM age_albums)THEN format('Each album uses its first %s calendar day%s after the recorded first publication time. Albums with missing daily history remain unavailable.',v_current_days,CASE WHEN v_current_days=1 THEN '' ELSE 's' END)ELSE'No selected album has a recorded first publication time.'END,'days',v_current_days,'albums',(SELECT coalesce(jsonb_agg(jsonb_build_object('albumKey',album_key,'publishedAt',published_at,'total',total,'coverage',coverage,'series',series)ORDER BY total DESC NULLS LAST,album_key),'[]')FROM age_albums),'missingAlbumKeys',(SELECT coalesce(jsonb_agg(album_key ORDER BY album_key),'[]')FROM pub_albums WHERE published_at IS NULL))ELSE jsonb_build_object('available',false,'label','Choose publication-age comparison to align albums from their recorded first publication dates.','days',v_current_days,'albums','[]'::jsonb,'missingAlbumKeys','[]'::jsonb)END
 ) INTO v_result FROM cc CROSS JOIN pc CROSS JOIN page_meta x;
 RETURN v_result;
END $$;

-- Same body as analytics_private.prepare_engagement_event in 20260928120000, with one line
-- changed: the event snapshot's publication_at is now album_settings.first_published_at.
CREATE OR REPLACE FUNCTION analytics_private.prepare_engagement_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, analytics_private AS $$
DECLARE
  authoritative_album text;
  target_exists boolean;
  snapshot jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(
      NEW.photo_id, NEW.album_key, NEW.event_type, NEW.session_hash,
      NEW.source, NEW.created_at, NEW.event_day, NEW.traffic_context, NEW.source_kind
    ) IS DISTINCT FROM ROW(
      OLD.photo_id, OLD.album_key, OLD.event_type, OLD.session_hash,
      OLD.source, OLD.created_at, OLD.event_day, OLD.traffic_context, OLD.source_kind
    ) OR (
      OLD.catalogue_snapshot IS NOT NULL
      AND NEW.catalogue_snapshot IS DISTINCT FROM OLD.catalogue_snapshot
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'engagement event facts and attached catalogue snapshot are immutable';
    END IF;
    -- The migration's one allowed attachment is NULL -> first backfill snapshot.
    IF OLD.catalogue_snapshot IS NULL AND NEW.catalogue_snapshot IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.photo_id IS NOT NULL THEN
    SELECT pm.album_key INTO authoritative_album
    FROM public.photo_metadata pm
    WHERE pm.photo_id = NEW.photo_id;
    IF NOT FOUND OR authoritative_album IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'unknown photo target';
    END IF;
    IF NEW.album_key IS NOT NULL AND NEW.album_key <> authoritative_album THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'photo and album targets do not match';
    END IF;
    NEW.album_key := authoritative_album;
  ELSIF NEW.album_key IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.albums a WHERE a.album_key = NEW.album_key
    ) INTO target_exists;
    IF NOT target_exists THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'unknown album target';
    END IF;
  END IF;

  CASE NEW.event_type
    WHEN 'view' THEN
      IF NEW.photo_id IS NULL AND NEW.source_kind <> 'tagged_arrival' THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = 'photo view requires a photo unless emitted as a tagged arrival';
      END IF;
      IF NEW.photo_id IS NOT NULL AND NEW.source_kind = 'unknown' THEN
        NEW.source_kind := 'internal_open_location';
      END IF;
    WHEN 'album_open' THEN
      IF NEW.photo_id IS NOT NULL OR NEW.album_key IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = 'album_open requires an album and no photo';
      END IF;
      IF NEW.source_kind = 'unknown' THEN NEW.source_kind := 'internal_open_location'; END IF;
    WHEN 'favorite', 'download', 'share' THEN
      IF NEW.photo_id IS NULL AND NEW.album_key IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'action requires a photo or album';
      END IF;
      IF NEW.source_kind = 'unknown' THEN NEW.source_kind := 'action'; END IF;
    ELSE
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'unsupported engagement event type';
  END CASE;

  IF NEW.catalogue_snapshot IS NULL THEN
    SELECT jsonb_build_object(
      '_basis', 'event_snapshot',
      'album_key', NEW.album_key,
      'sport', a.sport::text,
      'event_date', a.event_date,
      'album_event_type', NULL::text,
      'publication_at', settings.first_published_at,
      'photo_category', pm.photo_category
    ) INTO snapshot
    FROM (SELECT 1) seed
    LEFT JOIN public.albums a ON a.album_key = NEW.album_key
    LEFT JOIN public.album_settings settings ON settings.album_key = NEW.album_key
    LEFT JOIN public.photo_metadata pm ON pm.photo_id = NEW.photo_id;
    NEW.catalogue_snapshot := snapshot;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
