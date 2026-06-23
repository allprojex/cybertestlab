
-- 1. Create role enum and user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 2. Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 3. Create questions_public view (hides correct_answer)
CREATE VIEW public.questions_public AS
SELECT id, question_text, question_type, options, created_at
FROM public.questions;

GRANT SELECT ON public.questions_public TO anon, authenticated;

-- 4. Drop all permissive question policies
DROP POLICY IF EXISTS "Questions are publicly readable" ON public.questions;
DROP POLICY IF EXISTS "Anyone can insert questions" ON public.questions;
DROP POLICY IF EXISTS "Anyone can update questions" ON public.questions;
DROP POLICY IF EXISTS "Anyone can delete questions" ON public.questions;

-- 5. New question policies: public read, admin-only write
CREATE POLICY "Public can read questions"
  ON public.questions FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert questions"
  ON public.questions FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update questions"
  ON public.questions FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete questions"
  ON public.questions FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 6. Fix test_results policies
DROP POLICY IF EXISTS "Test results are publicly readable" ON public.test_results;
DROP POLICY IF EXISTS "Anyone can insert test results" ON public.test_results;

CREATE POLICY "Anyone can insert test results"
  ON public.test_results FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view test results"
  ON public.test_results FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 7. Add validation constraints
ALTER TABLE public.test_results
  ADD CONSTRAINT valid_score CHECK (score >= 0 AND score <= total_questions),
  ADD CONSTRAINT valid_percentage CHECK (percentage >= 0 AND percentage <= 100),
  ADD CONSTRAINT valid_total CHECK (total_questions > 0);

-- 8. RLS on user_roles - only admins can read
CREATE POLICY "Admins can view roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
