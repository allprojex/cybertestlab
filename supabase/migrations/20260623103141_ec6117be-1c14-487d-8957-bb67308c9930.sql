
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS brand_name text NOT NULL DEFAULT 'CYBER TEST 360',
  ADD COLUMN IF NOT EXISTS brand_logo_url text;
