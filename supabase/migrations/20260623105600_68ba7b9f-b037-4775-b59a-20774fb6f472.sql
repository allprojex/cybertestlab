
-- 1. Extend questions
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS difficulty text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS correct_answers text[],
  ADD COLUMN IF NOT EXISTS category_id uuid;

ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_difficulty_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_difficulty_check CHECK (difficulty IN ('easy','medium','hard'));

ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_approval_status_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_approval_status_check CHECK (approval_status IN ('draft','pending','approved','rejected'));

ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_question_type_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_question_type_check
  CHECK (question_type IN ('mcq','true_false','short_answer','open','single_choice','multi_choice'));

-- 2. Categories
CREATE TABLE IF NOT EXISTS public.question_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_categories TO authenticated;
GRANT ALL ON public.question_categories TO service_role;
ALTER TABLE public.question_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage categories" ON public.question_categories;
CREATE POLICY "admins manage categories" ON public.question_categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_category_id_fkey,
  ADD CONSTRAINT questions_category_id_fkey FOREIGN KEY (category_id)
    REFERENCES public.question_categories(id) ON DELETE SET NULL;

-- 3. Organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage organizations" ON public.organizations;
CREATE POLICY "admins manage organizations" ON public.organizations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

-- 4. Departments
CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage departments" ON public.departments;
CREATE POLICY "admins manage departments" ON public.departments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

-- 5. Assignments
CREATE TABLE IF NOT EXISTS public.question_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('organization','department','user')),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  applicant_id uuid REFERENCES public.applicants(id) ON DELETE CASCADE,
  assigned_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_question_assignments_question ON public.question_assignments(question_id);
CREATE INDEX IF NOT EXISTS idx_question_assignments_org ON public.question_assignments(organization_id);
CREATE INDEX IF NOT EXISTS idx_question_assignments_dept ON public.question_assignments(department_id);
CREATE INDEX IF NOT EXISTS idx_question_assignments_applicant ON public.question_assignments(applicant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_assignments TO authenticated;
GRANT ALL ON public.question_assignments TO service_role;
ALTER TABLE public.question_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage assignments" ON public.question_assignments;
CREATE POLICY "admins manage assignments" ON public.question_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

-- 6. updated_at triggers
DROP TRIGGER IF EXISTS trg_categories_updated ON public.question_categories;
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON public.question_categories FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_organizations_updated ON public.organizations;
CREATE TRIGGER trg_organizations_updated BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_departments_updated ON public.departments;
CREATE TRIGGER trg_departments_updated BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 7. Public view restricted to approved + published
DROP VIEW IF EXISTS public.questions_public;
CREATE VIEW public.questions_public AS
  SELECT id, question_text, question_type, options, created_at
  FROM public.questions
  WHERE published = true AND approval_status = 'approved';
GRANT SELECT ON public.questions_public TO anon, authenticated;

-- 8. Backfill existing rows so already-published questions remain visible
UPDATE public.questions SET approval_status = 'approved', approved_at = now()
  WHERE approval_status = 'draft';
