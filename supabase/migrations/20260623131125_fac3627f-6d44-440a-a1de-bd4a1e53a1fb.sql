
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.login_activity;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE public.login_activity REPLICA IDENTITY FULL;
