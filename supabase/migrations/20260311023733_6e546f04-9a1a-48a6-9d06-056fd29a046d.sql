
-- Add landing page content columns to events
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS hero_badge text,
  ADD COLUMN IF NOT EXISTS about_title text,
  ADD COLUMN IF NOT EXISTS about_description text,
  ADD COLUMN IF NOT EXISTS target_audience jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS includes_items jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS faq_items jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cta_title text,
  ADD COLUMN IF NOT EXISTS cta_description text,
  ADD COLUMN IF NOT EXISTS pricing_label text;

-- Create dynamic form fields table
CREATE TABLE IF NOT EXISTS public.event_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  field_label text NOT NULL,
  field_key text NOT NULL,
  field_type text NOT NULL DEFAULT 'text' CHECK (field_type IN ('text', 'select', 'date', 'phone', 'email', 'cpf', 'textarea')),
  is_required boolean NOT NULL DEFAULT false,
  placeholder text,
  options jsonb DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, field_key)
);

ALTER TABLE public.event_form_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage form fields"
  ON public.event_form_fields FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Anyone can read form fields for published events"
  ON public.event_form_fields FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_form_fields.event_id
      AND e.status IN ('published', 'closed')
    )
  );
