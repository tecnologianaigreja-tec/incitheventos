
-- Global site settings (single-row table)
CREATE TABLE public.site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  header_type text NOT NULL DEFAULT 'color' CHECK (header_type IN ('color', 'banner')),
  header_color text NOT NULL DEFAULT '220 60% 22%',
  header_title text NOT NULL DEFAULT 'Nossos Eventos',
  header_subtitle text NOT NULL DEFAULT 'Confira os eventos disponíveis e inscreva-se',
  header_banner_url text,
  footer_text text NOT NULL DEFAULT '© 2026 INSIT. Todos os direitos reservados.',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default row
INSERT INTO public.site_settings (id) VALUES (gen_random_uuid());

-- Enable RLS
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Anyone can read site_settings"
  ON public.site_settings FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only admins can update
CREATE POLICY "Admins can update site_settings"
  ON public.site_settings FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
