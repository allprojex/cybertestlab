
-- Admin-only RLS on the "backups" storage bucket
DROP POLICY IF EXISTS "backups_admin_select" ON storage.objects;
CREATE POLICY "backups_admin_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'backups' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "backups_admin_insert" ON storage.objects;
CREATE POLICY "backups_admin_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'backups' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "backups_admin_update" ON storage.objects;
CREATE POLICY "backups_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'backups' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'backups' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "backups_admin_delete" ON storage.objects;
CREATE POLICY "backups_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'backups' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- Helper: log an admin action (used by backup & recovery UI)
CREATE OR REPLACE FUNCTION public.log_admin_action(_action text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _email text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _action IS NULL OR length(_action) = 0 OR length(_action) > 80 THEN
    RAISE EXCEPTION 'invalid_action';
  END IF;
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.admin_audit_log(admin_id, admin_email, action, metadata)
  VALUES (auth.uid(), _email, _action, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.log_admin_action(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_admin_action(text, jsonb) TO authenticated;
