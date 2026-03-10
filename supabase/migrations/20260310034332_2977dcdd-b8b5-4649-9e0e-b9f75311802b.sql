
-- =============================================
-- HELPER FUNCTION
-- =============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =============================================
-- ENUMS
-- =============================================
CREATE TYPE public.event_status AS ENUM ('draft', 'published', 'closed', 'canceled');
CREATE TYPE public.purchase_type AS ENUM ('individual', 'batch');
CREATE TYPE public.payment_status AS ENUM ('pending', 'approved', 'refused', 'canceled', 'expired', 'refunded');
CREATE TYPE public.registration_status AS ENUM ('pending_payment', 'confirmed', 'canceled', 'invalidated');
CREATE TYPE public.checkin_status AS ENUM ('not_checked_in', 'checked_in');
CREATE TYPE public.certificate_status AS ENUM ('unavailable', 'available', 'issued');
CREATE TYPE public.admin_role AS ENUM ('superadmin', 'admin', 'checkin_operator');
CREATE TYPE public.checkin_action_type AS ENUM ('scan', 'manual');

-- =============================================
-- ADMIN_USERS TABLE (must be first for functions)
-- =============================================
CREATE TABLE public.admin_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role public.admin_role NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON public.admin_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- SECURITY DEFINER FUNCTIONS
-- =============================================
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = _user_id AND role IN ('superadmin', 'admin')) $$;

CREATE OR REPLACE FUNCTION public.is_checkin_operator(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = _user_id AND role IN ('superadmin', 'admin', 'checkin_operator')) $$;

-- Admin users RLS
CREATE POLICY "Admin users can view own record" ON public.admin_users FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage admin_users" ON public.admin_users FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- =============================================
-- EVENTS TABLE
-- =============================================
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  banner_url TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  location_name TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  workload_hours NUMERIC(5,1),
  organizer_name TEXT,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  max_participants INTEGER,
  status public.event_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view published events" ON public.events FOR SELECT USING (status = 'published' OR status = 'closed');
CREATE POLICY "Admins can manage events" ON public.events FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- ORDERS TABLE
-- =============================================
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  order_code TEXT NOT NULL UNIQUE,
  order_nsu TEXT,
  purchase_type public.purchase_type NOT NULL DEFAULT 'individual',
  buyer_name TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  buyer_phone TEXT,
  buyer_document TEXT NOT NULL,
  buyer_is_participant BOOLEAN NOT NULL DEFAULT true,
  participants_count INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,
  total_price_cents INTEGER NOT NULL,
  payment_provider TEXT DEFAULT 'infinitepay',
  payment_status public.payment_status NOT NULL DEFAULT 'pending',
  payment_link TEXT,
  payment_provider_reference TEXT,
  redirect_status_last_seen TEXT,
  webhook_status_last_seen TEXT,
  paid_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view orders by code" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Admins can manage orders" ON public.orders FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE INDEX idx_orders_event_id ON public.orders(event_id);
CREATE INDEX idx_orders_order_code ON public.orders(order_code);
CREATE INDEX idx_orders_buyer_email ON public.orders(buyer_email);
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- REGISTRATIONS TABLE
-- =============================================
CREATE TABLE public.registrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  registration_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  cpf TEXT NOT NULL,
  birth_date DATE,
  area TEXT,
  congregation TEXT,
  church_role TEXT,
  church_function TEXT,
  consent_terms BOOLEAN NOT NULL DEFAULT false,
  consent_data_usage BOOLEAN NOT NULL DEFAULT false,
  registration_type public.purchase_type NOT NULL DEFAULT 'individual',
  registration_status public.registration_status NOT NULL DEFAULT 'pending_payment',
  payment_status public.payment_status NOT NULL DEFAULT 'pending',
  qr_token TEXT UNIQUE,
  qr_generated_at TIMESTAMPTZ,
  checkin_status public.checkin_status NOT NULL DEFAULT 'not_checked_in',
  checkin_at TIMESTAMPTZ,
  checkin_by_user_id UUID,
  certificate_status public.certificate_status NOT NULL DEFAULT 'unavailable',
  certificate_issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view registrations" ON public.registrations FOR SELECT USING (true);
CREATE POLICY "Admins can manage registrations" ON public.registrations FOR ALL USING (public.is_admin(auth.uid()) OR public.is_checkin_operator(auth.uid())) WITH CHECK (public.is_admin(auth.uid()) OR public.is_checkin_operator(auth.uid()));
CREATE INDEX idx_registrations_event_id ON public.registrations(event_id);
CREATE INDEX idx_registrations_order_id ON public.registrations(order_id);
CREATE INDEX idx_registrations_qr_token ON public.registrations(qr_token);
CREATE INDEX idx_registrations_email ON public.registrations(email);
CREATE INDEX idx_registrations_cpf ON public.registrations(cpf);
CREATE TRIGGER update_registrations_updated_at BEFORE UPDATE ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- PAYMENT_EVENTS TABLE
-- =============================================
CREATE TABLE public.payment_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'infinitepay',
  event_type TEXT NOT NULL,
  external_event_id TEXT,
  raw_payload_json JSONB,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view payment_events" ON public.payment_events FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage payment_events" ON public.payment_events FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE INDEX idx_payment_events_order_id ON public.payment_events(order_id);
CREATE INDEX idx_payment_events_external_id ON public.payment_events(external_event_id);

-- =============================================
-- CHECKIN_LOGS TABLE
-- =============================================
CREATE TABLE public.checkin_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  action_type public.checkin_action_type NOT NULL DEFAULT 'scan',
  checked_by_user_id UUID,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);
ALTER TABLE public.checkin_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Operators can view checkin_logs" ON public.checkin_logs FOR SELECT USING (public.is_checkin_operator(auth.uid()));
CREATE POLICY "Operators can manage checkin_logs" ON public.checkin_logs FOR ALL USING (public.is_checkin_operator(auth.uid())) WITH CHECK (public.is_checkin_operator(auth.uid()));
CREATE INDEX idx_checkin_logs_registration_id ON public.checkin_logs(registration_id);

-- =============================================
-- CERTIFICATES TABLE
-- =============================================
CREATE TABLE public.certificates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE UNIQUE,
  certificate_code TEXT NOT NULL UNIQUE,
  validation_hash TEXT NOT NULL UNIQUE,
  pdf_url TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view certificates" ON public.certificates FOR SELECT USING (true);
CREATE POLICY "Admins can manage certificates" ON public.certificates FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE INDEX idx_certificates_code ON public.certificates(certificate_code);
CREATE INDEX idx_certificates_hash ON public.certificates(validation_hash);
CREATE TRIGGER update_certificates_updated_at BEFORE UPDATE ON public.certificates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- AUDIT_LOGS TABLE
-- =============================================
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  actor_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view audit_logs" ON public.audit_logs FOR SELECT USING (public.is_admin(auth.uid()));
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
