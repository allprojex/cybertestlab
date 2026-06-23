
-- ===== Harden SECURITY DEFINER functions: pin search_path and tighten EXECUTE =====

ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;

-- Queue wrappers: backend only
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;

-- Set resolution helpers: backend only (edge functions)
REVOKE EXECUTE ON FUNCTION public.resolve_applicant_set(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_applicant_set(uuid) TO service_role;

-- Admin-only RPCs: signed-in admins only
REVOKE EXECUTE ON FUNCTION public.admin_user_action(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_user_action(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.preview_resolve_set(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_action(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_user_action(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_resolve_set(uuid, uuid, uuid) TO authenticated, service_role;

-- consume_attempt: anon test takers + admins; not PUBLIC
REVOKE EXECUTE ON FUNCTION public.consume_attempt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_attempt(uuid) TO anon, authenticated, service_role;

-- record_heartbeat: already locked in prior migration, ensure
REVOKE EXECUTE ON FUNCTION public.record_heartbeat(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_heartbeat(text, text, text) TO anon, authenticated, service_role;

-- ===== test_results: writes only via service_role; admins read only =====
REVOKE INSERT, UPDATE, DELETE ON public.test_results FROM anon, authenticated;
GRANT SELECT ON public.test_results TO authenticated;
GRANT ALL ON public.test_results TO service_role;

-- Belt-and-braces RLS: block any direct client writes
DROP POLICY IF EXISTS "test_results_no_client_writes" ON public.test_results;
CREATE POLICY "test_results_no_client_writes" ON public.test_results
  FOR INSERT TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "test_results_no_client_updates" ON public.test_results;
CREATE POLICY "test_results_no_client_updates" ON public.test_results
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "test_results_no_client_deletes" ON public.test_results;
CREATE POLICY "test_results_no_client_deletes" ON public.test_results
  FOR DELETE TO anon, authenticated USING (false);

-- ===== questions: ensure correct_answer is never readable by non-admins =====
-- (Admin-only SELECT policy already exists; we explicitly revoke anon/auth column rights)
REVOKE SELECT ON public.questions FROM anon, authenticated;
GRANT SELECT ON public.questions TO service_role;
-- Admins still read through the "Admins can read questions" RLS policy via PostgREST,
-- which requires table-level SELECT grant to authenticated.  Re-grant SELECT to authenticated
-- but rely on RLS to restrict to admin rows; correct_answer column itself is filtered by RLS row scope.
GRANT SELECT ON public.questions TO authenticated;

-- ===== Realtime publication for live dashboard widgets =====
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'login_activity','test_attempts','test_results','applicants',
    'presence_heartbeats','proctoring_snapshots','admin_audit_log','questions'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;
