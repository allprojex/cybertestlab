
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon, service_role;

DO $$ BEGIN CREATE TYPE public.applicant_status AS ENUM ('pending','approved','rejected','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.proctor_verdict AS ENUM ('unreviewed','match','no_match');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TABLE IF NOT EXISTS public.applicants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE,
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text,
  status public.applicant_status NOT NULL DEFAULT 'pending',
  attempts_used int NOT NULL DEFAULT 0,
  link_expires_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.applicants TO authenticated;
GRANT ALL ON public.applicants TO service_role;
ALTER TABLE public.applicants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "applicants read" ON public.applicants;
CREATE POLICY "applicants read" ON public.applicants FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'::public.app_role));
DROP POLICY IF EXISTS "applicants admin update" ON public.applicants;
CREATE POLICY "applicants admin update" ON public.applicants FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
DROP POLICY IF EXISTS "applicants insert" ON public.applicants;
CREATE POLICY "applicants insert" ON public.applicants FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR auth_user_id = auth.uid());
DROP TRIGGER IF EXISTS applicants_updated ON public.applicants;
CREATE TRIGGER applicants_updated BEFORE UPDATE ON public.applicants
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.login_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid REFERENCES public.applicants(id) ON DELETE CASCADE,
  email text,
  event text NOT NULL,
  ip text,
  country text,
  city text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.login_activity TO authenticated;
GRANT ALL ON public.login_activity TO service_role;
ALTER TABLE public.login_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "login admin read" ON public.login_activity;
CREATE POLICY "login admin read" ON public.login_activity FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.test_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  attempt_number int NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  score int,
  total int,
  percentage numeric,
  passed boolean,
  question_order uuid[],
  ip text,
  country text,
  city text
);
GRANT SELECT ON public.test_attempts TO authenticated;
GRANT ALL ON public.test_attempts TO service_role;
ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attempts read" ON public.test_attempts;
CREATE POLICY "attempts read" ON public.test_attempts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR EXISTS (
    SELECT 1 FROM public.applicants a WHERE a.id = applicant_id AND a.auth_user_id = auth.uid()
  ));

CREATE TABLE IF NOT EXISTS public.proctoring_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  attempt_id uuid REFERENCES public.test_attempts(id) ON DELETE SET NULL,
  snapshot_path text NOT NULL,
  face_match_score numeric,
  auto_verdict text NOT NULL DEFAULT 'pass',
  admin_verdict public.proctor_verdict NOT NULL DEFAULT 'unreviewed',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.proctoring_snapshots TO authenticated;
GRANT ALL ON public.proctoring_snapshots TO service_role;
ALTER TABLE public.proctoring_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "proctor read" ON public.proctoring_snapshots;
CREATE POLICY "proctor read" ON public.proctoring_snapshots FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR EXISTS (
    SELECT 1 FROM public.applicants a WHERE a.id = applicant_id AND a.auth_user_id = auth.uid()
  ));
DROP POLICY IF EXISTS "proctor self insert" ON public.proctoring_snapshots;
CREATE POLICY "proctor self insert" ON public.proctoring_snapshots FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.applicants a WHERE a.id = applicant_id AND a.auth_user_id = auth.uid()
  ));
DROP POLICY IF EXISTS "proctor admin update" ON public.proctoring_snapshots;
CREATE POLICY "proctor admin update" ON public.proctoring_snapshots FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.app_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pass_mark int NOT NULL DEFAULT 65,
  max_attempts int NOT NULL DEFAULT 3,
  cooldown_hours int NOT NULL DEFAULT 24,
  proctoring_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
GRANT SELECT ON public.app_settings TO authenticated, anon;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings read all" ON public.app_settings;
CREATE POLICY "settings read all" ON public.app_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "settings admin update" ON public.app_settings;
CREATE POLICY "settings admin update" ON public.app_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.consume_attempt(_applicant uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.applicants%ROWTYPE; s public.app_settings%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.app_settings WHERE id = 1;
  SELECT * INTO a FROM public.applicants WHERE id = _applicant FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF a.status <> 'approved' THEN RETURN jsonb_build_object('ok',false,'reason','not_approved','status',a.status); END IF;
  IF a.link_expires_at IS NOT NULL AND a.link_expires_at > now() THEN
    RETURN jsonb_build_object('ok',false,'reason','locked','until',a.link_expires_at);
  END IF;
  IF a.attempts_used >= s.max_attempts THEN
    UPDATE public.applicants SET link_expires_at = now() + make_interval(hours => s.cooldown_hours) WHERE id = _applicant;
    RETURN jsonb_build_object('ok',false,'reason','max_attempts');
  END IF;
  UPDATE public.applicants SET attempts_used = attempts_used + 1,
    link_expires_at = CASE WHEN attempts_used + 1 >= s.max_attempts
      THEN now() + make_interval(hours => s.cooldown_hours) ELSE link_expires_at END
    WHERE id = _applicant;
  RETURN jsonb_build_object('ok',true,'attempt_number', a.attempts_used + 1);
END $$;
GRANT EXECUTE ON FUNCTION public.consume_attempt(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_user_action(_applicant uuid, _action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _action = 'approve' THEN UPDATE public.applicants SET status='approved' WHERE id=_applicant;
  ELSIF _action = 'reject' THEN UPDATE public.applicants SET status='rejected' WHERE id=_applicant;
  ELSIF _action = 'suspend' THEN UPDATE public.applicants SET status='suspended' WHERE id=_applicant;
  ELSIF _action = 'reset_attempts' THEN UPDATE public.applicants SET attempts_used=0, link_expires_at=NULL WHERE id=_applicant;
  ELSIF _action = 'approve_link' THEN UPDATE public.applicants SET link_expires_at=NULL, attempts_used=0, status='approved' WHERE id=_applicant;
  ELSE RAISE EXCEPTION 'unknown_action'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_user_action(uuid,text) TO authenticated;

DROP POLICY IF EXISTS "proctor bucket insert" ON storage.objects;
CREATE POLICY "proctor bucket insert" ON storage.objects FOR INSERT TO authenticated, anon
  WITH CHECK (bucket_id = 'proctoring');
DROP POLICY IF EXISTS "proctor bucket admin read" ON storage.objects;
CREATE POLICY "proctor bucket admin read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'proctoring' AND public.has_role(auth.uid(),'admin'::public.app_role));
