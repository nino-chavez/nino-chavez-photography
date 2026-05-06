-- Migration: Enable RLS on lp_* tables
-- These tables belong to a separate project sharing this Supabase instance.
-- Enabling RLS with permissive policies to maintain current access behavior.

-- ============================================================================
-- Enable RLS on all 5 lp_* tables
-- ============================================================================

ALTER TABLE public.lp_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lp_hot_takes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lp_hot_take_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lp_prediction_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lp_quiz_tallies ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Add permissive policies (maintain current public access behavior)
-- ============================================================================

-- lp_votes
CREATE POLICY "Allow public select" ON public.lp_votes FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.lp_votes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.lp_votes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete" ON public.lp_votes FOR DELETE USING (true);

-- lp_hot_takes
CREATE POLICY "Allow public select" ON public.lp_hot_takes FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.lp_hot_takes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.lp_hot_takes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete" ON public.lp_hot_takes FOR DELETE USING (true);

-- lp_hot_take_reactions
CREATE POLICY "Allow public select" ON public.lp_hot_take_reactions FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.lp_hot_take_reactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.lp_hot_take_reactions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete" ON public.lp_hot_take_reactions FOR DELETE USING (true);

-- lp_prediction_picks
CREATE POLICY "Allow public select" ON public.lp_prediction_picks FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.lp_prediction_picks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.lp_prediction_picks FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete" ON public.lp_prediction_picks FOR DELETE USING (true);

-- lp_quiz_tallies
CREATE POLICY "Allow public select" ON public.lp_quiz_tallies FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.lp_quiz_tallies FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.lp_quiz_tallies FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete" ON public.lp_quiz_tallies FOR DELETE USING (true);
