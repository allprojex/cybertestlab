
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) * 10 AS rn
  FROM public.questions
)
UPDATE public.questions q
  SET sort_order = ordered.rn
FROM ordered
WHERE ordered.id = q.id AND q.sort_order = 0;

CREATE INDEX IF NOT EXISTS questions_sort_order_idx ON public.questions (sort_order);
