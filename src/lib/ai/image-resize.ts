/**
 * Shared resize policy for the image-embedding write path AND deterministic sharpness — one
 * function so both consumers normalize on the exact same pixel grid.
 *
 * NODE-ONLY: imports `sharp`, a native binding. Only `scripts/ingest-album.ts` and
 * `scripts/backfill-image-embeddings.ts` import this file. Do NOT import it from `embeddings.ts`
 * or from anything reachable from `src/routes` — those are part of the SvelteKit build that
 * adapter-cloudflare bundles for the Workers runtime, which cannot run a native binary. Keeping
 * the resize step in the caller (this file, invoked only by node CLI scripts) rather than inside
 * `embedImage` itself is a deliberate seam, not an oversight — see `embedImage`'s doc comment in
 * embeddings.ts.
 */
import sharp from 'sharp';

/** Long-edge resize target, before JPEG re-encode. 768px is enough for whole-image semantic
 * similarity (unlike vision extraction, which needs full jersey-digit resolution) and keeps
 * embedding calls in the fraction-of-a-cent range — the eval harness's resize policy, reused
 * verbatim (scripts/eval/lib/embed.ts in .claude/worktrees/agent-a9ac18f4737ef6552). */
export const EMBED_LONG_EDGE = 768;

/** Resize to `EMBED_LONG_EDGE` (long edge, preserving aspect, never upscaling) and re-encode as
 * JPEG — the exact buffer `embedImage` expects. */
export async function resizeForEmbedding(imageBuffer: Buffer): Promise<Buffer> {
	return sharp(imageBuffer)
		.resize({ width: EMBED_LONG_EDGE, height: EMBED_LONG_EDGE, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 85 })
		.toBuffer();
}
