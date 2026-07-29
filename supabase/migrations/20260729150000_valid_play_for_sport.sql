-- A play must belong to the photo's sport, and now the database says so.
--
-- 20260729140000 fixed the FLAT vocabulary: play_type must be one of the 47 canonical
-- plays. That cannot express the other half of the rule taxonomy.ts has always claimed --
-- "the map additionally validates that a given play belongs to the photo's sport" --
-- so `spike` on a basketball photo was still legal.
--
-- 1,166 rows were in that state:
--
--   926  created by 20260729140000 itself. The owner's `attack -> spike` decision was
--        applied to all 3,534 attack rows, but 926 of them were basketball, soccer,
--        baseball, tennis and pickleball photos. `attack` was at least sport-neutral;
--        `spike` names a volleyball action, so those rows got more wrong, not less.
--   227  pre-existing, the same volleyball vocabulary bleeding outward:
--        basketball/dig (46), soccer/dig (39), baseball/serve (24), softball/serve (23).
--    13  a play on a row with no sport at all.
--
-- All of them become NULL, which is the same treatment the owner approved for values
-- outside the flat vocabulary: if it does not name a play this photo could contain, it
-- is not a play. photo_category is again left alone.
--
-- The constraint below is GENERATED from PLAY_TYPES_BY_SPORT by scripts/taxonomy-gen.ts.
-- `sport_type IS NOT NULL` in it is load-bearing: without that guard a play on a
-- sportless row makes every disjunct NULL, the predicate NULL, and a CHECK accepts NULL --
-- the identical trap that made the original valid_play_type inert.

-- A play must belong to the photo's sport. `sport_type IS NOT NULL` is load-bearing:
-- without it a play on a sportless row makes the predicate NULL, which a CHECK accepts.
ALTER TABLE photo_metadata DROP CONSTRAINT IF EXISTS valid_play_for_sport;
ALTER TABLE photo_metadata ADD CONSTRAINT valid_play_for_sport CHECK (
  play_type IS NULL OR (sport_type IS NOT NULL AND (
    (sport_type = 'volleyball' AND play_type IN ('spike', 'block', 'dig', 'set', 'serve', 'pass')) OR
    (sport_type = 'basketball' AND play_type IN ('dunk', 'layup', 'jump_shot', 'rebound', 'block', 'pass', 'dribble')) OR
    (sport_type = 'soccer' AND play_type IN ('kick', 'header', 'tackle', 'save', 'dribble', 'pass')) OR
    (sport_type = 'softball' AND play_type IN ('pitch', 'hit', 'catch', 'throw', 'slide', 'run')) OR
    (sport_type = 'baseball' AND play_type IN ('pitch', 'hit', 'catch', 'throw', 'slide', 'run')) OR
    (sport_type = 'football' AND play_type IN ('throw', 'catch', 'run', 'tackle', 'block', 'kick')) OR
    (sport_type = 'track' AND play_type IN ('sprint', 'hurdle', 'relay', 'long_jump', 'high_jump', 'pole_vault', 'shot_put', 'discus', 'javelin')) OR
    (sport_type = 'cross_country' AND play_type IN ('running', 'start', 'finish', 'pack_running', 'hill_climb')) OR
    (sport_type = 'golf' AND play_type IN ('swing', 'putt', 'chip', 'drive')) OR
    (sport_type = 'tennis' AND play_type IN ('serve', 'forehand', 'backhand', 'volley', 'smash')) OR
    (sport_type = 'bowling' AND play_type IN ('delivery', 'release', 'approach')) OR
    (sport_type = 'pickleball' AND play_type IN ('serve', 'dink', 'volley', 'smash', 'drive'))
  ))
) NOT VALID;

-- Backfill: clear every play that its sport cannot contain.
UPDATE photo_metadata SET play_type = NULL
WHERE play_type IS NOT NULL
  AND NOT (sport_type IS NOT NULL AND (
    (sport_type = 'volleyball' AND play_type IN ('spike', 'block', 'dig', 'set', 'serve', 'pass')) OR
    (sport_type = 'basketball' AND play_type IN ('dunk', 'layup', 'jump_shot', 'rebound', 'block', 'pass', 'dribble')) OR
    (sport_type = 'soccer' AND play_type IN ('kick', 'header', 'tackle', 'save', 'dribble', 'pass')) OR
    (sport_type = 'softball' AND play_type IN ('pitch', 'hit', 'catch', 'throw', 'slide', 'run')) OR
    (sport_type = 'baseball' AND play_type IN ('pitch', 'hit', 'catch', 'throw', 'slide', 'run')) OR
    (sport_type = 'football' AND play_type IN ('throw', 'catch', 'run', 'tackle', 'block', 'kick')) OR
    (sport_type = 'track' AND play_type IN ('sprint', 'hurdle', 'relay', 'long_jump', 'high_jump', 'pole_vault', 'shot_put', 'discus', 'javelin')) OR
    (sport_type = 'cross_country' AND play_type IN ('running', 'start', 'finish', 'pack_running', 'hill_climb')) OR
    (sport_type = 'golf' AND play_type IN ('swing', 'putt', 'chip', 'drive')) OR
    (sport_type = 'tennis' AND play_type IN ('serve', 'forehand', 'backhand', 'volley', 'smash')) OR
    (sport_type = 'bowling' AND play_type IN ('delivery', 'release', 'approach')) OR
    (sport_type = 'pickleball' AND play_type IN ('serve', 'dink', 'volley', 'smash', 'drive'))
  ));

ALTER TABLE photo_metadata VALIDATE CONSTRAINT valid_play_for_sport;
