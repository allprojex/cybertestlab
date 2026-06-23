
CREATE OR REPLACE FUNCTION public.share_link_regenerate(_link_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin uuid := auth.uid();
  _email text;
  _new_token uuid;
  _set uuid;
BEGIN
  IF NOT public.has_role(_admin, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT set_id INTO _set FROM public.question_set_share_links WHERE id = _link_id;
  IF _set IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  _new_token := gen_random_uuid();
  UPDATE public.question_set_share_links
    SET token = _new_token,
        uses_count = 0,
        enabled = true,
        updated_at = now()
    WHERE id = _link_id;

  SELECT email INTO _email FROM auth.users WHERE id = _admin;
  INSERT INTO public.admin_audit_log(admin_id, admin_email, action, metadata)
  VALUES (_admin, _email, 'share_link_regenerate',
          jsonb_build_object('link_id', _link_id, 'set_id', _set));

  RETURN jsonb_build_object('ok', true, 'token', _new_token);
END $$;

CREATE OR REPLACE FUNCTION public.share_link_revoke(_link_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin uuid := auth.uid();
  _email text;
  _set uuid;
BEGIN
  IF NOT public.has_role(_admin, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT set_id INTO _set FROM public.question_set_share_links WHERE id = _link_id;
  IF _set IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  DELETE FROM public.question_set_share_links WHERE id = _link_id;

  SELECT email INTO _email FROM auth.users WHERE id = _admin;
  INSERT INTO public.admin_audit_log(admin_id, admin_email, action, metadata)
  VALUES (_admin, _email, 'share_link_revoke',
          jsonb_build_object('link_id', _link_id, 'set_id', _set));

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.share_link_regenerate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.share_link_revoke(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_link_regenerate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.share_link_revoke(uuid) TO authenticated;
