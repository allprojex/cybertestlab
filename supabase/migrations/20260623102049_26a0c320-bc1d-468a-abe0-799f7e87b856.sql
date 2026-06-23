
-- Add a per-applicant test link token used to build a fresh URL when admin regenerates a link
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS link_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS applicants_link_token_idx ON public.applicants(link_token);

-- Admin audit log
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  admin_email text,
  applicant_id uuid REFERENCES public.applicants(id) ON DELETE SET NULL,
  action text NOT NULL,
  ip text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit log"
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON public.admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_applicant_idx ON public.admin_audit_log(applicant_id);

-- Replace admin_user_action: capture IP + user agent, add regenerate_link action, write audit row
CREATE OR REPLACE FUNCTION public.admin_user_action(
  _applicant uuid,
  _action text,
  _ip text DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin uuid := auth.uid();
  _admin_email text;
  _new_token uuid;
  _meta jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.has_role(_admin, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT email INTO _admin_email FROM auth.users WHERE id = _admin;

  IF _action = 'approve' THEN
    UPDATE public.applicants SET status='approved' WHERE id=_applicant;
  ELSIF _action = 'reject' THEN
    UPDATE public.applicants SET status='rejected' WHERE id=_applicant;
  ELSIF _action = 'suspend' THEN
    UPDATE public.applicants SET status='suspended' WHERE id=_applicant;
  ELSIF _action = 'reset_attempts' THEN
    UPDATE public.applicants SET attempts_used=0, link_expires_at=NULL WHERE id=_applicant;
  ELSIF _action = 'approve_link' THEN
    -- legacy: clear the current lock but keep token
    UPDATE public.applicants SET link_expires_at=NULL, attempts_used=0, status='approved' WHERE id=_applicant;
  ELSIF _action = 'expire_link' THEN
    UPDATE public.applicants
      SET link_expires_at = now() + interval '24 hours'
      WHERE id=_applicant;
    _meta := jsonb_build_object('expires_at', (SELECT link_expires_at FROM public.applicants WHERE id=_applicant));
  ELSIF _action = 'regenerate_link' THEN
    -- Approve the expired link and mint a fresh test URL token.
    -- Cooldown rule (24h after max attempts) is preserved in consume_attempt; we only clear the current lock.
    _new_token := gen_random_uuid();
    UPDATE public.applicants
      SET status='approved',
          attempts_used=0,
          link_expires_at=NULL,
          link_token=_new_token
      WHERE id=_applicant;
    _meta := jsonb_build_object('new_link_token', _new_token);
  ELSE
    RAISE EXCEPTION 'unknown_action';
  END IF;

  INSERT INTO public.admin_audit_log(admin_id, admin_email, applicant_id, action, ip, user_agent, metadata)
  VALUES (_admin, _admin_email, _applicant, _action, _ip, _user_agent, _meta);

  RETURN jsonb_build_object('ok', true, 'metadata', _meta);
END $$;
