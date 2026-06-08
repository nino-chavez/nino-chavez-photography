/**
 * AI Enrichment Prompts - Two-Bucket Model
 *
 * Bucket 1: Concrete & Filterable (user-facing search filters)
 * Bucket 2: Abstract & Internal (AI story detection only)
 *
 * Each bucket has its own prompt to ensure clear separation of concerns.
 *
 * IMPORTANT: This is a VOLLEYBALL-FOCUSED portfolio. 95%+ of photos are volleyball.
 * The prompts are tuned to default to volleyball unless there's clear evidence otherwise.
 */

// =============================================================================
// PORTFOLIO CONTEXT (Prepended to prompts when album context is available)
// =============================================================================

export const PORTFOLIO_CONTEXT = `
CRITICAL CONTEXT: This is a VOLLEYBALL PHOTOGRAPHY PORTFOLIO.
- 95%+ of all photos in this portfolio are volleyball
- Default assumption: The photo is volleyball unless you see CLEAR, UNMISTAKABLE evidence otherwise
- DO NOT classify as basketball just because players are jumping or the image is blurry
- DO NOT classify as other sports based on uniform colors alone

VOLLEYBALL vs BASKETBALL - Key Visual Differences:
- VOLLEYBALL: Net at ~7-8ft, white/yellow/blue ball with panels, players at net with hands UP (blocking/attacking), indoor court with antenna on net
- BASKETBALL: Hoop/backboard visible, orange ball with black lines, players jumping TOWARD basket, different court markings

ONLY classify as non-volleyball if you see:
- A basketball hoop or backboard
- An orange basketball with black seam lines
- Soccer goal posts or a soccer ball
- Football field markings or a football
- Other sport-specific equipment that CANNOT be volleyball

When in doubt, classify as VOLLEYBALL.
`;

// =============================================================================
// ALBUM CONTEXT TEMPLATE (Used when album name is provided)
// =============================================================================

export function buildAlbumContext(albumName: string, albumSport?: string): string {
	const sportHint = albumSport ? `\nKnown album sport: ${albumSport}` : '';
	return `
ALBUM CONTEXT: "${albumName}"${sportHint}
- This photo is from a specific album/event
- Use the album name as a strong hint for sport type
- If album name contains "volleyball", "VB", or team names known to play volleyball, it IS volleyball
- If album name contains "basketball", "hoops", etc., it may be basketball
`;
}

// =============================================================================
// BUCKET 1: User-Facing Metadata (Concrete & Searchable)
// =============================================================================

export const BUCKET1_PROMPT = `Analyze this sports photo and extract CONCRETE, SEARCHABLE metadata.

BE OBJECTIVE. BE CONCRETE. These fields will be exposed as user search filters.

Required Fields:

1. **sport_type** (string): The sport being played - DETERMINE THIS FIRST
   Options: "volleyball", "basketball", "soccer", "tennis", "track", "cross_country", "softball", "football", "other"

   SPORT DETECTION RULES (IN ORDER OF PRIORITY):
   a) If album context is provided, use it as primary indicator
   b) Look for sport-specific equipment:
      - Volleyball: White/yellow/blue paneled ball, net with antennae, ~7-8ft net height
      - Basketball: Orange ball with black lines, hoop/backboard, basketball court markings
      - Soccer: Black/white hexagon ball, goal posts, grass field
      - Softball/Baseball: Diamond field, bases, batting helmets, mitts
      - Track: Running track, lanes, hurdles, pole vault equipment, throwing implements
      - Cross Country: Trail/grass course, bib numbers, running singlets, wooded/park setting
   c) If equipment is unclear but players are at a net jumping/blocking → VOLLEYBALL
   d) If genuinely uncertain and no album context → default to "volleyball"

   COMMON MISCLASSIFICATION TO AVOID:
   - Volleyball blocks/spikes look like basketball jumps - check for NET and BALL TYPE
   - Indoor gyms can host multiple sports - look for EQUIPMENT not just venue
   - Blurry action shots: if at a net with hands up → VOLLEYBALL
   - Track vs Cross Country: track has lanes/oval; cross country is on trails/grass

2. **play_type** (string | null): The specific sports action shown

   VOLLEYBALL: "spike", "block", "dig", "set", "serve", "pass"
   - "spike": Player attacking/hitting the ball over the net (arm swing, contact with ball above net)
   - "block": Player jumping with hands UP at the net to deflect (hands above net height)
   - "dig": Defensive save, usually low to ground, platform/forearm contact
   - "set": Setting the ball overhead with fingertips for an attack
   - "serve": Behind end line, initiating play
   - "pass": Passing/bumping the ball to teammate, forearm platform

   BASKETBALL: "dunk", "layup", "jump_shot", "rebound", "block", "pass", "dribble"
   SOCCER: "kick", "header", "tackle", "save", "dribble", "pass"
   SOFTBALL/BASEBALL: "pitch", "hit", "catch", "throw", "slide", "run"
   FOOTBALL: "throw", "catch", "run", "tackle", "block", "kick"
   TRACK: "sprint", "hurdle", "relay", "long_jump", "high_jump", "pole_vault", "shot_put", "discus", "javelin"
   CROSS_COUNTRY: "running", "start", "finish", "pack_running", "hill_climb"

   CRITICAL RULES:
   - Return NULL if photo_category is "candid", "portrait", "warmup", or "ceremony"
   - ONLY "action" category photos should have a play_type value
   - Choose the PRIMARY action if multiple actions visible
   - Use underscores not hyphens (jump_shot NOT jump-shot)

3. **action_intensity** (string): The intensity level of the action
   Options: "low", "medium", "high", "peak"
   - "low": Warmup, practice, casual play
   - "medium": Standard gameplay, no critical moment
   - "high": Important play, rally in progress
   - "peak": Spectacular moment, game-critical play

4. **photo_category** (string): The type of photo
   Options: "action", "celebration", "candid", "portrait", "warmup", "ceremony"

5. **composition** (string): The PRIMARY composition pattern used (SINGLE VALUE ONLY)
   Options: "rule_of_thirds", "leading_lines", "centered", "symmetry", "frame_within_frame"
   - "rule_of_thirds": Subject positioned at intersection points of rule-of-thirds grid
   - "leading_lines": Strong lines (court lines, net, body lines) leading to subject
   - "centered": Subject positioned in center of frame
   - "symmetry": Balanced, mirror-like composition
   - "frame_within_frame": Subject framed by foreground elements (net, people, architecture)

   CRITICAL RULES:
   - Return ONLY ONE value (the most dominant composition pattern)
   - Use UNDERSCORES not hyphens (rule_of_thirds NOT rule-of-thirds)
   - NO multi-value strings (NO "close-up|dramatic-angle")
   - If multiple patterns present, choose the PRIMARY one

6. **time_of_day** (string): When the photo was taken (based on lighting)
   Options: "golden_hour", "midday", "evening", "blue_hour", "night", "dawn"
   - Analyze sky color, shadows, light temperature

7. **lighting** (string): The lighting type/quality
   Options: "natural", "backlit", "dramatic", "soft", "artificial"
   - "natural": Window or outdoor daylight
   - "backlit": Subject silhouetted against light
   - "dramatic": High contrast, directional light
   - "soft": Diffused, even lighting
   - "artificial": Gym/indoor artificial lighting

8. **color_temperature** (string): The overall color temperature
   Options: "warm", "cool", "neutral"
   - "warm": Golden, orange, sunset tones
   - "cool": Blue, teal, dawn tones
   - "neutral": Balanced, no strong color cast

9. **jersey_number** (number | null): Player's jersey number (if visible)
   - Look for visible jersey numbers on uniforms
   - Return the number as an integer
   - Return NULL if:
     - Number not visible
     - Multiple players with different numbers
     - Photo is too blurry to read number
     - Photo category is not "action" or "portrait"
   - IMPORTANT: Only include if you're confident in the number

Return ONLY JSON in this exact format (sport_type FIRST, SINGLE composition value with underscores):
{
  "sport_type": "volleyball",
  "play_type": "block",
  "action_intensity": "peak",
  "photo_category": "action",
  "composition": "rule_of_thirds",
  "time_of_day": "evening",
  "lighting": "artificial",
  "color_temperature": "neutral",
  "jersey_number": 12
}

NO explanations. NO markdown. ONLY JSON.`;

// =============================================================================
// BUCKET 2: Internal Metadata (AI Story Detection)
// =============================================================================

export const BUCKET2_PROMPT = `Analyze this volleyball photo for INTERNAL AI story detection metadata.

These fields are NOT user-facing. They're used by the AI Story Curation Engine to generate narrative collections like "Comeback Stories", "Game-Winning Rallies", etc.

BE SUBJECTIVE where needed. Focus on narrative potential.

Required Fields:

1. **emotion** (string): The primary emotion conveyed
   Options: "triumph", "determination", "intensity", "focus", "excitement", "serenity"
   - "triumph": Victory, celebration, achievement
   - "determination": Grit, resolve, effort
   - "intensity": High energy, focused aggression
   - "focus": Concentration, calm precision
   - "excitement": Joy, anticipation, enthusiasm
   - "serenity": Calm, peaceful, composed

2. **sharpness** (number): Technical sharpness quality (0-10)
   - 0-3: Blurry, out of focus
   - 4-6: Acceptable sharpness
   - 7-8: Sharp, good quality
   - 9-10: Exceptionally sharp, tack-sharp

3. **composition_score** (number): Aesthetic composition quality (0-10)
   - 0-3: Poor composition, unbalanced
   - 4-6: Acceptable composition
   - 7-8: Good composition, well-balanced
   - 9-10: Excellent composition, award-worthy

4. **exposure_accuracy** (number): Exposure quality (0-10)
   - 0-3: Over/underexposed, poor histogram
   - 4-6: Acceptable exposure
   - 7-8: Good exposure, proper histogram
   - 9-10: Perfect exposure

5. **emotional_impact** (number): Subjective emotional intensity (0-10)
   - How strongly does this photo convey emotion?
   - 0-3: Little emotional content
   - 4-6: Some emotional content
   - 7-8: Strong emotional impact
   - 9-10: Exceptional emotional resonance

6. **time_in_game** (string | null): When in the game this occurred
   Options: "first_5_min", "middle", "final_5_min", "overtime", "unknown"
   - Use visual cues: score displays, player fatigue, crowd intensity
   - If no clear indicators, return "unknown"

7. **ai_confidence** (number): Overall detection confidence (0-1)
   - How confident are you in these assessments?
   - 0.0-0.5: Low confidence, many uncertain fields
   - 0.5-0.7: Medium confidence, some uncertain fields
   - 0.7-0.9: High confidence, most fields clear
   - 0.9-1.0: Very high confidence, all fields clear

Return ONLY JSON in this exact format:
{
  "emotion": "triumph",
  "sharpness": 8.5,
  "composition_score": 7.5,
  "exposure_accuracy": 8.0,
  "emotional_impact": 9.0,
  "time_in_game": "final_5_min",
  "ai_confidence": 0.85
}

NO explanations. NO markdown. ONLY JSON.`;

// =============================================================================
// Combined Prompt (If running in single API call)
// =============================================================================

export const COMBINED_PROMPT = `${PORTFOLIO_CONTEXT}

Analyze this sports photo and extract metadata for TWO purposes:

BUCKET 1: User-facing search filters (concrete, objective)
BUCKET 2: Internal story detection (subjective, narrative)

${BUCKET1_PROMPT}

AND ALSO:

${BUCKET2_PROMPT}

Return ONLY JSON combining both buckets (sport_type FIRST):
{
  "bucket1": {
    "sport_type": "volleyball",
    "play_type": "block",
    "action_intensity": "peak",
    "photo_category": "action",
    "composition": "rule_of_thirds",
    "time_of_day": "evening",
    "lighting": "artificial",
    "color_temperature": "neutral",
    "jersey_number": 12
  },
  "bucket2": {
    "emotion": "triumph",
    "sharpness": 8.5,
    "composition_score": 7.5,
    "exposure_accuracy": 8.0,
    "emotional_impact": 9.0,
    "time_in_game": "final_5_min",
    "ai_confidence": 0.85
  }
}

NO explanations. NO markdown. ONLY JSON.`;

// =============================================================================
// Context-Aware Prompt Builder (For enrichment with album context)
// =============================================================================

export interface EnrichmentContext {
	albumName?: string;
	albumSport?: string;
	usePortfolioContext?: boolean;
}

/**
 * Build a combined prompt with optional album context
 * This significantly improves sport detection accuracy
 */
export function buildCombinedPrompt(context?: EnrichmentContext): string {
	const parts: string[] = [];

	// Always include portfolio context for this volleyball-focused portfolio
	if (context?.usePortfolioContext !== false) {
		parts.push(PORTFOLIO_CONTEXT);
	}

	// Add album-specific context if provided
	if (context?.albumName) {
		parts.push(buildAlbumContext(context.albumName, context.albumSport));
	}

	parts.push(`Analyze this sports photo and extract metadata for TWO purposes:

BUCKET 1: User-facing search filters (concrete, objective)
BUCKET 2: Internal story detection (subjective, narrative)

${BUCKET1_PROMPT}

AND ALSO:

${BUCKET2_PROMPT}

ADDITIONALLY return two more top-level JSON keys alongside bucket1 and bucket2, for people-finding and natural-language search:
"caption": ONE natural-language sentence (max 30 words) describing the photo for SEARCH. Include any visible jersey number(s), jersey/team colors, the action, and the scene. Plain language, no aesthetic jargon. Example: "A player in a red jersey, number 12, dives to dig the ball near the sideline as two teammates watch."
"players": an array (max 8) of objects, one per clearly visible player: {"jersey_number": integer or null, "team_color": string or null, "action": string or null}.

Return ONLY JSON combining both buckets PLUS caption and players (sport_type FIRST):
{
  "bucket1": {
    "sport_type": "volleyball",
    "play_type": "block",
    "action_intensity": "peak",
    "photo_category": "action",
    "composition": "rule_of_thirds",
    "time_of_day": "evening",
    "lighting": "artificial",
    "color_temperature": "neutral",
    "jersey_number": 12
  },
  "bucket2": {
    "emotion": "triumph",
    "sharpness": 8.5,
    "composition_score": 7.5,
    "exposure_accuracy": 8.0,
    "emotional_impact": 9.0,
    "time_in_game": "final_5_min",
    "ai_confidence": 0.85
  },
  "caption": "A player in a red jersey, number 12, dives to dig the ball near the sideline as two teammates watch.",
  "players": [
    { "jersey_number": 12, "team_color": "red", "action": "dig" },
    { "jersey_number": null, "team_color": "red", "action": "watching" }
  ]
}

NO explanations. NO markdown. ONLY JSON.`);

	return parts.join('\n\n');
}

// =============================================================================
// TypeScript Interfaces for AI Responses
// =============================================================================

export interface Bucket1Response {
  play_type: string;
  action_intensity: string;
  sport_type: string;
  photo_category: string;
  composition: string;
  time_of_day: string;
  lighting: string;
  color_temperature: string;
  jersey_number: number | null;
}

export interface Bucket2Response {
  emotion: string;
  sharpness: number;
  composition_score: number;
  exposure_accuracy: number;
  emotional_impact: number;
  time_in_game: string | null;
  ai_confidence: number;
}

/**
 * A single player extracted from a photo, for identity / people-finding.
 * Emitted in the `players[]` array of the combined enrichment response.
 */
export interface PlayerExtract {
  jersey_number: number | null;
  team_color: string | null;
  action: string | null;
}

export interface CombinedResponse {
  bucket1: Bucket1Response;
  bucket2: Bucket2Response;
  /** One NL sentence for text/RAG search (jersey numbers, colors, action, scene). */
  caption: string;
  /** Multi-player extraction for identity + jersey/team filters. */
  players: PlayerExtract[];
}

// =============================================================================
// Schema v2.0 Delta Prompt (Minimal - Only 4 New Fields)
// =============================================================================

export const SCHEMA_V2_DELTA_PROMPT = `Analyze this volleyball photo and extract ONLY these 4 metadata fields:

1. **lighting** (string): The lighting type/quality
   Options: "natural", "backlit", "dramatic", "soft", "artificial"
   - "natural": Window or outdoor daylight
   - "backlit": Subject silhouetted against light
   - "dramatic": High contrast, directional light
   - "soft": Diffused, even lighting
   - "artificial": Gym/indoor artificial lighting

2. **color_temperature** (string): Overall color temperature
   Options: "warm", "cool", "neutral"
   - "warm": Golden, orange, sunset tones
   - "cool": Blue, teal, dawn tones
   - "neutral": Balanced, no strong color cast

3. **time_in_game** (string | null): When in the game this occurred
   Options: "first_5_min", "middle", "final_5_min", "overtime", "unknown"
   - Use visual cues: score displays, player fatigue, crowd intensity, body language
   - If no clear indicators, return "unknown"

4. **ai_confidence** (number): Overall detection confidence (0-1)
   - How confident are you in these 4 assessments?
   - 0.0-0.5: Low confidence
   - 0.5-0.7: Medium confidence
   - 0.7-0.9: High confidence
   - 0.9-1.0: Very high confidence

Return ONLY JSON in this exact format:
{
  "lighting": "artificial",
  "color_temperature": "neutral",
  "time_in_game": "final_5_min",
  "ai_confidence": 0.85
}

NO explanations. NO markdown. ONLY JSON.`;

export interface SchemaV2DeltaResponse {
  lighting: string;
  color_temperature: string;
  time_in_game: string | null;
  ai_confidence: number;
}

// =============================================================================
// Sport Verification Prompt (Two-Tier Model - High Accuracy Pass)
// =============================================================================

/**
 * SPORT_VERIFICATION_PROMPT: High-accuracy sport detection for uncertain photos
 *
 * Use this with a more capable model (gemini-2.5-flash or claude-3-5-sonnet)
 * when the initial enrichment has low confidence or unexpected sport_type.
 *
 * Cost: ~$0.001-0.002 per photo (higher than lite, but worth it for accuracy)
 */
export const SPORT_VERIFICATION_PROMPT = `${PORTFOLIO_CONTEXT}

You are a SPORTS IDENTIFICATION EXPERT. Your ONLY task is to identify the sport in this photo with HIGH CONFIDENCE.

CRITICAL: This is a volleyball photography portfolio. 95%+ of photos are volleyball.
Your job is to VERIFY the sport, not assume it.

STEP 1: Identify ALL sport-specific equipment visible:
- Ball type (volleyball=white/yellow panels, basketball=orange with black lines, soccer=hexagons)
- Net/hoop/goal (volleyball net with antennae, basketball hoop, soccer goal)
- Court markings (volleyball attack line, basketball key/3-point line, soccer pitch, track lanes)
- Player equipment (volleyball kneepads, basketball high-tops, soccer cleats, running singlets, bib numbers)
- Track/field equipment (hurdles, pole vault mats, throwing circles, starting blocks)

STEP 2: Analyze player actions:
- Hands above head at a net → likely VOLLEYBALL (block/spike)
- Jumping toward a hoop → likely BASKETBALL
- Kicking motion → likely SOCCER/FOOTBALL
- Platform arm position → likely VOLLEYBALL (dig/pass)
- Running on track/lanes → likely TRACK
- Running on trail/grass with bib numbers → likely CROSS_COUNTRY

STEP 3: Consider context clues:
- Indoor gym with net → likely VOLLEYBALL
- Indoor gym with hoop → likely BASKETBALL
- Outdoor grass field with goals → likely SOCCER/FOOTBALL
- Oval track with lanes → likely TRACK
- Trail/park setting with bib numbers → likely CROSS_COUNTRY

Return ONLY JSON:
{
  "sport_type": "volleyball",
  "sport_confidence": 0.95,
  "evidence": ["volleyball net visible", "white paneled ball", "player blocking at net"],
  "alternative_sport": null,
  "alternative_confidence": 0
}

RULES:
- sport_confidence: 0.0-1.0 (how certain you are)
- evidence: 1-3 specific visual elements that support your classification
- alternative_sport: if you considered another sport, name it (or null)
- alternative_confidence: confidence in the alternative (0 if none)

If sport_confidence < 0.7, you MUST provide an alternative_sport.
When in doubt between volleyball and basketball, check for NET vs HOOP.

NO explanations. NO markdown. ONLY JSON.`;

export interface SportVerificationResponse {
  sport_type: string;
  sport_confidence: number;
  evidence: string[];
  alternative_sport: string | null;
  alternative_confidence: number;
}

// =============================================================================
// Re-enrichment Prompt (For correcting misclassified photos)
// =============================================================================

/**
 * Build a prompt for re-enriching photos with known sport type
 * Used when fixing misclassifications - forces the correct sport
 */
export function buildReenrichmentPrompt(knownSportType: string): string {
  return `${PORTFOLIO_CONTEXT}

IMPORTANT: This photo has been VERIFIED as ${knownSportType.toUpperCase()}.
Do NOT second-guess the sport type. Use "${knownSportType}" for sport_type.

${BUCKET1_PROMPT}

AND ALSO:

${BUCKET2_PROMPT}

Return ONLY JSON combining both buckets (use sport_type: "${knownSportType}"):
{
  "bucket1": {
    "sport_type": "${knownSportType}",
    "play_type": "block",
    "action_intensity": "peak",
    "photo_category": "action",
    "composition": "rule_of_thirds",
    "time_of_day": "evening",
    "lighting": "artificial",
    "color_temperature": "neutral",
    "jersey_number": 12
  },
  "bucket2": {
    "emotion": "triumph",
    "sharpness": 8.5,
    "composition_score": 7.5,
    "exposure_accuracy": 8.0,
    "emotional_impact": 9.0,
    "time_in_game": "final_5_min",
    "ai_confidence": 0.85
  }
}

NO explanations. NO markdown. ONLY JSON.`;
}

// =============================================================================
// Usage Examples
// =============================================================================

export const ENRICHMENT_EXAMPLES = {
  bucket1_only: {
    description: 'Extract only user-facing metadata (cheaper, faster)',
    prompt: BUCKET1_PROMPT,
    cost_estimate: '$0.003-0.006 per photo',
    use_case: 'Initial photo upload, user needs immediate search capability'
  },

  bucket2_only: {
    description: 'Extract only internal metadata (for story generation)',
    prompt: BUCKET2_PROMPT,
    cost_estimate: '$0.003-0.006 per photo',
    use_case: 'Batch story generation, updating story collections'
  },

  combined: {
    description: 'Extract both buckets in single API call (most efficient)',
    prompt: COMBINED_PROMPT,
    cost_estimate: '$0.006-0.015 per photo',
    use_case: 'Full enrichment pipeline, new photo uploads'
  },

  agentic: {
    description: 'Agentic vision with iterative investigation (highest accuracy)',
    prompt: 'AGENTIC_VISION_PROMPT',
    cost_estimate: '$0.001-0.003 per photo',
    use_case: 'Problem photos, jersey detection, low-confidence re-enrichment'
  }
};

// =============================================================================
// AGENTIC VISION PROMPT (Gemini 3 Flash / Advanced Models)
// =============================================================================

/**
 * AGENTIC_VISION_PROMPT: Leverages "Think, Act, Observe" loop for thorough analysis
 *
 * Key capabilities enabled by agentic vision:
 * - Zoom and inspect small details (jersey numbers, ball position)
 * - Annotate key elements for evidence-based reasoning
 * - Multi-step investigation for uncertain classifications
 *
 * Use with: gemini-3-flash (preferred) or gemini-2.5-flash
 * Cost: ~$0.001-0.003 per photo (higher due to iterative processing)
 * Time: 5-10 seconds per photo
 */
export const AGENTIC_VISION_PROMPT = `You are analyzing a sports photograph using AGENTIC VISION.

## Agentic Investigation Process

Use an iterative "Think, Act, Observe" approach:

1. **THINK**: Form hypotheses about sport type, action, and key details
2. **ACT**: Mentally zoom into areas with small details (jerseys, ball, court markings)
3. **OBSERVE**: Gather evidence from multiple visual cues before concluding

## Investigation Steps

### Step 1: Sport Detection (CRITICAL - Use Multiple Evidence Points)
Examine these elements systematically:
- **Net/Goal/Hoop**: What scoring equipment is visible?
- **Ball Type**: Shape, color, pattern (volleyball panels vs basketball lines vs soccer hexagons)
- **Court/Field**: Surface type, line markings, dimensions
- **Player Positioning**: Formation, hand positions, body mechanics
- **Equipment**: Kneepads, shoes, uniforms

VALID SPORT TYPES: "volleyball", "basketball", "soccer", "tennis", "track", "cross_country", "softball", "football", "other"

Sport-specific indicators:
- VOLLEYBALL: Net ~7-8ft with antennae, white/yellow/blue paneled ball, players at net with hands UP
- BASKETBALL: Hoop/backboard, orange ball with black lines, key/3-point markings
- SOCCER: Goal posts, black/white hexagon ball, grass pitch with penalty box
- TRACK: Oval track with lanes, hurdles, pole vault mats, throwing circles
- CROSS COUNTRY: Trail/grass course, bib numbers, pack of runners, wooded setting

### Step 2: Jersey/Bib Number Detection (ZOOM IN)
- If you see a player's back or chest, ZOOM IN mentally on the number area
- Look for partial numbers that could be inferred
- Note visibility conditions (distance, angle, obstruction)
- Report ALL visible numbers with confidence levels

### Step 3: Action Classification
For the detected sport, identify the specific action:
- VOLLEYBALL: spike, block, dig, set, serve, pass, celebration
- BASKETBALL: dunk, layup, jump_shot, rebound, block, pass, dribble
- TRACK: sprint, hurdle, relay, long_jump, high_jump, pole_vault, shot_put, discus, javelin
- CROSS_COUNTRY: running, start, finish, pack_running, hill_climb

### Step 4: Quality Assessment
Evaluate technical and artistic quality:
- Sharpness (is the subject in focus?)
- Composition (framing, balance, leading lines)
- Emotional impact (does it convey a story?)

## Response Format

Return ONLY valid JSON:
{
  "sport_type": "volleyball",
  "sport_confidence": 0.95,
  "sport_evidence": [
    "volleyball net with antenna visible at ~8ft height",
    "white paneled volleyball in frame",
    "player in blocking position with hands above net"
  ],
  "play_type": "block",
  "play_confidence": 0.90,
  "action_intensity": "peak",
  "photo_category": "action",
  "jersey_numbers": [
    {"number": 12, "confidence": 0.95, "location": "back of blocking player"},
    {"number": 7, "confidence": 0.70, "location": "partially visible on opponent"}
  ],
  "composition": "rule_of_thirds",
  "time_of_day": "evening",
  "lighting": "artificial",
  "color_temperature": "neutral",
  "emotion": "determination",
  "quality_assessment": {
    "sharpness": 8.5,
    "composition_score": 8.0,
    "emotional_impact": 7.5
  },
  "agentic_notes": "Zoomed in on jersey numbers. #12 clearly visible on blocker's back. Net antenna confirms volleyball. Ball trajectory suggests active block attempt."
}

## Critical Rules

1. **ALWAYS populate sport_evidence** with 2-3 specific visual elements
2. **ALWAYS check for jersey numbers** - zoom in if potentially visible
3. **Use valid sport_type values only** - no "running" or "athletics" (use "track" or "cross_country")
4. **Use underscores** in multi-word values (rule_of_thirds, long_jump, pack_running)
5. **agentic_notes** should describe your investigation process and key findings

NO explanations outside JSON. NO markdown. ONLY valid JSON.`;

// =============================================================================
// Agentic Vision Response Types
// =============================================================================

export interface JerseyDetection {
  number: number;
  confidence: number;
  location: string;
}

export interface AgenticQualityAssessment {
  sharpness: number;
  composition_score: number;
  emotional_impact: number;
}

export interface AgenticVisionResponse {
  sport_type: string;
  sport_confidence: number;
  sport_evidence: string[];
  play_type: string | null;
  play_confidence: number;
  action_intensity: string;
  photo_category: string;
  jersey_numbers: JerseyDetection[];
  composition: string;
  time_of_day: string;
  lighting: string;
  color_temperature: string;
  emotion: string;
  quality_assessment: AgenticQualityAssessment;
  agentic_notes: string;
}

// =============================================================================
// Agentic Vision Prompt Builder (With Context)
// =============================================================================

export interface AgenticEnrichmentContext {
  albumName?: string;
  albumSport?: string;
  previousSportType?: string;
  previousConfidence?: number;
  focusOnJerseys?: boolean;
}

/**
 * Build an agentic vision prompt with optional context
 *
 * Use this for:
 * - Low confidence photos (previousConfidence < 0.7)
 * - Photos where jersey detection is important
 * - Re-enrichment after sport verification
 */
export function buildAgenticPrompt(context?: AgenticEnrichmentContext): string {
  const parts: string[] = [];

  // Add portfolio context
  parts.push(PORTFOLIO_CONTEXT);

  // Add album context if provided
  if (context?.albumName) {
    parts.push(buildAlbumContext(context.albumName, context.albumSport));
  }

  // Add previous enrichment context if re-enriching
  if (context?.previousSportType && context?.previousConfidence !== undefined) {
    parts.push(`
PREVIOUS ENRICHMENT CONTEXT:
- Previous sport_type: "${context.previousSportType}"
- Previous confidence: ${(context.previousConfidence * 100).toFixed(0)}%
- Task: Verify or correct this classification with higher confidence
`);
  }

  // Add jersey focus instruction if needed
  if (context?.focusOnJerseys) {
    parts.push(`
PRIORITY: JERSEY NUMBER DETECTION
This photo has been flagged for jersey number detection. Pay special attention to:
- Player backs where numbers are typically displayed
- Partially visible numbers that can be inferred
- Multiple players' numbers if visible
- Bib numbers for track/cross country events
`);
  }

  // Add main agentic prompt
  parts.push(AGENTIC_VISION_PROMPT);

  return parts.join('\n\n');
}

// =============================================================================
// Utility: Convert Agentic Response to Standard Buckets
// =============================================================================

/**
 * Convert an AgenticVisionResponse to the standard CombinedResponse format
 * Use this to maintain compatibility with existing enrichment pipeline
 */
export function agenticToBuckets(agentic: AgenticVisionResponse): CombinedResponse {
  // Pick the highest-confidence jersey number (or null)
  const primaryJersey = agentic.jersey_numbers
    ?.filter(j => j.confidence >= 0.7)
    .sort((a, b) => b.confidence - a.confidence)[0]?.number ?? null;

  return {
    bucket1: {
      sport_type: agentic.sport_type,
      play_type: agentic.play_type ?? 'null',
      action_intensity: agentic.action_intensity,
      photo_category: agentic.photo_category,
      composition: agentic.composition,
      time_of_day: agentic.time_of_day,
      lighting: agentic.lighting,
      color_temperature: agentic.color_temperature,
      jersey_number: primaryJersey,
    },
    bucket2: {
      emotion: agentic.emotion,
      sharpness: agentic.quality_assessment.sharpness,
      composition_score: agentic.quality_assessment.composition_score,
      exposure_accuracy: 7.0, // Not assessed in agentic, use neutral default
      emotional_impact: agentic.quality_assessment.emotional_impact,
      time_in_game: 'unknown', // Not assessed in agentic
      ai_confidence: agentic.sport_confidence,
    },
    // The agentic prompt has no dedicated caption; its investigation notes are the
    // closest natural-language description, so reuse them for search.
    caption: agentic.agentic_notes ?? '',
    // Map detected jersey numbers to the player-extract shape (team_color/action
    // are not assessed by the standard agentic prompt).
    players: (agentic.jersey_numbers ?? []).map((j) => ({
      jersey_number: j.number,
      team_color: null,
      action: null,
    })),
  };
}

// =============================================================================
// ENHANCED AGENTIC VISION PROMPT (Deep Metadata Extraction)
// =============================================================================

/**
 * ENHANCED_AGENTIC_PROMPT: Extracts comprehensive metadata using deep visual analysis
 *
 * Additional fields beyond standard agentic:
 * - Multi-player tracking with team identification
 * - Game context (scores, crowd, venue)
 * - Spatial analysis (ball position, formations)
 * - Team colors and identification
 *
 * Use with: gemini-3-flash (preferred) or gemini-2.5-flash
 * Cost: ~$0.002-0.005 per photo (more comprehensive analysis)
 * Time: 8-15 seconds per photo
 */
export const ENHANCED_AGENTIC_PROMPT = `You are performing DEEP VISUAL ANALYSIS on a sports photograph.

## Analysis Protocol

Use systematic investigation with multiple passes:
1. **SCAN**: Quick overview of entire frame
2. **ZOOM**: Inspect specific regions (jerseys, scoreboard, ball, crowd)
3. **ANALYZE**: Extract structured data from observations
4. **VERIFY**: Cross-reference findings for consistency

## Required Analysis Passes

### Pass 1: Sport & Action (Same as standard)
Identify sport type, play type, action intensity using equipment, court, and player cues.

VALID SPORT TYPES: "volleyball", "basketball", "soccer", "tennis", "track", "cross_country", "softball", "football", "other"

### Pass 2: Multi-Player Analysis (NEW)
For EACH visible player, extract:
- Jersey/bib number (zoom in on back/chest)
- Team assignment (home vs away based on uniform color)
- Current action (blocking, approaching, watching, celebrating)
- Position in frame (left, center, right, foreground, background)

### Pass 3: Team Identification (NEW)
- Identify uniform colors for each team
- Look for school/team names on jerseys, banners, or court
- Determine which team is "home" vs "away" based on bench position or uniform style

### Pass 4: Game Context (NEW)
- Is a scoreboard visible? Extract score if readable
- Estimate crowd density (empty, sparse, moderate, packed)
- Identify venue type (indoor gym, outdoor grass, beach, stadium)
- Look for event banners or tournament names

### Pass 5: Spatial Analysis (NEW)
- Is the ball visible? Where is it? (above net, in hands, in flight, out of frame)
- Count total players visible
- Is the net/goal/hoop visible?
- Describe the key moment captured

### Pass 6: Quality Assessment
- Sharpness (0-10)
- Composition score (0-10)
- Emotional impact (0-10)
- Is this portfolio-worthy? (requires sharpness >= 8.5, composition >= 8, emotional_impact >= 8)

## Response Format

Return ONLY valid JSON:
{
  "sport_type": "volleyball",
  "sport_confidence": 0.95,
  "sport_evidence": ["net with antenna", "volleyball visible", "blocking stance"],

  "play_type": "block",
  "play_confidence": 0.90,
  "action_intensity": "peak",
  "photo_category": "action",

  "players": [
    {
      "jersey_number": 14,
      "jersey_confidence": 0.95,
      "team": "home",
      "position_in_frame": "center",
      "current_action": "blocking",
      "is_primary_subject": true
    },
    {
      "jersey_number": 7,
      "jersey_confidence": 0.80,
      "team": "away",
      "position_in_frame": "right",
      "current_action": "approaching",
      "is_primary_subject": false
    }
  ],

  "teams": {
    "home_colors": ["navy", "white"],
    "away_colors": ["red", "black"],
    "home_name": null,
    "away_name": null,
    "colors_confidence": 0.85
  },

  "game_context": {
    "scoreboard_visible": false,
    "score_home": null,
    "score_away": null,
    "set_number": null,
    "crowd_density": "moderate",
    "venue_type": "indoor_gym",
    "event_name": null
  },

  "spatial": {
    "ball_visible": true,
    "ball_position": "above_net",
    "player_count": 6,
    "net_visible": true,
    "key_moment": "Block attempt at peak of jump"
  },

  "composition": "rule_of_thirds",
  "time_of_day": "evening",
  "lighting": "artificial",
  "color_temperature": "neutral",
  "emotion": "determination",

  "quality_assessment": {
    "sharpness": 8.5,
    "composition_score": 8.0,
    "emotional_impact": 9.0,
    "portfolio_worthy": true
  },

  "agentic_notes": "Zoomed on jerseys: #14 clearly visible on blocker, #7 partial on attacker. Ball caught at apex above net. Home team in navy, away in red. Crowd moderately filled in background bleachers."
}

## Critical Rules

1. **players array**: Include ALL visible players with jersey numbers (max 10)
2. **team assignment**: Use uniform colors to determine home vs away
3. **ball_position options**: "in_hands", "above_net", "in_flight", "on_ground", "out_of_frame"
4. **venue_type options**: "indoor_gym", "outdoor_grass", "beach", "stadium", "outdoor_court"
5. **crowd_density options**: "empty", "sparse", "moderate", "packed"
6. **portfolio_worthy**: Only true if ALL three scores >= 8
7. **Use underscores** in multi-word values
8. **null for unknown**: Use null, not "unknown" string, for undetectable fields

NO explanations outside JSON. NO markdown. ONLY valid JSON.`;

// =============================================================================
// Enhanced Agentic Vision Response Types
// =============================================================================

export interface PlayerDetection {
  jersey_number: number | null;
  jersey_confidence: number;
  team: 'home' | 'away' | 'unknown';
  position_in_frame: 'left' | 'center' | 'right' | 'foreground' | 'background';
  current_action: string;
  is_primary_subject: boolean;
}

export interface TeamIdentification {
  home_colors: string[];
  away_colors: string[];
  home_name: string | null;
  away_name: string | null;
  colors_confidence: number;
}

export interface GameContext {
  scoreboard_visible: boolean;
  score_home: number | null;
  score_away: number | null;
  set_number: number | null;
  crowd_density: 'empty' | 'sparse' | 'moderate' | 'packed';
  venue_type: 'indoor_gym' | 'outdoor_grass' | 'beach' | 'stadium' | 'outdoor_court';
  event_name: string | null;
}

export interface SpatialAnalysis {
  ball_visible: boolean;
  ball_position: 'in_hands' | 'above_net' | 'in_flight' | 'on_ground' | 'out_of_frame' | null;
  player_count: number;
  net_visible: boolean;
  key_moment: string;
}

export interface EnhancedQualityAssessment {
  sharpness: number;
  composition_score: number;
  emotional_impact: number;
  portfolio_worthy: boolean;
}

export interface EnhancedAgenticResponse {
  // Core classification
  sport_type: string;
  sport_confidence: number;
  sport_evidence: string[];
  play_type: string | null;
  play_confidence: number;
  action_intensity: string;
  photo_category: string;

  // Enhanced: Multi-player tracking
  players: PlayerDetection[];

  // Enhanced: Team identification
  teams: TeamIdentification;

  // Enhanced: Game context
  game_context: GameContext;

  // Enhanced: Spatial analysis
  spatial: SpatialAnalysis;

  // Standard metadata
  composition: string;
  time_of_day: string;
  lighting: string;
  color_temperature: string;
  emotion: string;

  // Quality assessment
  quality_assessment: EnhancedQualityAssessment;

  // Investigation notes
  agentic_notes: string;
}

// =============================================================================
// Enhanced Agentic Prompt Builder
// =============================================================================

export interface EnhancedAgenticContext {
  albumName?: string;
  albumSport?: string;
  focusAreas?: ('players' | 'teams' | 'score' | 'crowd' | 'ball')[];
}

/**
 * Build an enhanced agentic prompt with optional focus areas
 */
export function buildEnhancedAgenticPrompt(context?: EnhancedAgenticContext): string {
  const parts: string[] = [];

  // Add portfolio context
  parts.push(PORTFOLIO_CONTEXT);

  // Add album context if provided
  if (context?.albumName) {
    parts.push(buildAlbumContext(context.albumName, context.albumSport));
  }

  // Add focus instructions if specific areas requested
  if (context?.focusAreas && context.focusAreas.length > 0) {
    const focusInstructions = context.focusAreas.map(area => {
      switch (area) {
        case 'players': return '- PRIORITY: Detect ALL player jersey numbers with high accuracy';
        case 'teams': return '- PRIORITY: Identify team colors and names from uniforms/banners';
        case 'score': return '- PRIORITY: Look for and extract scoreboard information';
        case 'crowd': return '- PRIORITY: Assess crowd density and atmosphere';
        case 'ball': return '- PRIORITY: Locate ball position and trajectory';
        default: return '';
      }
    }).filter(Boolean);

    if (focusInstructions.length > 0) {
      parts.push(`
FOCUS AREAS FOR THIS ANALYSIS:
${focusInstructions.join('\n')}
`);
    }
  }

  // Add main enhanced prompt
  parts.push(ENHANCED_AGENTIC_PROMPT);

  return parts.join('\n\n');
}
