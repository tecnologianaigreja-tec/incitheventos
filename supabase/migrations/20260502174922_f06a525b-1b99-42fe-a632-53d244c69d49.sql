-- 1) Restrict event-banners bucket writes to admins
DROP POLICY IF EXISTS "Authenticated users can upload banners" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update banners" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete banners" ON storage.objects;

CREATE POLICY "Admins can upload banners"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-banners' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins can update banners"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'event-banners' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'event-banners' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete banners"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'event-banners' AND public.is_admin(auth.uid()));

-- 2) Revoke direct EXECUTE on SECURITY DEFINER role-check helpers from anon/authenticated.
-- They are still callable from within RLS policies (which run as the policy owner).
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_checkin_operator(uuid) FROM anon, authenticated, public;

-- mark_labels_printed must remain callable by signed-in admins (it is invoked via RPC from the admin UI).
-- Restrict to authenticated only (not anon).
REVOKE EXECUTE ON FUNCTION public.mark_labels_printed(uuid[], uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.mark_labels_printed(uuid[], uuid) TO authenticated;