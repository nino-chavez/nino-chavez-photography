/**
 * Brand voices for IG caption synthesis.
 *
 * NOT invented here. Grounded in the existing brand sources, per Nino's rule
 * ("don't guess — use the codified brand process"):
 *   - letspepper: faithful condensation of the brand-forge voice in
 *     letspepper/DESIGN.md (generated from brand-kit.json schema v1).
 *   - flickday:   synthesized from the photography brand tagline "MOTION. EMOTION.
 *     Frame by Frame." + forge-brand/references/photography-assessment.md + Nino's
 *     documented anti-cheese red lines (poe corpus). Should be formalized into a
 *     forge brand-kit when the photography/Flickday kit is built.
 *
 * Each `prompt` is appended to the caption synthesizer's system prompt.
 */

export interface BrandVoice {
	label: string;
	prompt: string;
}

export const VOICES: Record<string, BrandVoice> = {
	letspepper: {
		label: "Let's Pepper",
		prompt: [
			"BRAND VOICE — Let's Pepper (grass-triples tournament series).",
			"Write like a player, not a marketing department. Playful but never corny. Competitive. Community-first — celebrate the players, never the organizers. Direct: short, punchy, no corporate filler.",
			"Use pepper/heat metaphors naturally and sparingly (mild / medium / hot, bring the heat) — don't force them.",
			"Cadence to match: \"3v3. Grass. Let's go.\" · \"Bring your friends. Leave your egos.\" · \"12 teams showed up. Nobody went home disappointed.\"",
			"BANNED (corporate-sports filler): \"exciting opportunity\", \"amazing community\", \"thrilled to announce\", \"unforgettable experience\", \"register today\", \"pushed their limits\", \"left it all on the court\", \"testament to\", \"electric energy\", \"hard-fought\".",
			"Never explain the format — the audience already knows volleyball."
		].join('\n')
	},
	flickday: {
		label: 'Flickday Media',
		prompt: [
			"BRAND VOICE — Flickday Media (action-sports photography; tagline \"MOTION. EMOTION. Frame by Frame.\").",
			"The photo leads; the words frame it. Cinematic and kinetic but understated — confident, never hype.",
			"Name the specific moment, not a generic feeling: the read, the dig, the platform, the celebration, the light — not \"energy\" or \"intensity\" in the abstract.",
			"Short. One sharp line beats three soft ones.",
			"Cadence to match: \"Match point. Her eyes never left the ball.\" · \"Last point of the night — first to the floor.\" · \"Set, swing, silence.\"",
			"BANNED (cheerleading / clichés): \"absolutely electric\", \"testament to the game\", \"pushed their limits\", \"captured the magic\", \"frozen in time\", \"worth a thousand words\", \"the thrill of competition\". No emoji spam (one tasteful emoji max, or none)."
		].join('\n')
	}
};
