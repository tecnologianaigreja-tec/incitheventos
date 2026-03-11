
-- Certificate templates table (one per event)
CREATE TABLE public.certificate_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  logo_url text,
  body_text text NOT NULL DEFAULT 'Certificamos que {nome} participou do evento {evento}, realizado no período de {data_inicio} a {data_fim}, com carga horária de {carga_horaria} horas.',
  signature_image_url text,
  signature_name text,
  signature_title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id)
);

ALTER TABLE public.certificate_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage certificate_templates"
  ON public.certificate_templates FOR ALL
  TO public
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Anyone can view certificate_templates"
  ON public.certificate_templates FOR SELECT
  TO public
  USING (true);

-- Storage bucket for certificate assets (logos, signatures)
INSERT INTO storage.buckets (id, name, public) VALUES ('certificate-assets', 'certificate-assets', true);

CREATE POLICY "Admins can upload certificate assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'certificate-assets' AND (SELECT is_admin(auth.uid())));

CREATE POLICY "Admins can update certificate assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'certificate-assets' AND (SELECT is_admin(auth.uid())));

CREATE POLICY "Admins can delete certificate assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'certificate-assets' AND (SELECT is_admin(auth.uid())));

CREATE POLICY "Anyone can view certificate assets"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'certificate-assets');
