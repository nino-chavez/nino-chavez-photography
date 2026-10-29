-- Synthetic-only fixtures. Dates exercise Chicago buckets, UTC historical
-- deduplication, nullable snapshots, visibility, correction, retention, and a
-- scalar report larger than PostgREST's ordinary 1,000-row cap.
BEGIN;

INSERT INTO public.albums (
  album_key, album_name, sport, event_date
) VALUES
  ('alpha', 'Alpha Invitational', 'volleyball', '2026-09-20'),
  ('beta', 'Beta Portraits', NULL, NULL),
  ('gamma', 'Gamma Zero Activity', 'soccer', '2026-09-21');

INSERT INTO public.album_settings (album_key, published_at, visibility) VALUES
  ('alpha', '2026-09-19T18:00:00Z', 'public'),
  ('beta', NULL, 'unlisted'),
  ('gamma', '2026-09-21T15:00:00Z', 'public');

INSERT INTO public.photo_metadata (
  photo_id, album_key, image_key, album_name, sport_type, photo_category,
  cf_image_id, sharpness, quality_score
) VALUES
  ('alpha-1', 'alpha', 'alpha-1', 'Alpha Invitational', 'volleyball', 'action', 'fixture-alpha-1', 1, 90),
  ('alpha-2', 'alpha', 'alpha-2', 'Alpha Invitational', 'volleyball', 'action', 'fixture-alpha-2', 1, 90),
  ('alpha-correction', 'alpha', 'alpha-correction', 'Alpha Invitational', 'volleyball', 'action', 'fixture-alpha-correction', 1, 80),
  ('alpha-control', 'alpha', 'alpha-control', 'Alpha Invitational', 'volleyball', 'action', 'fixture-alpha-control', 1, 80),
  ('beta-1', 'beta', 'beta-1', 'Beta Portraits', NULL, NULL, 'fixture-beta-1', 1, 70);

INSERT INTO public.photo_metadata (
  photo_id, album_key, image_key, album_name, sport_type, photo_category,
  cf_image_id, sharpness, quality_score
)
SELECT 'alpha-bulk-' || n, 'alpha', 'alpha-bulk-' || n,
  'Alpha Invitational', 'volleyball', 'action',
  'fixture-alpha-bulk-' || n, 1, 60
FROM generate_series(1, 1105) n;

INSERT INTO public.photo_jersey_sightings (
  photo_id, jersey_number, team_color, team_side
) VALUES
  ('alpha-correction', '99', 'blue', 'home'),
  ('alpha-control', '99', 'blue', 'home');

-- 01:00Z through 04:59Z are September 27 in Chicago. The legacy row already
-- attached by the migration makes this day mixed snapshot/backfill provenance.
INSERT INTO public.engagement_events (
  photo_id, album_key, event_type, session_hash, source, source_kind,
  created_at, event_day, traffic_context
) VALUES
  ('alpha-1', 'alpha', 'view', 'audience-a', 'photo-detail', 'internal_open_location', '2026-09-28T01:00:00Z', '2026-09-28', 'audience'),
  ('alpha-2', 'alpha', 'view', 'audience-b', 'lightbox', 'internal_open_location', '2026-09-28T02:00:00Z', '2026-09-28', 'audience'),
  ('alpha-1', 'alpha', 'view', 'operator-a', 'operator-check', 'internal_open_location', '2026-09-28T03:00:00Z', '2026-09-28', 'operator'),
  ('alpha-1', 'alpha', 'view', 'test-a', 'rehearsal', 'internal_open_location', '2026-09-28T04:00:00Z', '2026-09-28', 'test'),
  (NULL, 'alpha', 'view', 'arrival-a', 'instagram', 'tagged_arrival', '2026-09-28T04:30:00Z', '2026-09-28', 'audience'),
  ('alpha-1', 'alpha', 'download', 'audience-a', 'download-button', 'action', '2026-09-28T04:59:30Z', '2026-09-27', 'audience'),
  ('alpha-correction', 'alpha', 'share', 'correction-a', 'share', 'action', '2026-09-28T04:40:00Z', '2026-09-28', 'audience'),
  ('alpha-control', 'alpha', 'view', 'control-a', 'gallery-grid', 'internal_open_location', '2026-09-28T04:41:00Z', '2026-09-28', 'audience'),
  (NULL, 'alpha', 'download', 'album-download', 'bulk-zip', 'action', '2026-09-28T17:00:00Z', '2026-09-28', 'audience'),
  (NULL, 'beta', 'album_open', 'audience-c', 'album-page', 'internal_open_location', '2026-09-28T04:45:00Z', '2026-09-28', 'audience');

-- The exact reproduced retention edge: the 10:00 row is already older than
-- the June 29 12:00 floor, but both rows are still physically present.
INSERT INTO public.engagement_events (
  photo_id, album_key, event_type, session_hash, source, source_kind,
  created_at, event_day, traffic_context
) VALUES
  (NULL, 'alpha', 'album_open', 'boundary-early', 'retention-edge', 'internal_open_location', '2026-06-29T10:00:00Z', '2026-06-29', 'audience'),
  (NULL, 'alpha', 'album_open', 'boundary-late', 'retention-edge', 'internal_open_location', '2026-06-29T18:00:00Z', '2026-06-29', 'audience'),
  (NULL, 'alpha', 'album_open', 'expired-present', 'expired-present', 'internal_open_location', '2026-06-27T18:00:00Z', '2026-06-27', 'audience'),
  (NULL, 'alpha', 'album_open', 'failed-summary', 'failed-summary', 'internal_open_location', '2026-06-28T18:00:00Z', '2026-06-28', 'audience');

-- More than one API page of action rows.
INSERT INTO public.engagement_events (
  photo_id, album_key, event_type, session_hash, source, source_kind,
  created_at, event_day, traffic_context
)
SELECT 'alpha-bulk-' || n, 'alpha', 'view', 'bulk-' || n,
  'gallery-grid', 'internal_open_location',
  '2026-09-28T18:00:00Z'::timestamptz + (n || ' milliseconds')::interval,
  '2026-09-28', 'audience'
FROM generate_series(1, 1105) n;

-- One session over the retained UTC-day threshold is suspected automation. It
-- remains a heuristic classification until a versioned correction says otherwise.
INSERT INTO public.engagement_events (
  photo_id, album_key, event_type, session_hash, source, source_kind,
  created_at, event_day, traffic_context
)
SELECT 'alpha-bulk-' || n, 'alpha', 'view', 'burst-session',
  'burst', 'internal_open_location',
  '2026-09-28T19:00:00Z'::timestamptz + (n || ' milliseconds')::interval,
  '2026-09-28', 'audience'
FROM generate_series(1, 501) n;

-- Explicit JSON nulls and first-backfill facts must not move with catalogue edits.
UPDATE public.albums SET event_date = '2026-10-31' WHERE album_key = 'beta';
UPDATE public.albums SET event_date = '2026-09-01' WHERE album_key = 'legacy';
REFRESH MATERIALIZED VIEW public.albums_summary;
COMMIT;
