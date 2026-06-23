
-- 1) Share-link table
CREATE TABLE public.question_set_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id uuid NOT NULL UNIQUE REFERENCES public.question_sets(id) ON DELETE CASCADE,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  enabled boolean NOT NULL DEFAULT true,
  max_uses integer,
  uses_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_set_share_links TO authenticated;
GRANT ALL ON public.question_set_share_links TO service_role;

ALTER TABLE public.question_set_share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "share_links admin read"
  ON public.question_set_share_links FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "share_links admin write"
  ON public.question_set_share_links FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER question_set_share_links_set_updated_at
  BEFORE UPDATE ON public.question_set_share_links
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) Tag applicants created via a public link
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS share_link_id uuid REFERENCES public.question_set_share_links(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_applicants_share_link ON public.applicants(share_link_id);

-- 3) Realtime for results (attempts already in publication)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.test_results;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
