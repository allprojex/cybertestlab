-- Make applicant_email nullable since the app doesn't collect email
ALTER TABLE public.test_results ALTER COLUMN applicant_email DROP NOT NULL;
ALTER TABLE public.test_results ALTER COLUMN applicant_email SET DEFAULT '';