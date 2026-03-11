
-- ============================================
-- FIX 1: auth_rls_initplan - wrap auth.uid() in (select ...)
-- FIX 2: multiple_permissive_policies - remove redundant SELECT policies
-- ============================================

-- ==================== admin_users ====================
DROP POLICY IF EXISTS "Admin users can view own record" ON public.admin_users;
DROP POLICY IF EXISTS "Admins can manage admin_users" ON public.admin_users;

CREATE POLICY "Admin users can view own record" ON public.admin_users
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Admins can manage admin_users" ON public.admin_users
  FOR ALL TO authenticated
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

-- ==================== audit_logs ====================
DROP POLICY IF EXISTS "Admins can view audit_logs" ON public.audit_logs;

CREATE POLICY "Admins can view audit_logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (is_admin((select auth.uid())));

-- ==================== events ====================
DROP POLICY IF EXISTS "Admins can manage events" ON public.events;
DROP POLICY IF EXISTS "Anyone can view published events" ON public.events;

-- Admin: all operations except SELECT (to avoid overlap)
CREATE POLICY "Admins can manage events" ON public.events
  FOR ALL TO authenticated
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

-- Public: SELECT only for published/closed events (non-overlapping with admin via restrictive check not needed since admin policy already covers all)
-- To fix overlap: make admin policy only for INSERT/UPDATE/DELETE and keep a combined SELECT
DROP POLICY IF EXISTS "Admins can manage events" ON public.events;

CREATE POLICY "Admins can write events" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (is_admin((select auth.uid())));

CREATE POLICY "Admins can update events" ON public.events
  FOR UPDATE TO authenticated
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

CREATE POLICY "Admins can delete events" ON public.events
  FOR DELETE TO authenticated
  USING (is_admin((select auth.uid())));

CREATE POLICY "Select events" ON public.events
  FOR SELECT
  USING (
    status IN ('published', 'closed', 'concluded')
    OR is_admin((select auth.uid()))
  );

-- ==================== orders ====================
DROP POLICY IF EXISTS "Admins can manage orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can view orders by code" ON public.orders;

CREATE POLICY "Admins can write orders" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (is_admin((select auth.uid())));

CREATE POLICY "Admins can update orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

CREATE POLICY "Admins can delete orders" ON public.orders
  FOR DELETE TO authenticated
  USING (is_admin((select auth.uid())));

CREATE POLICY "Select orders" ON public.orders
  FOR SELECT
  USING (true);

-- ==================== registrations ====================
DROP POLICY IF EXISTS "Admins can manage registrations" ON public.registrations;
DROP POLICY IF EXISTS "Anyone can view registrations" ON public.registrations;

CREATE POLICY "Admins can write registrations" ON public.registrations
  FOR INSERT TO authenticated
  WITH CHECK (is_admin((select auth.uid())) OR is_checkin_operator((select auth.uid())));

CREATE POLICY "Admins can update registrations" ON public.registrations
  FOR UPDATE TO authenticated
  USING (is_admin((select auth.uid())) OR is_checkin_operator((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())) OR is_checkin_operator((select auth.uid())));

CREATE POLICY "Admins can delete registrations" ON public.registrations
  FOR DELETE TO authenticated
  USING (is_admin((select auth.uid())));

CREATE POLICY "Select registrations" ON public.registrations
  FOR SELECT
  USING (true);

-- ==================== payment_events ====================
DROP POLICY IF EXISTS "Admins can manage payment_events" ON public.payment_events;
DROP POLICY IF EXISTS "Admins can view payment_events" ON public.payment_events;

CREATE POLICY "Admins can write payment_events" ON public.payment_events
  FOR INSERT TO authenticated
  WITH CHECK (is_admin((select auth.uid())));

CREATE POLICY "Admins can update payment_events" ON public.payment_events
  FOR UPDATE TO authenticated
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

CREATE POLICY "Admins can delete payment_events" ON public.payment_events
  FOR DELETE TO authenticated
  USING (is_admin((select auth.uid())));

CREATE POLICY "Select payment_events" ON public.payment_events
  FOR SELECT TO authenticated
  USING (is_admin((select auth.uid())));

-- ==================== checkin_logs ====================
DROP POLICY IF EXISTS "Operators can manage checkin_logs" ON public.checkin_logs;
DROP POLICY IF EXISTS "Operators can view checkin_logs" ON public.checkin_logs;

CREATE POLICY "Operators can write checkin_logs" ON public.checkin_logs
  FOR INSERT TO authenticated
  WITH CHECK (is_checkin_operator((select auth.uid())));

CREATE POLICY "Operators can update checkin_logs" ON public.checkin_logs
  FOR UPDATE TO authenticated
  USING (is_checkin_operator((select auth.uid())))
  WITH CHECK (is_checkin_operator((select auth.uid())));

CREATE POLICY "Operators can delete checkin_logs" ON public.checkin_logs
  FOR DELETE TO authenticated
  USING (is_checkin_operator((select auth.uid())));

CREATE POLICY "Select checkin_logs" ON public.checkin_logs
  FOR SELECT TO authenticated
  USING (is_checkin_operator((select auth.uid())));

-- ==================== certificates ====================
DROP POLICY IF EXISTS "Admins can manage certificates" ON public.certificates;
DROP POLICY IF EXISTS "Anyone can view certificates" ON public.certificates;

CREATE POLICY "Admins can write certificates" ON public.certificates
  FOR INSERT TO authenticated
  WITH CHECK (is_admin((select auth.uid())));

CREATE POLICY "Admins can update certificates" ON public.certificates
  FOR UPDATE TO authenticated
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

CREATE POLICY "Admins can delete certificates" ON public.certificates
  FOR DELETE TO authenticated
  USING (is_admin((select auth.uid())));

CREATE POLICY "Select certificates" ON public.certificates
  FOR SELECT
  USING (true);

-- ==================== certificate_templates ====================
DROP POLICY IF EXISTS "Admins can manage certificate_templates" ON public.certificate_templates;
DROP POLICY IF EXISTS "Anyone can view certificate_templates" ON public.certificate_templates;

CREATE POLICY "Admins can write certificate_templates" ON public.certificate_templates
  FOR INSERT TO authenticated
  WITH CHECK (is_admin((select auth.uid())));

CREATE POLICY "Admins can update certificate_templates" ON public.certificate_templates
  FOR UPDATE TO authenticated
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

CREATE POLICY "Admins can delete certificate_templates" ON public.certificate_templates
  FOR DELETE TO authenticated
  USING (is_admin((select auth.uid())));

CREATE POLICY "Select certificate_templates" ON public.certificate_templates
  FOR SELECT
  USING (true);

-- ==================== event_form_fields ====================
DROP POLICY IF EXISTS "Admins can manage form fields" ON public.event_form_fields;
DROP POLICY IF EXISTS "Anyone can read form fields for published events" ON public.event_form_fields;

CREATE POLICY "Admins can write form fields" ON public.event_form_fields
  FOR INSERT TO authenticated
  WITH CHECK (is_admin((select auth.uid())));

CREATE POLICY "Admins can update form fields" ON public.event_form_fields
  FOR UPDATE TO authenticated
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

CREATE POLICY "Admins can delete form fields" ON public.event_form_fields
  FOR DELETE TO authenticated
  USING (is_admin((select auth.uid())));

CREATE POLICY "Select form fields" ON public.event_form_fields
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM events e WHERE e.id = event_form_fields.event_id AND e.status IN ('published', 'closed', 'concluded'))
    OR is_admin((select auth.uid()))
  );

-- ==================== site_settings ====================
DROP POLICY IF EXISTS "Admins can update site_settings" ON public.site_settings;
DROP POLICY IF EXISTS "Anyone can read site_settings" ON public.site_settings;

CREATE POLICY "Admins can update site_settings" ON public.site_settings
  FOR UPDATE TO authenticated
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

CREATE POLICY "Select site_settings" ON public.site_settings
  FOR SELECT
  USING (true);

-- ==================== Update security definer functions ====================
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = _user_id
      AND role IN ('superadmin', 'admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_checkin_operator(_user_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = _user_id
      AND role IN ('superadmin', 'admin', 'checkin_operator')
  )
$$;
