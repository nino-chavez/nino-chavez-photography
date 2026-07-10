-- Team entities + aliases (find-my-photos: name search resolves entities, not substrings)
-- =======================================================================================
-- ROOT CAUSE: team identity lives only inside `album_name` display strings ("Lewis vs UCLA"),
-- so the search path (AND'd `album_name ILIKE %term%`) can never match the names people
-- actually type — "lewis university" returns 0 while 8 Lewis albums exist, because no album
-- string contains the word "university". Entities + aliases make search a resolution step
-- (query → alias → team → album set) instead of a substring gamble.
--
-- ADDITIVE ONLY (safe pre-merge per the one-DB-is-prod rule): three new tables + two new
-- nullable columns. Nothing `main` selects is touched.

-- Canonical team/school/program entities.
CREATE TABLE IF NOT EXISTS public.teams (
  team_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,          -- canonical display name, e.g. "Lewis University"
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Alias → team. Alias is the lowercase-normalized PK so resolution is deterministic:
-- one alias maps to exactly one team ("lewis", "lewis university", "lewis flyers" → Lewis).
-- source tracks provenance so zero-result-log-derived aliases can be audited separately.
CREATE TABLE IF NOT EXISTS public.team_aliases (
  alias      text PRIMARY KEY,
  team_id    uuid NOT NULL REFERENCES public.teams(team_id) ON DELETE CASCADE,
  source     text NOT NULL DEFAULT 'operator',  -- 'album_parse' | 'operator' | 'zero_result'
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_aliases_team_idx ON public.team_aliases (team_id);

-- Which teams appear in which album (an album has 0..n teams; tournaments have many).
CREATE TABLE IF NOT EXISTS public.album_teams (
  album_key  text NOT NULL REFERENCES public.albums(album_key) ON DELETE CASCADE,
  team_id    uuid NOT NULL REFERENCES public.teams(team_id) ON DELETE CASCADE,
  source     text NOT NULL DEFAULT 'album_parse',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (album_key, team_id)
);
CREATE INDEX IF NOT EXISTS album_teams_team_idx ON public.album_teams (team_id);

-- Operator-known-at-ingest context that had no column to land in.
ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS venue text;

-- Readable text in the frame (jersey fronts/backs, banners, scoreboards) from the vision
-- extraction — the photo often literally names the school; the schema never asked for it.
ALTER TABLE public.photo_metadata ADD COLUMN IF NOT EXISTS visible_text text[];

-- RLS: reference data, public read. Rows carry no secrets — unlisted-album privacy is enforced
-- at photo-query time (excludeUnlisted), and album_teams exposes only keys, not names.
ALTER TABLE public.teams        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.album_teams  ENABLE ROW LEVEL SECURITY;
CREATE POLICY teams_public_read        ON public.teams        FOR SELECT USING (true);
CREATE POLICY team_aliases_public_read ON public.team_aliases FOR SELECT USING (true);
CREATE POLICY album_teams_public_read  ON public.album_teams  FOR SELECT USING (true);

-- SEC-8 flipped default privileges to fail-closed: new tables need explicit grants
-- (search reads these through the ANON server client since #61).
GRANT SELECT ON public.teams, public.team_aliases, public.album_teams TO anon, authenticated;
