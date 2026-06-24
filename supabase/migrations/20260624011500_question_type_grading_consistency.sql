-- Align question type storage, public views, and result reporting with the
-- full supported question-type set.

ALTER TABLE public.questions
  ALTER COLUMN correct_answer DROP NOT NULL;

ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_question_type_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_question_type_check
  CHECK (question_type IN ('mcq','true_false','short_answer','open','single_choice','multi_choice'));

ALTER TABLE public.test_results
  ADD COLUMN IF NOT EXISTS passed boolean;

UPDATE public.test_results
SET passed = percentage >= COALESCE((SELECT pass_mark FROM public.app_settings WHERE id = 1), 65)
WHERE passed IS NULL;

DROP VIEW IF EXISTS public.questions_public;
CREATE VIEW public.questions_public
  WITH (security_invoker = true)
  AS
  SELECT id, question_text, question_type, options, created_at
  FROM public.questions
  WHERE published = true
    AND approval_status = 'approved'
    AND deleted_at IS NULL;

REVOKE SELECT ON public.questions_public FROM anon, authenticated;
GRANT SELECT ON public.questions_public TO service_role;
