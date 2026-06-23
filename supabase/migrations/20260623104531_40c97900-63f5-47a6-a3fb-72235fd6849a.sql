
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS questions_published_idx ON public.questions (published);

DROP VIEW IF EXISTS public.questions_public;
CREATE VIEW public.questions_public
  WITH (security_invoker = true)
  AS
  SELECT id, question_text, question_type, options, created_at
  FROM public.questions
  WHERE published = true;

GRANT SELECT ON public.questions_public TO anon, authenticated;
