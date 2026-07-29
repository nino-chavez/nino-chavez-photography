-- Repair valid_play_type, which has never rejected anything.
--
-- The constraint in prod was:
--   CHECK (play_type = ANY (ARRAY['attack','block','dig','set','serve',
--                                 'pass','celebration','timeout', NULL]))
--
-- `x = ANY (ARRAY[..., NULL])` yields NULL when x matches no element, and a CHECK
-- passes on NULL -- only FALSE rejects. So every value passed while pg_constraint
-- reported convalidated: true. The same table's `valid_sport_type` (migration
-- 20260608020000) is written `col IS NULL OR col IN (...)` and works: sport_type has
-- zero out-of-vocabulary values, play_type had forty across 6,573 rows.
--
-- That old constraint appears in no migration in this repo -- it was applied to prod
-- by hand, and its nine-value list was volleyball-only and omitted `spike`.
--
-- The replacement below is GENERATED from src/lib/ai/taxonomy.ts by
-- scripts/taxonomy-gen.ts (database/generated/taxonomy-enums.sql). Do not hand-edit
-- the value list here; change ALL_PLAY_TYPES, regenerate, and add a new migration.
--
-- Order follows 20260608020000 + 20260608030000: add NOT VALID so the ADD does not
-- fail on the backlog, backfill, then VALIDATE. Adding it valid first fails on 6,573
-- rows.

-- Nullable: play_type IS NULL means "not a play" (a candid, a celebration, a portrait).
ALTER TABLE photo_metadata DROP CONSTRAINT IF EXISTS valid_play_type;
ALTER TABLE photo_metadata ADD CONSTRAINT valid_play_type CHECK (
  play_type IS NULL OR play_type IN (
    'approach', 'backhand', 'block', 'catch', 'chip', 'delivery',
    'dig', 'dink', 'discus', 'dribble', 'drive', 'dunk',
    'finish', 'forehand', 'header', 'high_jump', 'hill_climb', 'hit',
    'hurdle', 'javelin', 'jump_shot', 'kick', 'layup', 'long_jump',
    'pack_running', 'pass', 'pitch', 'pole_vault', 'putt', 'rebound',
    'relay', 'release', 'run', 'running', 'save', 'serve',
    'set', 'shot_put', 'slide', 'smash', 'spike', 'sprint',
    'start', 'swing', 'tackle', 'throw', 'volley'
  )
) NOT VALID;

-- Backfill, decided by the owner 2026-07-29:
--
--   attack -> spike   (3,534 rows). `attack` is not in the taxonomy; `spike` is the
--                     canonical volleyball term and already held 474 rows.
--   everything else out of vocabulary -> NULL (3,039 rows across 39 values).
--                     None of them name a play: `celebration` (2,758), `transition`,
--                     `waiting`, `bench`, `handshake`, `fishing`, `NA`. NULL is the
--                     documented value for "not a play".
--
-- photo_category is deliberately NOT touched. 2,145 of the `celebration` rows are
-- categorised action/candid, and overwriting that on the strength of the other column
-- would have quadrupled the Victory Celebrations collection (698 -> 2,807) on a guess.
-- The prior play_type of every affected row was snapshotted before this ran.

UPDATE photo_metadata SET play_type = 'spike' WHERE play_type = 'attack';

UPDATE photo_metadata SET play_type = NULL
WHERE play_type IS NOT NULL
  AND NOT (play_type IN (
    'approach', 'backhand', 'block', 'catch', 'chip', 'delivery',
    'dig', 'dink', 'discus', 'dribble', 'drive', 'dunk',
    'finish', 'forehand', 'header', 'high_jump', 'hill_climb', 'hit',
    'hurdle', 'javelin', 'jump_shot', 'kick', 'layup', 'long_jump',
    'pack_running', 'pass', 'pitch', 'pole_vault', 'putt', 'rebound',
    'relay', 'release', 'run', 'running', 'save', 'serve',
    'set', 'shot_put', 'slide', 'smash', 'spike', 'sprint',
    'start', 'swing', 'tackle', 'throw', 'volley'
  ));

ALTER TABLE photo_metadata VALIDATE CONSTRAINT valid_play_type;
