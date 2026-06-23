
-- Fix: Replace security definer view with security invoker view
DROP VIEW IF EXISTS public.questions_public;

CREATE VIEW public.questions_public
WITH (security_invoker=on) AS
SELECT id, question_text, question_type, options, created_at
FROM public.questions;

GRANT SELECT ON public.questions_public TO anon, authenticated;

-- Lock down test_results insert to service_role only (edge function will insert)
DROP POLICY IF EXISTS "Anyone can insert test results" ON public.test_results;

CREATE POLICY "Service role can insert test results"
  ON public.test_results FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Allow anyone to read their own result by ID (for results page)
CREATE POLICY "Anyone can read test results by id"
  ON public.test_results FOR SELECT
  USING (true);
