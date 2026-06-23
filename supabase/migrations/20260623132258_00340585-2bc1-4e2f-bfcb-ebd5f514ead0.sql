
CREATE TABLE IF NOT EXISTS public.backup_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version bigserial,
  filename text NOT NULL UNIQUE,
  format text NOT NULL CHECK (format IN ('json','xlsx','csv','other')),
  source text NOT NULL CHECK (source IN ('generated','uploaded')),
  tables text[] NOT NULL DEFAULT ARRAY[]::text[],
  row_count integer NOT NULL DEFAULT 0,
  size_bytes bigint NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_files TO authenticated;
GRANT ALL ON public.backup_files TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.backup_files_version_seq TO authenticated;

ALTER TABLE public.backup_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "backup_files admin read" ON public.backup_files;
CREATE POLICY "backup_files admin read" ON public.backup_files FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY IF EXISTS "backup_files admin write" ON public.backup_files;
CREATE POLICY "backup_files admin write" ON public.backup_files FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY IF EXISTS "backup_files admin update" ON public.backup_files;
CREATE POLICY "backup_files admin update" ON public.backup_files FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY IF EXISTS "backup_files admin delete" ON public.backup_files;
CREATE POLICY "backup_files admin delete" ON public.backup_files FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS backup_files_created_idx ON public.backup_files(created_at DESC);
CREATE INDEX IF NOT EXISTS backup_files_format_idx ON public.backup_files(format);
