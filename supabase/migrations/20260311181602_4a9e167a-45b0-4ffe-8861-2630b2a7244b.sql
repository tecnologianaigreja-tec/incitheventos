
ALTER TABLE public.certificate_templates
  ADD COLUMN frame_style text NOT NULL DEFAULT 'classic',
  ADD COLUMN signature_count integer NOT NULL DEFAULT 1,
  ADD COLUMN signature_position text NOT NULL DEFAULT 'center',
  ADD COLUMN signatures jsonb NOT NULL DEFAULT '[{"image_url": null, "name": "", "title": ""}]'::jsonb;

-- Migrate existing data: copy old single signature into signatures array
UPDATE public.certificate_templates
SET signatures = jsonb_build_array(
  jsonb_build_object(
    'image_url', COALESCE(signature_image_url, null),
    'name', COALESCE(signature_name, ''),
    'title', COALESCE(signature_title, '')
  )
)
WHERE signature_image_url IS NOT NULL OR signature_name IS NOT NULL;
