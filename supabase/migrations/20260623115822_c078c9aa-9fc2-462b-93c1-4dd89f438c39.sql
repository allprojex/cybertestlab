-- Explicit deny-by-default for client roles; only service_role may write
DROP POLICY IF EXISTS "user_roles_no_client_insert" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_no_client_update" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_no_client_delete" ON public.user_roles;

CREATE POLICY "user_roles_no_client_insert" ON public.user_roles
  FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "user_roles_no_client_update" ON public.user_roles
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "user_roles_no_client_delete" ON public.user_roles
  FOR DELETE TO anon, authenticated USING (false);