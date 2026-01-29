-- Migration: Move Vector Extension to Extensions Schema (OPTIONAL)
-- Date: 2025-01-29
--
-- WARNING: This migration modifies the vector extension location.
-- It may cause temporary downtime for vector operations.
-- Run during maintenance window.
--
-- This is OPTIONAL - the vector extension in public schema is functional,
-- just not following best practices for schema organization.

-- ============================================================================
-- STEP 1: Check current state
-- ============================================================================
-- Run this first to see current extension location:
-- SELECT extname, extnamespace::regnamespace FROM pg_extension WHERE extname = 'vector';

-- ============================================================================
-- STEP 2: Create extensions schema if not exists
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS extensions;

-- Grant usage to roles that need vector operations
GRANT USAGE ON SCHEMA extensions TO anon;
GRANT USAGE ON SCHEMA extensions TO authenticated;
GRANT USAGE ON SCHEMA extensions TO service_role;

-- ============================================================================
-- STEP 3: Move the extension
-- ============================================================================
-- Note: This requires dropping and recreating the extension
-- All dependent objects (columns, functions) will need to be recreated

-- First, save the embedding data (if you have it)
-- CREATE TABLE public.photo_embeddings_backup AS
-- SELECT photo_id, embedding FROM public.photo_metadata WHERE embedding IS NOT NULL;

-- Drop the column that uses the vector type
-- ALTER TABLE public.photo_metadata DROP COLUMN IF EXISTS embedding;

-- Drop the extension from public
-- DROP EXTENSION IF EXISTS vector;

-- Recreate in extensions schema
-- CREATE EXTENSION vector WITH SCHEMA extensions;

-- Add the column back
-- ALTER TABLE public.photo_metadata ADD COLUMN embedding extensions.vector(768);

-- Restore the data
-- UPDATE public.photo_metadata pm
-- SET embedding = b.embedding::extensions.vector
-- FROM public.photo_embeddings_backup b
-- WHERE pm.photo_id = b.photo_id;

-- Drop backup
-- DROP TABLE public.photo_embeddings_backup;

-- ============================================================================
-- ALTERNATIVE: Keep vector in public, just acknowledge the warning
-- ============================================================================
-- For a simple photo gallery, keeping vector in public is acceptable.
-- The security risk is minimal for read-only public data.
--
-- To suppress the warning, you can add a comment:
COMMENT ON EXTENSION vector IS 'pgvector extension - kept in public schema for simplicity';

-- ============================================================================
-- NOTE: If you DO move the extension, update all functions that reference
-- the vector type to use extensions.vector instead of vector.
-- ============================================================================
