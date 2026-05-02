-- 1) Editor visual do certificado
ALTER TABLE public.certificate_templates
  ADD COLUMN IF NOT EXISTS background_url text,
  ADD COLUMN IF NOT EXISTS field_positions jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) Check-in por dia
CREATE TABLE IF NOT EXISTS public.checkin_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  event_day date NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  checked_by_user_id uuid,
  UNIQUE (registration_id, event_day)
);

ALTER TABLE public.checkin_days ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_checkin_days_event_day ON public.checkin_days(event_id, event_day);
CREATE INDEX IF NOT EXISTS idx_checkin_days_registration ON public.checkin_days(registration_id);

CREATE POLICY "Operators select checkin_days"
  ON public.checkin_days FOR SELECT TO authenticated
  USING (public.is_checkin_operator((SELECT auth.uid())));

CREATE POLICY "Operators insert checkin_days"
  ON public.checkin_days FOR INSERT TO authenticated
  WITH CHECK (public.is_checkin_operator((SELECT auth.uid())));

CREATE POLICY "Operators update checkin_days"
  ON public.checkin_days FOR UPDATE TO authenticated
  USING (public.is_checkin_operator((SELECT auth.uid())))
  WITH CHECK (public.is_checkin_operator((SELECT auth.uid())));

CREATE POLICY "Operators delete checkin_days"
  ON public.checkin_days FOR DELETE TO authenticated
  USING (public.is_checkin_operator((SELECT auth.uid())));