
CREATE TABLE IF NOT EXISTS public.question_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_sets TO authenticated;
GRANT ALL ON public.question_sets TO service_role;
ALTER TABLE public.question_sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage question_sets" ON public.question_sets;
CREATE POLICY "admins manage question_sets" ON public.question_sets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.question_set_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id uuid NOT NULL REFERENCES public.question_sets(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (set_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_qset_items_set ON public.question_set_items(set_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_set_items TO authenticated;
GRANT ALL ON public.question_set_items TO service_role;
ALTER TABLE public.question_set_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage question_set_items" ON public.question_set_items;
CREATE POLICY "admins manage question_set_items" ON public.question_set_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.question_set_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id uuid NOT NULL REFERENCES public.question_sets(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('organization','department','user')),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  applicant_id uuid REFERENCES public.applicants(id) ON DELETE CASCADE,
  assigned_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qsa_set ON public.question_set_assignments(set_id);
CREATE INDEX IF NOT EXISTS idx_qsa_org ON public.question_set_assignments(organization_id);
CREATE INDEX IF NOT EXISTS idx_qsa_dept ON public.question_set_assignments(department_id);
CREATE INDEX IF NOT EXISTS idx_qsa_applicant ON public.question_set_assignments(applicant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_set_assignments TO authenticated;
GRANT ALL ON public.question_set_assignments TO service_role;
ALTER TABLE public.question_set_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage qset_assignments" ON public.question_set_assignments;
CREATE POLICY "admins manage qset_assignments" ON public.question_set_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

DROP TRIGGER IF EXISTS trg_qsets_updated ON public.question_sets;
CREATE TRIGGER trg_qsets_updated BEFORE UPDATE ON public.question_sets FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
