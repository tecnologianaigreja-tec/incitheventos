CREATE TABLE public.label_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  width_mm numeric NOT NULL DEFAULT 90.3,
  height_mm numeric NOT NULL DEFAULT 29,
  elements jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.label_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Select label_template"
  ON public.label_template FOR SELECT
  USING (true);

CREATE POLICY "Admins insert label_template"
  ON public.label_template FOR INSERT TO authenticated
  WITH CHECK (is_admin((SELECT auth.uid())));

CREATE POLICY "Admins update label_template"
  ON public.label_template FOR UPDATE TO authenticated
  USING (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));

CREATE POLICY "Admins delete label_template"
  ON public.label_template FOR DELETE TO authenticated
  USING (is_admin((SELECT auth.uid())));

CREATE TRIGGER trg_label_template_updated_at
  BEFORE UPDATE ON public.label_template
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.label_template (elements) VALUES ('[]'::jsonb);