
-- 1) Remove direct-client insert policy on proctoring_snapshots
DROP POLICY IF EXISTS "proctor self insert" ON public.proctoring_snapshots;

-- 2) Storage policies for the 'brand' bucket
DROP POLICY IF EXISTS "Brand assets public read" ON storage.objects;
CREATE POLICY "Brand assets public read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'brand');

DROP POLICY IF EXISTS "Brand assets admin insert" ON storage.objects;
CREATE POLICY "Brand assets admin insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'brand' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Brand assets admin update" ON storage.objects;
CREATE POLICY "Brand assets admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'brand' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'brand' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Brand assets admin delete" ON storage.objects;
CREATE POLICY "Brand assets admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'brand' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3) Clear inline base64 logos from the publicly readable settings row.
UPDATE public.app_settings
SET brand_logo_url = NULL
WHERE brand_logo_url IS NOT NULL
  AND brand_logo_url LIKE 'data:%';
