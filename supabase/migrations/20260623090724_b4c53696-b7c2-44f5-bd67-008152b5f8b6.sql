
-- 1) Private schema with has_role (not exposed via PostgREST)
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 2) Drop existing policies that reference public.has_role
DROP POLICY IF EXISTS "Admins can delete questions" ON public.questions;
DROP POLICY IF EXISTS "Admins can insert questions" ON public.questions;
DROP POLICY IF EXISTS "Admins can update questions" ON public.questions;
DROP POLICY IF EXISTS "Public can read questions" ON public.questions;
DROP POLICY IF EXISTS "Admins can view test results" ON public.test_results;
DROP POLICY IF EXISTS "Anyone can read test results by id" ON public.test_results;
DROP POLICY IF EXISTS "Service role can insert test results" ON public.test_results;
DROP POLICY IF EXISTS "Admins can view roles" ON public.user_roles;

-- 3) Recreate policies using private.has_role
CREATE POLICY "Admins can read questions" ON public.questions
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can insert questions" ON public.questions
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update questions" ON public.questions
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete questions" ON public.questions
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can view test results" ON public.test_results
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can view roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

-- 4) Drop the public.has_role function now that nothing references it
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

-- 5) Revoke anon SELECT on questions; the public view (questions_public) remains accessible
REVOKE SELECT ON public.questions FROM anon;

-- 6) Add access token hash column for tokenised result retrieval
ALTER TABLE public.test_results
  ADD COLUMN IF NOT EXISTS access_token_hash text;

-- 7) Submission logs for persistent rate limiting (server-only)
CREATE TABLE IF NOT EXISTS public.submission_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.submission_logs TO service_role;

ALTER TABLE public.submission_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_submission_logs_ip_time
  ON public.submission_logs (ip_address, created_at DESC);
