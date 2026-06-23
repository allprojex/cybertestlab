
CREATE OR REPLACE FUNCTION public.log_login_event(
  _email text,
  _event text,
  _user_agent text DEFAULT NULL,
  _applicant_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _allowed text[] := ARRAY[
    'login_success','login_failed',
    'logout',
    'password_reset_requested','password_reset_completed',
    'recovery_secret_used'
  ];
BEGIN
  IF _event IS NULL OR NOT (_event = ANY(_allowed)) THEN
    RAISE EXCEPTION 'invalid_event';
  END IF;
  IF _email IS NOT NULL AND length(_email) > 320 THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;

  INSERT INTO public.login_activity(applicant_id, email, event, user_agent)
  VALUES (_applicant_id, NULLIF(lower(trim(_email)), ''), _event, NULLIF(_user_agent,''))
  RETURNING id INTO _id;
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.log_login_event(text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_login_event(text, text, text, uuid) TO anon, authenticated;
