-- Album-level browse facets: division + level.
--
-- Audited down from 6 proposed name-derived facets to these 2. The others were cut as redundant
-- or low-value: `teams`/`program` are already covered by album_name search + the homepage program
-- chips (a column adds no findability); `season`/`year` duplicate photo_date/the timeline;
-- `event_type` is marginal (portraits are privacy-gated) and `venue` too sparse. `division` and
-- `level` survive because "girls volleyball" / "men's college" is a browse axis free-text CANNOT
-- express (the tokens are cryptic: WVB/WMVB/BVB) — and division derives ~95% clean from names.
--
-- DDL only. Population is done by scripts/populate-album-facets.ts (validated JS regex; more reliable
-- than translating the derivation to Postgres regex). Re-runnable and idempotent.
-- Columns are NULLABLE + additive — safe for the shared DB (letspepper reads album_settings.gallery_scope
-- + albums_summary + photo_metadata; neither new column is read by either app until a consumer ships).

ALTER TABLE albums ADD COLUMN IF NOT EXISTS division text;  -- girls | boys | womens | mens | coed
ALTER TABLE albums ADD COLUMN IF NOT EXISTS level text;     -- high_school | college | club | middle_school

CREATE INDEX IF NOT EXISTS idx_albums_division ON albums(division) WHERE division IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_albums_level    ON albums(level)    WHERE level    IS NOT NULL;

COMMENT ON COLUMN albums.division IS 'Derived from album_name: girls|boys|womens|mens|coed. Browse facet.';
COMMENT ON COLUMN albums.level    IS 'Derived from album_name: high_school|college|club|middle_school. Browse facet.';
