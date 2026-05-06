-- Migration: Tighten lp_* RLS policies
-- The letspepper app uses service_role key (server-side API routes),
-- so direct table writes can be restricted to service_role only.
-- This resolves rls_policy_always_true warnings.

-- ============================================================================
-- lp_votes: drop permissive, restrict writes to service_role
-- ============================================================================
DROP POLICY IF EXISTS "Allow public insert" ON public.lp_votes;
DROP POLICY IF EXISTS "Allow public update" ON public.lp_votes;
DROP POLICY IF EXISTS "Allow public delete" ON public.lp_votes;

CREATE POLICY "Service role can insert" ON public.lp_votes FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can update" ON public.lp_votes FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can delete" ON public.lp_votes FOR DELETE TO service_role USING (true);

-- ============================================================================
-- lp_hot_takes: drop permissive, restrict writes to service_role
-- ============================================================================
DROP POLICY IF EXISTS "Allow public insert" ON public.lp_hot_takes;
DROP POLICY IF EXISTS "Allow public update" ON public.lp_hot_takes;
DROP POLICY IF EXISTS "Allow public delete" ON public.lp_hot_takes;

CREATE POLICY "Service role can insert" ON public.lp_hot_takes FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can update" ON public.lp_hot_takes FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can delete" ON public.lp_hot_takes FOR DELETE TO service_role USING (true);

-- ============================================================================
-- lp_hot_take_reactions: drop permissive, restrict writes to service_role
-- ============================================================================
DROP POLICY IF EXISTS "Allow public insert" ON public.lp_hot_take_reactions;
DROP POLICY IF EXISTS "Allow public update" ON public.lp_hot_take_reactions;
DROP POLICY IF EXISTS "Allow public delete" ON public.lp_hot_take_reactions;

CREATE POLICY "Service role can insert" ON public.lp_hot_take_reactions FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can update" ON public.lp_hot_take_reactions FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can delete" ON public.lp_hot_take_reactions FOR DELETE TO service_role USING (true);

-- ============================================================================
-- lp_prediction_picks: drop permissive, restrict writes to service_role
-- ============================================================================
DROP POLICY IF EXISTS "Allow public insert" ON public.lp_prediction_picks;
DROP POLICY IF EXISTS "Allow public update" ON public.lp_prediction_picks;
DROP POLICY IF EXISTS "Allow public delete" ON public.lp_prediction_picks;

CREATE POLICY "Service role can insert" ON public.lp_prediction_picks FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can update" ON public.lp_prediction_picks FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can delete" ON public.lp_prediction_picks FOR DELETE TO service_role USING (true);

-- ============================================================================
-- lp_quiz_tallies: drop permissive, restrict writes to service_role
-- ============================================================================
DROP POLICY IF EXISTS "Allow public insert" ON public.lp_quiz_tallies;
DROP POLICY IF EXISTS "Allow public update" ON public.lp_quiz_tallies;
DROP POLICY IF EXISTS "Allow public delete" ON public.lp_quiz_tallies;

CREATE POLICY "Service role can insert" ON public.lp_quiz_tallies FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can update" ON public.lp_quiz_tallies FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can delete" ON public.lp_quiz_tallies FOR DELETE TO service_role USING (true);
