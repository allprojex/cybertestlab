
-- 1) Soft-delete columns
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE public.question_sets
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS idx_applicants_deleted_at ON public.applicants(deleted_at);
CREATE INDEX IF NOT EXISTS idx_questions_deleted_at ON public.questions(deleted_at);
CREATE INDEX IF NOT EXISTS idx_question_sets_deleted_at ON public.question_sets(deleted_at);

-- 2) Helper: enforce admin + whitelist tables
CREATE OR REPLACE FUNCTION public._recycle_check(_table text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _table NOT IN ('applicants','questions','question_sets') THEN
    RAISE EXCEPTION 'invalid_table';
  END IF;
END $$;

-- 3) Soft-delete
CREATE OR REPLACE FUNCTION public.recycle_soft_delete(_table text, _id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _admin uuid := auth.uid(); _email text;
BEGIN
  PERFORM public._recycle_check(_table);
  EXECUTE format(
    'UPDATE public.%I SET deleted_at = now(), deleted_by = $1 WHERE id = $2 AND deleted_at IS NULL',
    _table
  ) USING _admin, _id;
  SELECT email INTO _email FROM auth.users WHERE id = _admin;
  INSERT INTO public.admin_audit_log(admin_id, admin_email, action, metadata)
  VALUES (_admin, _email, 'recycle_soft_delete', jsonb_build_object('table', _table, 'id', _id));
  RETURN jsonb_build_object('ok', true);
END $$;

-- 4) Restore
CREATE OR REPLACE FUNCTION public.recycle_restore(_table text, _id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _admin uuid := auth.uid(); _email text;
BEGIN
  PERFORM public._recycle_check(_table);
  EXECUTE format(
    'UPDATE public.%I SET deleted_at = NULL, deleted_by = NULL WHERE id = $1',
    _table
  ) USING _id;
  SELECT email INTO _email FROM auth.users WHERE id = _admin;
  INSERT INTO public.admin_audit_log(admin_id, admin_email, action, metadata)
  VALUES (_admin, _email, 'recycle_restore', jsonb_build_object('table', _table, 'id', _id));
  RETURN jsonb_build_object('ok', true);
END $$;

-- 5) Purge single
CREATE OR REPLACE FUNCTION public.recycle_purge(_table text, _id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _admin uuid := auth.uid(); _email text;
BEGIN
  PERFORM public._recycle_check(_table);
  EXECUTE format(
    'DELETE FROM public.%I WHERE id = $1 AND deleted_at IS NOT NULL',
    _table
  ) USING _id;
  SELECT email INTO _email FROM auth.users WHERE id = _admin;
  INSERT INTO public.admin_audit_log(admin_id, admin_email, action, metadata)
  VALUES (_admin, _email, 'recycle_purge', jsonb_build_object('table', _table, 'id', _id));
  RETURN jsonb_build_object('ok', true);
END $$;

-- 6) Empty bin (all tables or one)
CREATE OR REPLACE FUNCTION public.recycle_empty(_table text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin uuid := auth.uid();
  _email text;
  _tables text[] := ARRAY['applicants','questions','question_sets'];
  _t text;
  _n bigint := 0;
  _cnt bigint;
BEGIN
  IF NOT public.has_role(_admin, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _table IS NOT NULL THEN
    IF _table <> ALL (_tables) THEN RAISE EXCEPTION 'invalid_table'; END IF;
    _tables := ARRAY[_table];
  END IF;
  FOREACH _t IN ARRAY _tables LOOP
    EXECUTE format('DELETE FROM public.%I WHERE deleted_at IS NOT NULL', _t);
    GET DIAGNOSTICS _cnt = ROW_COUNT;
    _n := _n + _cnt;
  END LOOP;
  SELECT email INTO _email FROM auth.users WHERE id = _admin;
  INSERT INTO public.admin_audit_log(admin_id, admin_email, action, metadata)
  VALUES (_admin, _email, 'recycle_empty', jsonb_build_object('table', _table, 'purged', _n));
  RETURN jsonb_build_object('ok', true, 'purged', _n);
END $$;

-- 7) List bin contents
CREATE OR REPLACE FUNCTION public.recycle_list()
RETURNS TABLE(kind text, id uuid, label text, deleted_at timestamptz, deleted_by uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT 'applicants'::text, a.id, COALESCE(a.full_name, a.email, a.id::text),
           a.deleted_at, a.deleted_by
    FROM public.applicants a WHERE a.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'questions'::text, q.id, LEFT(q.question_text, 120),
           q.deleted_at, q.deleted_by
    FROM public.questions q WHERE q.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'question_sets'::text, s.id, s.name,
           s.deleted_at, s.deleted_by
    FROM public.question_sets s WHERE s.deleted_at IS NOT NULL
    ORDER BY 4 DESC;
END $$;

-- 8) Notifications purge
CREATE OR REPLACE FUNCTION public.notifications_purge(_before timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin uuid := auth.uid();
  _email text;
  _logins bigint;
  _audit bigint;
BEGIN
  IF NOT public.has_role(_admin, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _before IS NULL OR _before > now() THEN
    RAISE EXCEPTION 'invalid_cutoff';
  END IF;
  DELETE FROM public.login_activity WHERE created_at < _before;
  GET DIAGNOSTICS _logins = ROW_COUNT;
  DELETE FROM public.admin_audit_log WHERE created_at < _before;
  GET DIAGNOSTICS _audit = ROW_COUNT;
  SELECT email INTO _email FROM auth.users WHERE id = _admin;
  INSERT INTO public.admin_audit_log(admin_id, admin_email, action, metadata)
  VALUES (_admin, _email, 'notifications_purge',
          jsonb_build_object('before', _before, 'logins', _logins, 'audit', _audit));
  RETURN jsonb_build_object('ok', true, 'logins', _logins, 'audit', _audit);
END $$;

-- 9) Grants — admins only (function checks role inside)
REVOKE ALL ON FUNCTION public.recycle_soft_delete(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recycle_restore(text, uuid)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recycle_purge(text, uuid)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recycle_empty(text)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recycle_list()                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notifications_purge(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recycle_soft_delete(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recycle_restore(text, uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.recycle_purge(text, uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.recycle_empty(text)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.recycle_list()                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.notifications_purge(timestamptz) TO authenticated;
