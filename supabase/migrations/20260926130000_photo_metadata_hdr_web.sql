-- Add the flag that tells the app a web-sized HDR (gain-map) copy of this photo exists in R2.
-- =========================================================================
-- ADDITIVE ONLY. Ingest (scripts/ingest-album.ts) sets this to TRUE only after it has built the
-- resized gain-map JPEG (src/lib/ai/hdr-resize.ts) AND uploaded it to the `photo-gallery-hdr` R2
-- bucket at the deterministic key `hdr/${photo_id}.jpg`. No key column is needed — the key is
-- always derivable from photo_id, so there is nothing to keep in sync or let drift.
--
-- Every existing row (~20,000 photos as of 2026-09-26) defaults to FALSE: none of them have an
-- R2 object at that key yet (this feature ships with new/reprocessed ingests only; there is no
-- backfill script for existing albums in this change). FALSE means "serve the Cloudflare Images
-- variant" — the existing, unconditional behavior — so this migration changes nothing about what
-- any current photo page renders.
--
-- See src/routes/api/hdr/[id]/+server.ts (streams the R2 object) and the `hdrPhotoUrl` /
-- `optimizedImageUrl` derivations in src/routes/photo/[id]/+page.svelte and
-- src/lib/components/gallery/PhotoDetailModal.svelte for the read side.

ALTER TABLE public.photo_metadata
  ADD COLUMN IF NOT EXISTS hdr_web_available boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.photo_metadata.hdr_web_available IS
  'TRUE when a web-sized Ultra HDR (gain-map) JPEG for this photo exists in the photo-gallery-hdr '
  'R2 bucket at key hdr/${photo_id}.jpg. Set by scripts/ingest-album.ts only when the source file '
  'has a gain map AND the resize-preserving-gain-map pipeline (src/lib/ai/hdr-resize.ts) succeeded. '
  'FALSE (the default) means fall back to the Cloudflare Images variant, same as before this column '
  'existed.';
