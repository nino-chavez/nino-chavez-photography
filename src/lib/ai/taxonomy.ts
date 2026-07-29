/**
 * CANONICAL TAXONOMY — the single source of truth for every controlled vocabulary in the
 * extraction pipeline. The AI structured-output JSON schema and the prompt enum lists are
 * generated from this file (scripts/taxonomy-gen.ts), and scripts/taxonomy-check.ts fails CI
 * if a generated artifact drifts from these arrays.
 *
 * ⚠️ THE ENUM TYPES ARE STILL DECORATIVE. taxonomy-gen.ts renders
 * `database/generated/taxonomy-enums.sql`, which CREATEs `photo_category_enum`,
 * `play_type_enum` and the rest — and NO COLUMN USES ANY OF THEM. `photo_category` is
 * varchar; `play_type` is text. Until 2026-07-29 this header claimed the Postgres
 * enums/CHECKs were all generated from here, and that sentence is why nobody looked.
 *
 * What IS generated and applied, as of 2026-07-30, are three CHECK constraints on
 * photo_metadata — `valid_play_type` from ALL_PLAY_TYPES, `valid_play_for_sport` from
 * PLAY_TYPES_BY_SPORT, and `valid_photo_category` from PHOTO_CATEGORIES (renderers below;
 * migrations 20260729140000 / 20260729150000 / 20260730000000). With the pre-existing
 * `valid_sport_type`, every enrichment column this file governs is now enforced in storage.
 *
 * So: generation covers the write path and, now, part of the storage layer.
 * `npm run taxonomy:audit` (scripts/taxonomy-audit.ts) is what checks the live database
 * against these arrays; taxonomy-check.ts only proves the generated FILES match. A green
 * taxonomy-check is still not evidence that the data conforms.
 *
 * WHY this exists (north-star slice 0): the prior system hand-maintained enum lists in three
 * places that drifted — the vision prompt listed 9 sports while the data accumulated 13
 * (golf/baseball/bowling/pickleball escaped the vocabulary entirely), and the photo_category
 * value 'portrait' bled into sport_type. One source + a drift test makes that whole class of
 * bug impossible. Add a sport/play here and every consumer updates from one edit.
 *
 * NOTE: `sport` is NULLABLE in the data model (NULL = non-sport shoot: portrait/graduation/
 * family/event). 'other' is for an unrecognized SPORT, not for non-sport. Do not conflate.
 */

export const SPORTS = [
	'volleyball', 'basketball', 'soccer', 'softball', 'baseball', 'football',
	'track', 'cross_country', 'golf', 'tennis', 'bowling', 'pickleball', 'other',
] as const;
export type Sport = (typeof SPORTS)[number];

export const PHOTO_CATEGORIES = ['action', 'celebration', 'candid', 'portrait', 'warmup', 'ceremony'] as const;
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];

export const ACTION_INTENSITIES = ['low', 'medium', 'high', 'peak'] as const;
export type ActionIntensity = (typeof ACTION_INTENSITIES)[number];

export const EMOTIONS = ['triumph', 'determination', 'intensity', 'focus', 'excitement', 'serenity'] as const;
export type Emotion = (typeof EMOTIONS)[number];

export const COMPOSITIONS = ['rule_of_thirds', 'leading_lines', 'centered', 'symmetry', 'frame_within_frame'] as const;
export type Composition = (typeof COMPOSITIONS)[number];

export const TIMES_OF_DAY = ['golden_hour', 'midday', 'evening', 'blue_hour', 'night', 'dawn'] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

export const LIGHTINGS = ['natural', 'backlit', 'dramatic', 'soft', 'artificial'] as const;
export type Lighting = (typeof LIGHTINGS)[number];

export const COLOR_TEMPERATURES = ['warm', 'cool', 'neutral'] as const;
export type ColorTemperature = (typeof COLOR_TEMPERATURES)[number];

export const TIMES_IN_GAME = ['first_5_min', 'middle', 'final_5_min', 'overtime', 'unknown'] as const;
export type TimeInGame = (typeof TIMES_IN_GAME)[number];

/**
 * Per-sport play vocabulary. The flattened union (ALL_PLAY_TYPES) is the play_type enum;
 * the map additionally validates that a given play belongs to the photo's sport.
 */
export const PLAY_TYPES_BY_SPORT = {
	volleyball: ['spike', 'block', 'dig', 'set', 'serve', 'pass'],
	basketball: ['dunk', 'layup', 'jump_shot', 'rebound', 'block', 'pass', 'dribble'],
	soccer: ['kick', 'header', 'tackle', 'save', 'dribble', 'pass'],
	softball: ['pitch', 'hit', 'catch', 'throw', 'slide', 'run'],
	baseball: ['pitch', 'hit', 'catch', 'throw', 'slide', 'run'],
	football: ['throw', 'catch', 'run', 'tackle', 'block', 'kick'],
	track: ['sprint', 'hurdle', 'relay', 'long_jump', 'high_jump', 'pole_vault', 'shot_put', 'discus', 'javelin'],
	cross_country: ['running', 'start', 'finish', 'pack_running', 'hill_climb'],
	golf: ['swing', 'putt', 'chip', 'drive'],
	tennis: ['serve', 'forehand', 'backhand', 'volley', 'smash'],
	bowling: ['delivery', 'release', 'approach'],
	pickleball: ['serve', 'dink', 'volley', 'smash', 'drive'],
	other: [],
} as const satisfies Record<Sport, readonly string[]>;

export const ALL_PLAY_TYPES = [...new Set(Object.values(PLAY_TYPES_BY_SPORT).flat())].sort();

// --- guards / helpers -------------------------------------------------------
export const isSport = (x: unknown): x is Sport => typeof x === 'string' && (SPORTS as readonly string[]).includes(x);
export const playTypesForSport = (sport: Sport): readonly string[] => PLAY_TYPES_BY_SPORT[sport];
export const isPlayForSport = (sport: Sport, play: string): boolean => playTypesForSport(sport).includes(play);

/**
 * The named enums, keyed by their canonical DB type name. The single registry that codegen
 * and the drift check both iterate — add an enum here and the SQL + JSON schema follow.
 */
export const ENUMS: Record<string, readonly string[]> = {
	sport: SPORTS,
	photo_category: PHOTO_CATEGORIES,
	action_intensity: ACTION_INTENSITIES,
	emotion: EMOTIONS,
	composition: COMPOSITIONS,
	time_of_day: TIMES_OF_DAY,
	lighting: LIGHTINGS,
	color_temperature: COLOR_TEMPERATURES,
	time_in_game: TIMES_IN_GAME,
	play_type: ALL_PLAY_TYPES,
};

// --- renderers (pure; codegen writes them, the drift check re-renders + diffs) ----------

/** Postgres enum DDL for every taxonomy enum (idempotent CREATE ... pattern). */
export function renderSql(): string {
	const header = '-- GENERATED by scripts/taxonomy-gen.ts from src/lib/ai/taxonomy.ts — DO NOT EDIT.\n'
		+ '-- Run `npx tsx scripts/taxonomy-gen.ts` to regenerate; CI runs taxonomy-check.ts.\n\n';
	const blocks = Object.entries(ENUMS).map(([name, vals]) => {
		const lits = vals.map((v) => `'${v}'`).join(', ');
		return `DO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${name}_enum') THEN\n    CREATE TYPE ${name}_enum AS ENUM (${lits});\n  END IF;\nEND $$;`;
	});
	return header + blocks.join('\n\n') + '\n\n'
		+ renderSportTypeNote()
		+ renderPhotoCategoryCheck() + '\n'
		+ renderPlayTypeCheck() + '\n'
		+ renderPlayForSportCheck();
}

/**
 * `sport_type` is the one enrichment column whose CHECK predates this file and is already
 * correct (`sport_type IS NULL OR sport_type IN (...)`, verified against pg_constraint). It is
 * NOT re-rendered here — regenerating it would mean dropping and re-adding a working constraint
 * on 20K rows for no gain. The note exists so the absence reads as deliberate rather than as
 * the fourth column somebody forgot.
 */
function renderSportTypeNote(): string {
	return '-- sport_type: constrained by the pre-existing `valid_sport_type`, which is already the\n'
		+ '-- correct `IS NULL OR IN (...)` shape. Deliberately not re-rendered here.\n\n';
}

/**
 * The `valid_photo_category` CHECK, rendered from PHOTO_CATEGORIES.
 *
 * `photo_category` had no constraint of any kind — not an inert one, none — while `sport_type`
 * and `play_type` both had one. Nothing rejected a bad value and nothing reported one either,
 * so the column drifted in silence: a single row held `celebr`, a `celebration` truncated to
 * the column's width by some earlier writer, and it survived from 2026-06-08 into the category
 * facet on /explore, the badge on its own photo card, and `/api/ai/stats` — which answer
 * engines republish verbatim.
 *
 * One row is the whole point. A vocabulary with no enforcement does not fail loudly at scale;
 * it produces exactly this — a value too small to notice sitting on a public surface.
 *
 * Same shape rule as the others: `col IS NULL OR col IN (...)`, never `= ANY (ARRAY[…, NULL])`.
 * Nullable because a photo may legitimately have no category (the ingest writes null when the
 * model returns a value outside the vocabulary).
 */
export function renderPhotoCategoryCheck(): string {
	const lits = PHOTO_CATEGORIES.map((v) => `'${v}'`).join(', ');
	return (
		'-- Nullable: photo_category IS NULL means the extractor returned nothing usable.\n' +
		'ALTER TABLE photo_metadata DROP CONSTRAINT IF EXISTS valid_photo_category;\n' +
		'ALTER TABLE photo_metadata ADD CONSTRAINT valid_photo_category CHECK (\n' +
		'  photo_category IS NULL OR photo_category IN (\n' +
		`    ${lits}\n` +
		'  )\n) NOT VALID;\n'
	);
}

/**
 * The `valid_play_type` CHECK, rendered from ALL_PLAY_TYPES so the constraint text is
 * derived from this file rather than typed into the database by hand — which is exactly
 * how the previous one came to allow nine volleyball-only values and omit `spike`.
 *
 * ⚠️ The shape is `col IS NULL OR col IN (...)`, NOT `col = ANY (ARRAY[..., NULL])`.
 * The old constraint used the latter: a value matching nothing compares against the NULL
 * and yields NULL, and a CHECK passes on NULL — only FALSE rejects. It accepted every
 * string for its whole life while reporting convalidated: true. Never put NULL inside the
 * value list; express nullability with an explicit `IS NULL` disjunct, the way
 * `valid_sport_type` already does.
 */
export function renderPlayTypeCheck(): string {
	const lits = ALL_PLAY_TYPES.map((v) => `'${v}'`);
	const wrapped: string[] = [];
	for (let i = 0; i < lits.length; i += 6) wrapped.push('    ' + lits.slice(i, i + 6).join(', '));
	return (
		'-- Nullable: play_type IS NULL means "not a play" (a candid, a celebration, a portrait).\n' +
		'ALTER TABLE photo_metadata DROP CONSTRAINT IF EXISTS valid_play_type;\n' +
		'ALTER TABLE photo_metadata ADD CONSTRAINT valid_play_type CHECK (\n' +
		'  play_type IS NULL OR play_type IN (\n' +
		wrapped.join(',\n') +
		'\n  )\n) NOT VALID;\n'
	);
}

/**
 * The `valid_play_for_sport` CHECK, rendered from PLAY_TYPES_BY_SPORT.
 *
 * The flat vocabulary alone cannot say that `spike` is meaningless on a basketball photo.
 * This file already promised the map "additionally validates that a given play belongs to
 * the photo's sport" — until now nothing enforced it, and 227 rows carried a volleyball
 * play on another sport (basketball/dig, soccer/dig, baseball/serve).
 *
 * ⚠️ Note the explicit `sport_type IS NOT NULL` guard. Without it, a row with a play and no
 * sport makes every disjunct NULL, the whole predicate NULL, and the CHECK passes — the same
 * trap that made the old valid_play_type inert. A play with no sport must be rejected, not
 * silently admitted. `other` has an empty play list and is therefore rejected the same way.
 */
export function renderPlayForSportCheck(): string {
	const arms = Object.entries(PLAY_TYPES_BY_SPORT)
		.filter(([, plays]) => plays.length > 0)
		.map(([sport, plays]) => {
			const lits = plays.map((p) => `'${p}'`).join(', ');
			return `    (sport_type = '${sport}' AND play_type IN (${lits}))`;
		});
	return (
		'-- A play must belong to the photo\'s sport. `sport_type IS NOT NULL` is load-bearing:\n' +
		'-- without it a play on a sportless row makes the predicate NULL, which a CHECK accepts.\n' +
		'ALTER TABLE photo_metadata DROP CONSTRAINT IF EXISTS valid_play_for_sport;\n' +
		'ALTER TABLE photo_metadata ADD CONSTRAINT valid_play_for_sport CHECK (\n' +
		'  play_type IS NULL OR (sport_type IS NOT NULL AND (\n' +
		arms.join(' OR\n') +
		'\n  ))\n) NOT VALID;\n'
	);
}

/** JSON-schema $defs (one enum per taxonomy field) for the extraction structured output. */
export function renderJsonSchema(): string {
	const defs: Record<string, { type: string; enum: readonly string[] }> = {};
	for (const [name, vals] of Object.entries(ENUMS)) defs[name] = { type: 'string', enum: vals };
	return JSON.stringify({
		$comment: 'GENERATED by scripts/taxonomy-gen.ts from src/lib/ai/taxonomy.ts — DO NOT EDIT.',
		$defs: defs,
	}, null, 2) + '\n';
}
