-- 1) Gender on applicants + test_results
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.applicants
  DROP CONSTRAINT IF EXISTS applicants_gender_chk;
ALTER TABLE public.applicants
  ADD CONSTRAINT applicants_gender_chk
  CHECK (gender IS NULL OR gender IN ('male','female','other','prefer_not_to_say'));

ALTER TABLE public.test_results
  ADD COLUMN IF NOT EXISTS applicant_gender text;
ALTER TABLE public.test_results
  DROP CONSTRAINT IF EXISTS test_results_gender_chk;
ALTER TABLE public.test_results
  ADD CONSTRAINT test_results_gender_chk
  CHECK (applicant_gender IS NULL OR applicant_gender IN ('male','female','other','prefer_not_to_say'));

-- 2) Presence heartbeats
CREATE TABLE IF NOT EXISTS public.presence_heartbeats (
  session_id text PRIMARY KEY,
  role text NOT NULL,
  label text,
  last_seen timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.presence_heartbeats TO authenticated;
GRANT ALL ON public.presence_heartbeats TO service_role;

ALTER TABLE public.presence_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "heartbeats_admin_select" ON public.presence_heartbeats;
CREATE POLICY "heartbeats_admin_select" ON public.presence_heartbeats
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- RPC anyone can call (admin or anon applicant); writes via SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.record_heartbeat(_session_id text, _role text, _label text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _session_id IS NULL OR length(_session_id) < 8 OR length(_session_id) > 128 THEN
    RAISE EXCEPTION 'invalid_session_id';
  END IF;
  IF _role NOT IN ('admin','applicant') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;
  INSERT INTO public.presence_heartbeats(session_id, role, label, last_seen)
  VALUES (_session_id, _role, NULLIF(_label,''), now())
  ON CONFLICT (session_id) DO UPDATE
    SET last_seen = now(), role = EXCLUDED.role, label = EXCLUDED.label;
END $$;

REVOKE EXECUTE ON FUNCTION public.record_heartbeat(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_heartbeat(text,text,text) TO anon, authenticated, service_role;

-- 3) Lock down proctoring storage uploads to admin only (no client code uploads today)
DROP POLICY IF EXISTS "proctor bucket insert" ON storage.objects;
CREATE POLICY "proctor bucket admin insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'proctoring'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- 4) questions_public view: invoker rights; backend (service_role) is the only reader
ALTER VIEW public.questions_public SET (security_invoker = on);
REVOKE SELECT ON public.questions_public FROM anon, authenticated;
GRANT SELECT ON public.questions_public TO service_role;